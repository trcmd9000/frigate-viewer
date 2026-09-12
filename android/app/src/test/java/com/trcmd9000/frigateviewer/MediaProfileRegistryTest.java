package com.trcmd9000.frigateviewer;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotSame;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.net.Uri;

import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSpec;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import okhttp3.mockwebserver.Dispatcher;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;
import okhttp3.Credentials;
import okhttp3.Cookie;
import okhttp3.HttpUrl;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;

@RunWith(RobolectricTestRunner.class)
public class MediaProfileRegistryTest {
  private MockWebServer server;
  private MediaProfileRegistry registry;

  @Before
  public void setUp() throws IOException {
    server = new MockWebServer();
    server.start();
    registry = new MediaProfileRegistry(testContext());
  }

  @After
  public void tearDown() throws IOException {
    registry.invalidateAll();
    server.shutdown();
  }

  @Test
  public void routesHlsResourcesThroughTheProfileAndPreservesRanges() throws Exception {
    server.enqueue(new MockResponse().setResponseCode(200).setBody("abcdef"));
    String profileId = register("none");
    String uri = registry.createMediaUri(profileId, "/vod/event/master.m3u8");
    DataSource source = new ProtectedMediaDataSource(registry);

    long length = source.open(
      new DataSpec.Builder()
        .setUri(Uri.parse(uri))
        .setPosition(2)
        .setLength(3)
        .build()
    );
    byte[] bytes = new byte[3];
    assertEquals(3, length);
    assertEquals(3, source.read(bytes, 0, bytes.length));
    assertEquals("cde", new String(bytes));
    source.close();

    RecordedRequest request = server.takeRequest();
    assertEquals("/vod/event/master.m3u8", request.getPath());
    assertEquals("bytes=2-4", request.getHeader("Range"));

    MediaProfileRegistry.ResolvedMediaRequest absolute =
      registry.resolve(Uri.parse(
        "http://127.0.0.1:" + server.getPort() + "/vod/event/segment.ts"
      ));
    assertEquals("/vod/event/segment.ts", absolute.url.encodedPath());
  }

  @Test
  public void rejectsUnconsentedRemoteHttpProfiles() throws Exception {
    try {
      registry.register(new MediaProfileRegistry.MediaProfileConfig(
        "unconsented-http-" + server.getPort(),
        "http",
        "127.0.0.1",
        server.getPort(),
        "",
        "none",
        "",
        "",
        "",
        false
      ));
    } catch (IOException expected) {
      assertTrue(expected.getMessage().contains("consent"));
      return;
    }
    throw new AssertionError("Expected remote HTTP consent to be required");
  }

  @Test
  public void prependsConfiguredServerBasePathToApiMediaResources() throws Exception {
    server.enqueue(new MockResponse().setResponseCode(200).setBody("m3u8"));
    String profileId = registry.register(
      new MediaProfileRegistry.MediaProfileConfig(
        "base-profile-" + server.getPort(),
        "http",
        "127.0.0.1",
        server.getPort(),
        "/frigate",
        "none",
        "",
        "",
        "",
        false,
        true
      )
    );
    DataSource source = new ProtectedMediaDataSource(registry);
    source.open(new DataSpec(Uri.parse(
      registry.createMediaUri(profileId, "/vod/event/master.m3u8")
    )));
    source.close();

    assertEquals("/frigate/vod/event/master.m3u8", server.takeRequest().getPath());
  }

  @Test
  public void buildsFixedProtectedLiveSocketRequestWithEncodedStream() throws Exception {
    String profileId = registry.register(
      new MediaProfileRegistry.MediaProfileConfig(
        "live-profile-" + server.getPort(),
        "http",
        "127.0.0.1",
        server.getPort(),
        "/frigate",
        "basic",
        "viewer",
        "synthetic-password",
        "",
        false,
        true
      )
    );

    MediaProfileRegistry.LiveSocketRequest live =
      registry.liveSocketRequest(profileId, "front:main");

    assertEquals(
      "/frigate/live/webrtc/api/ws?src=front%3Amain",
      live.request.url().encodedPath() + "?" + live.request.url().encodedQuery()
    );
    assertEquals(
      Credentials.basic("viewer", "synthetic-password"),
      live.request.header("Authorization")
    );
  }

  @Test
  public void buildsFixedProtectedMseSocketRequestWithEncodedStream() throws Exception {
    String profileId = registry.register(
      new MediaProfileRegistry.MediaProfileConfig(
        "mse-profile-" + server.getPort(),
        "http",
        "127.0.0.1",
        server.getPort(),
        "/frigate",
        "basic",
        "viewer",
        "synthetic-password",
        "",
        false,
        true
      )
    );

    MediaProfileRegistry.LiveSocketRequest mse =
      registry.mseSocketRequest(profileId, "front:main");

    assertEquals(
      "/frigate/live/mse/api/ws?src=front%3Amain",
      mse.request.url().encodedPath() + "?" + mse.request.url().encodedQuery()
    );
    assertEquals(
      Credentials.basic("viewer", "synthetic-password"),
      mse.request.header("Authorization")
    );
  }

  @Test
  public void resolvesOpaqueProtectedMseMediaHandles() throws Exception {
    String profileId = registry.register(
      new MediaProfileRegistry.MediaProfileConfig(
        "mse-handle-profile-" + server.getPort(),
        "http",
        "127.0.0.1",
        server.getPort(),
        "/frigate",
        "basic",
        "viewer",
        "synthetic-password",
        "",
        false,
        true
      )
    );
    String handle = registry.createMseMediaUri(profileId, "front:main");

    assertEquals(
      "frigate-media://" + profileId + "/mse/front%3Amain",
      handle
    );
    MediaProfileRegistry.LiveSocketRequest mse =
      registry.mseSocketRequest(Uri.parse(handle));
    assertEquals(
      "/frigate/live/mse/api/ws?src=front%3Amain",
      mse.request.url().encodedPath() + "?" + mse.request.url().encodedQuery()
    );
    assertEquals(
      Credentials.basic("viewer", "synthetic-password"),
      mse.request.header("Authorization")
    );
  }

  @Test
  public void rejectsInvalidProtectedMseMediaHandles() throws Exception {
    String profileId = register("none");

    try {
      registry.mseSocketRequest(Uri.parse(
        "frigate-media://" + profileId + "/vod/front"
      ));
    } catch (IOException expected) {
      assertTrue(expected.getMessage().contains("MSE media handle"));
      return;
    }
    throw new AssertionError("Expected an invalid MSE media handle to be rejected");
  }

  @Test
  public void rejectsInvalidProtectedLiveStreamNames() throws Exception {
    String profileId = register("none");

    try {
      registry.liveSocketRequest(profileId, "../front");
    } catch (IOException expected) {
      assertTrue(expected.getMessage().contains("stream name"));
      return;
    }
    throw new AssertionError("Expected an invalid live stream name to be rejected");
  }

  @Test
  public void sharesTheAuthenticatedApiSessionWithProtectedLiveMedia() throws Exception {
    String profileKey = "shared-live-session-" + server.getPort();
    String scopedIdentity = ClientCertModule.authenticationScopedServerIdentity(
      profileKey,
      "frigate",
      "viewer",
      "synthetic-password"
    );
    ClientCertModule.NativeClientSession apiSession =
      ClientCertModule.getSharedClientSession(
        testContext(),
        null,
        scopedIdentity,
        false
      );
    String profileId = registry.register(
      new MediaProfileRegistry.MediaProfileConfig(
        profileKey,
        "http",
        "127.0.0.1",
        server.getPort(),
        "",
        "frigate",
        "viewer",
        "synthetic-password",
        "",
        false,
        true
      )
    );

    assertSame(
      apiSession,
      registry.liveSocketRequest(profileId, "front").profile.session
    );
  }

  @Test
  public void retriesOneFrigate401AfterASingleFlightLogin() throws Exception {
    AtomicInteger mediaRequests = new AtomicInteger();
    AtomicInteger loginRequests = new AtomicInteger();
    server.setDispatcher(new Dispatcher() {
      @Override
      public MockResponse dispatch(RecordedRequest request) {
        if ("/api/login".equals(request.getPath())) {
          loginRequests.incrementAndGet();
          return new MockResponse().setResponseCode(200).setBody("ok");
        }
        if (mediaRequests.getAndIncrement() == 0) {
          return new MockResponse().setResponseCode(401);
        }
        return new MockResponse().setResponseCode(200).setBody("m3u8");
      }
    });
    String profileId = register("frigate");
    DataSource source = new ProtectedMediaDataSource(registry);
    long length = source.open(new DataSpec(Uri.parse(
      registry.createMediaUri(profileId, "/vod/event/master.m3u8")
    )));

    assertEquals(4, length);
    assertEquals(1, loginRequests.get());
    assertEquals(2, mediaRequests.get());
    source.close();
  }

  @Test
  public void rejectsRedirectsWithoutFollowingLocation() throws Exception {
    server.enqueue(
      new MockResponse()
        .setResponseCode(302)
      .addHeader("Location", server.url("/vod/other"))
    );
    String profileId = register("none");
    DataSource source = new ProtectedMediaDataSource(registry);

    try {
      source.open(new DataSpec(Uri.parse(
        registry.createMediaUri(profileId, "/vod/event/master.m3u8")
      )));
    } catch (MediaProfileRegistry.ProtectedMediaException error) {
      assertEquals(302, error.statusCode);
      assertTrue(error.getMessage().contains("redirect"));
      source.close();
      return;
    }
    throw new AssertionError("Expected the protected redirect to be rejected");
  }

  @Test
  public void rejectsCrossHostAndHttpsToHttpResourceRequests() throws Exception {
    register("none");
    boolean crossHostRejected = false;
    try {
      registry.resolve(Uri.parse("http://other.example/api/master.m3u8"));
    } catch (IOException expected) {
      assertTrue(expected.getMessage().contains("host"));
      crossHostRejected = true;
    }
    assertTrue(crossHostRejected);

    MediaProfileRegistry httpsRegistry = new MediaProfileRegistry(testContext());
    httpsRegistry.register(
      new MediaProfileRegistry.MediaProfileConfig(
        "https-profile-" + server.getPort(),
        "https",
        "127.0.0.1",
        server.getPort(),
        "",
        "none",
        "",
        "",
        "",
        false
      )
    );
    try {
      httpsRegistry.resolve(Uri.parse(
        "http://127.0.0.1:" + server.getPort() + "/api/master.m3u8"
      ));
    } catch (IOException expected) {
      assertTrue(expected.getMessage().contains("downgrade"));
      return;
    }
    throw new AssertionError("Expected the HTTPS profile to reject the HTTP downgrade");
  }

  @Test
  public void rejectsAbsoluteHttpWhenAnHttpsProfileExistsForTheHost() throws Exception {
    registry.register(
      new MediaProfileRegistry.MediaProfileConfig(
        "http-origin",
        "http",
        "media.example",
        80,
        "",
        "none",
        "",
        "",
        "",
        false,
        true
      )
    );
    registry.register(
      new MediaProfileRegistry.MediaProfileConfig(
        "https-origin",
        "https",
        "media.example",
        443,
        "",
        "none",
        "",
        "",
        "",
        false
      )
    );

    try {
      registry.resolve(Uri.parse("http://media.example/vod/event/master.m3u8"));
    } catch (IOException expected) {
      assertTrue(expected.getMessage().contains("downgrade"));
      return;
    }
    throw new AssertionError("Expected the absolute HTTP resource to be rejected");
  }

  @Test
  public void localRtspHandleIsOpaqueAndConsumedByTheNativeResolver() throws Exception {
    String profileId = registry.register(
      new MediaProfileRegistry.MediaProfileConfig(
        "rtsp-profile-" + server.getPort(),
        "http",
        "127.0.0.1",
        server.getPort(),
        "",
        "frigate",
        "viewer",
        "secret",
        "",
        false,
        true,
        "http",
        "127.0.0.1",
        server.getPort(),
        "",
        false,
        "",
        false,
        true,
        server.getPort(),
        false
      )
    );

    String opaque = registry.createRtspMediaUri(profileId, "front_main");
    assertTrue(opaque.contains("/rtsp/"));
    assertTrue(!opaque.contains("127.0.0.1"));
    String resolved = registry.resolveRtspMediaUri(Uri.parse(opaque));
    assertEquals(
      "rtsp://127.0.0.1:" + server.getPort() + "/front_main",
      resolved
    );
    try {
      registry.resolveRtspMediaUri(Uri.parse(opaque));
    } catch (IOException expected) {
      return;
    }
    throw new AssertionError("Expected the opaque RTSP handle to be one-shot");
  }

  @Test
  public void credentialChangesRotateTheProtectedMediaProfile() throws Exception {
    String profileKey = "credential-profile-" + server.getPort();
    String first = registry.register(
      profileConfig(profileKey, "viewer", "first-password")
    );
    String unchanged = registry.register(
      profileConfig(profileKey, "viewer", "first-password")
    );
    String changed = registry.register(
      profileConfig(profileKey, "viewer", "second-password")
    );
    String restored = registry.register(
      profileConfig(profileKey, "viewer", "first-password")
    );

    assertEquals(first, unchanged);
    assertTrue(!first.equals(changed));
    assertTrue(!first.equals(restored));
    try {
      registry.createMediaUri(first, "/vod/event/master.m3u8");
    } catch (IOException expected) {
      assertTrue(expected.getMessage().contains("profile"));
      registry.createMediaUri(restored, "/vod/event/master.m3u8");
      return;
    }
    throw new AssertionError("Expected the previous credential profile to be retired");
  }

  @Test
  public void keepsSameOriginProfilesIndependentByKeyPathAndCredentials() throws Exception {
    String first = registry.register(
      profileConfig("same-origin-first", "/first", "alice", "first-password")
    );
    String second = registry.register(
      profileConfig("same-origin-second", "/second", "bob", "second-password")
    );

    assertNotSame(first, second);
    MediaProfileRegistry.ResolvedMediaRequest firstRequest = registry.resolve(
      Uri.parse(registry.createMediaUri(first, "/vod/event/master.m3u8"))
    );
    MediaProfileRegistry.ResolvedMediaRequest secondRequest = registry.resolve(
      Uri.parse(registry.createMediaUri(second, "/vod/event/master.m3u8"))
    );
    assertEquals("/first/vod/event/master.m3u8", firstRequest.url.encodedPath());
    assertEquals("/second/vod/event/master.m3u8", secondRequest.url.encodedPath());
    assertEquals(
      Credentials.basic("alice", "first-password"),
      registry.authenticatedRequest(firstRequest.profile, firstRequest.url)
        .build()
        .header("Authorization")
    );
    assertEquals(
      Credentials.basic("bob", "second-password"),
      registry.authenticatedRequest(secondRequest.profile, secondRequest.url)
        .build()
        .header("Authorization")
    );
    assertTrue(registry.hasProfile(first));
    assertTrue(registry.hasProfile(second));
  }

  @Test
  public void keepsAnExistingRtspHandleWhenAnotherSameOriginProfileIsRegistered()
    throws Exception {
    String first = registry.register(rtspProfileConfig(
      "same-origin-rtsp-first",
      "first-password"
    ));
    String handleUri = registry.createRtspMediaUri(first, "front_main");

    String second = registry.register(
      profileConfig("same-origin-rtsp-second", "/second", "bob", "second-password")
    );

    assertTrue(registry.hasProfile(first));
    assertTrue(registry.hasProfile(second));
    assertEquals(
      "rtsp://127.0.0.1:" + server.getPort() + "/front_main",
      registry.resolveRtspMediaUri(Uri.parse(handleUri))
    );
  }

  @Test
  public void retiresThePreviousProfileAndItsCookieAndRtspHandleOnRotation()
    throws Exception {
    String profileKey = "rotating-profile-" + server.getPort();
    String first = registry.register(rtspProfileConfig(profileKey, "first-password"));
    String handleUri = registry.createRtspMediaUri(first, "front_main");
    MediaProfileRegistry.ResolvedMediaRequest firstRequest = registry.resolve(
      Uri.parse(registry.createMediaUri(first, "/vod/event/master.m3u8"))
    );
    HttpUrl cookieUrl = server.url("/api/login");
    firstRequest.profile.session.client.cookieJar().saveFromResponse(
      cookieUrl,
      java.util.Collections.singletonList(
        new Cookie.Builder()
          .name("session")
          .value("old-session")
          .domain(cookieUrl.host())
          .path("/")
          .build()
      )
    );

    String second = registry.register(rtspProfileConfig(profileKey, "second-password"));

    assertTrue(!first.equals(second));
    assertTrue(!registry.hasProfile(first));
    try {
      registry.resolveRtspMediaUri(Uri.parse(handleUri));
    } catch (IOException expected) {
      assertTrue(expected.getMessage().contains("profile") ||
        expected.getMessage().contains("handle"));
      MediaProfileRegistry.ResolvedMediaRequest secondRequest = registry.resolve(
        Uri.parse(registry.createMediaUri(second, "/vod/event/master.m3u8"))
      );
      assertTrue(
        secondRequest.profile.session.client.cookieJar()
          .loadForRequest(cookieUrl)
          .isEmpty()
      );
      return;
    }
    throw new AssertionError("Expected the previous RTSP handle to be retired");
  }

  @Test
  public void stableLogicalProfileIdRetiresAChangedConfigurationKey() throws Exception {
    String logicalProfileId = "stable-profile-" + server.getPort();
    String first = registry.register(new MediaProfileRegistry.MediaProfileConfig(
      logicalProfileId,
      "configuration-one",
      "http",
      "127.0.0.1",
      server.getPort(),
      "/first",
      "basic",
      "first-user",
      "first-password",
      "",
      false,
      true
    ));
    AtomicReference<String> retiredProfile = new AtomicReference<>();
    String second = registry.register(new MediaProfileRegistry.MediaProfileConfig(
      logicalProfileId,
      "configuration-two",
      "http",
      "127.0.0.1",
      server.getPort(),
      "/second",
      "basic",
      "second-user",
      "second-password",
      "",
      false,
      true
    ), retiredProfile::set);

    assertTrue(!first.equals(second));
    assertEquals(first, retiredProfile.get());
    assertTrue(!registry.hasProfile(first));
    assertEquals(
      "/second/vod/event/master.m3u8",
      registry.resolve(
        Uri.parse(registry.createMediaUri(second, "/vod/event/master.m3u8"))
      ).url.encodedPath()
    );
    try {
      registry.createMediaUri(first, "/vod/event/master.m3u8");
    } catch (IOException expected) {
      return;
    }
    throw new AssertionError("Expected the old logical profile configuration to retire");
  }

  @Test
  public void unregisterRetiresOnlyTheRequestedProfileAndIsIdempotent() throws Exception {
    MediaProfileRegistry.MediaProfileConfig firstConfig =
      profileConfig("unregister-first", "alice", "first-password");
    MediaProfileRegistry.MediaProfileConfig secondConfig =
      profileConfig("unregister-second", "bob", "second-password");
    String first = registry.register(firstConfig);
    String second = registry.register(secondConfig);

    registry.unregister(firstConfig.profileKey, null);
    registry.unregister(firstConfig.profileKey, null);

    assertTrue(!registry.hasProfile(first));
    assertTrue(registry.hasProfile(second));
  }

  @Test
  public void invalidationWinsOverDelayedRegistrationWithoutTouchingOtherProfiles()
    throws Exception {
    MediaProfileRegistry.MediaProfileConfig delayedConfig =
      profileConfig("delayed-registration", "alice", "delayed-password");
    MediaProfileRegistry.MediaProfileConfig otherConfig =
      profileConfig("delayed-registration-other", "bob", "other-password");
    MediaProfileRegistry.RegistrationToken delayed =
      registry.reserveRegistration(delayedConfig.profileKey);
    String other = registry.register(otherConfig);

    registry.unregister(delayedConfig.profileKey, null);

    try {
      registry.register(delayedConfig, null, delayed);
    } catch (IOException expected) {
      assertTrue(expected.getMessage().contains("retired"));
      assertTrue(!registry.hasProfile(delayedConfig.profileKey));
      assertTrue(registry.hasProfile(other));
      registry.completeRegistration(delayed);
      // The delayed key is cleaned up, while the unrelated active profile
      // intentionally keeps its own generation entry alive.
      assertEquals(1, registry.registrationGenerationEntryCount());
      assertEquals(0, registry.pendingRegistrationEntryCount());
      registry.unregister(otherConfig.profileKey, null);
      assertEquals(0, registry.registrationGenerationEntryCount());
      String restored = registry.register(delayedConfig);
      assertTrue(registry.hasProfile(restored));
      return;
    }
    throw new AssertionError("Expected the delayed registration to be retired");
  }

  @Test
  public void repeatedRegisterDeleteCyclesReturnRegistrationMapsToBaseline() throws Exception {
    assertEquals(0, registry.registrationGenerationEntryCount());
    assertEquals(0, registry.pendingRegistrationEntryCount());

    for (int index = 0; index < 40; index += 1) {
      MediaProfileRegistry.MediaProfileConfig config =
        profileConfig("cycle-" + index, "viewer", "cycle-password");
      String profileId = registry.register(config);
      assertTrue(registry.hasProfile(profileId));
      registry.unregister(config.profileKey, null);
      assertTrue(!registry.hasProfile(profileId));
      assertEquals(0, registry.registrationGenerationEntryCount());
      assertEquals(0, registry.pendingRegistrationEntryCount());
    }
  }

  @Test
  public void invalidateAllClearsPendingTokensAndRejectsLateLifecycleTasks()
    throws Exception {
    MediaProfileRegistry.MediaProfileConfig config =
      profileConfig("shutdown-pending", "viewer", "shutdown-password");
    MediaProfileRegistry.RegistrationToken token =
      registry.reserveRegistration(config.profileKey);

    assertEquals(1, registry.registrationGenerationEntryCount());
    assertEquals(1, registry.pendingRegistrationEntryCount());
    registry.invalidateAll();
    assertEquals(0, registry.registrationGenerationEntryCount());
    assertEquals(0, registry.pendingRegistrationEntryCount());
    try {
      registry.reserveRegistration("late-after-shutdown");
    } catch (IllegalStateException expected) {
      // Lifecycle invalidation permanently closes this registry instance.
      // Continue with the stale token assertion below.
    }
    if (registry.registrationGenerationEntryCount() != 0) {
      throw new AssertionError("Lifecycle invalidation reopened registration state");
    }

    try {
      registry.register(config, null, token);
    } catch (IOException expected) {
      assertTrue(expected.getMessage().contains("retired"));
      registry.completeRegistration(token);
      assertEquals(0, registry.registrationGenerationEntryCount());
      assertEquals(0, registry.pendingRegistrationEntryCount());
      return;
    }
    throw new AssertionError("Expected the lifecycle task to be retired");
  }

  @Test
  public void returningToAnEarlierCredentialScopeCreatesAFreshSession() throws Exception {
    String baseIdentity = "session-scope-" + server.getPort();
    String firstIdentity = ClientCertModule.authenticationScopedServerIdentity(
      baseIdentity,
      "frigate",
      "viewer",
      "first-password"
    );
    String secondIdentity = ClientCertModule.authenticationScopedServerIdentity(
      baseIdentity,
      "frigate",
      "viewer",
      "second-password"
    );
    ClientCertModule.NativeClientSession first =
      ClientCertModule.getSharedClientSession(
        testContext(),
        null,
        firstIdentity,
        false
      );
    ClientCertModule.getSharedClientSession(
      testContext(),
      null,
      secondIdentity,
      false
    );
    ClientCertModule.NativeClientSession restored =
      ClientCertModule.getSharedClientSession(
        testContext(),
        null,
        firstIdentity,
        false
      );

    assertNotSame(first, restored);
    ClientCertModule.removeSharedClientSession(null, firstIdentity, false);
  }

  @Test
  public void isolatesLocalSessionsByProfileAndReusesOnlyTheSameScope() throws Exception {
    String localOrigin = "{\"route\":\"local\",\"profileId\":\"profile-a\","
      + "\"endpoint\":\"https%3A%2F%2F192.168.1.20%3A8971\"}";
    String firstIdentity = ClientCertModule.authenticationScopedServerIdentity(
      localOrigin,
      "frigate",
      "viewer",
      "same-password"
    );
    ClientCertModule.NativeClientSession sameProfile =
      ClientCertModule.getSharedClientSession(testContext(), null, firstIdentity, false);
    assertSame(
      sameProfile,
      ClientCertModule.getSharedClientSession(
        testContext(),
        null,
        firstIdentity,
        false
      )
    );

    String otherProfile = ClientCertModule.authenticationScopedServerIdentity(
      localOrigin.replace("profile-a", "profile-b"),
      "frigate",
      "viewer",
      "same-password"
    );
    assertNotSame(
      sameProfile,
      ClientCertModule.getSharedClientSession(
        testContext(),
        null,
        otherProfile,
        false
      )
    );
    ClientCertModule.removeSharedClientSession(null, firstIdentity, false);
    ClientCertModule.removeSharedClientSession(null, otherProfile, false);
  }

  @Test
  public void rotatesAndRetiresThePreviousLocalCredentialScope() throws Exception {
    String localOrigin =
      "{\"route\":\"local\",\"profileId\":\"profile-rotation\","
      + "\"endpoint\":\"https%3A%2F%2F192.168.1.20%3A8971\"}";
    String firstIdentity = ClientCertModule.authenticationScopedServerIdentity(
      localOrigin,
      "frigate",
      "viewer",
      "first-password"
    );
    String secondIdentity = ClientCertModule.authenticationScopedServerIdentity(
      localOrigin,
      "frigate",
      "viewer",
      "second-password"
    );
    ClientCertModule.NativeClientSession first =
      ClientCertModule.getSharedClientSession(testContext(), null, firstIdentity, false);
    ClientCertModule.NativeClientSession second =
      ClientCertModule.getSharedClientSession(testContext(), null, secondIdentity, false);

    assertNotSame(first, second);
    assertTrue(first.client.dispatcher().executorService().isShutdown());

    ClientCertModule.NativeClientSession restored =
      ClientCertModule.getSharedClientSession(testContext(), null, firstIdentity, false);
    assertNotSame(first, restored);
    assertTrue(second.client.dispatcher().executorService().isShutdown());
    ClientCertModule.removeSharedClientSession(null, firstIdentity, false);
  }

  @Test
  public void rotatesTheLocalSessionWhenAuthenticationModeChanges() throws Exception {
    String localOrigin =
      "{\"route\":\"local\",\"profileId\":\"profile-auth-mode\","
      + "\"auth\":\"frigate\",\"endpoint\":\"https%3A%2F%2F192.168.1.20%3A8971\"}";
    String frigateIdentity = ClientCertModule.authenticationScopedServerIdentity(
      localOrigin,
      "frigate",
      "viewer",
      "same-password"
    );
    String basicIdentity = ClientCertModule.authenticationScopedServerIdentity(
      localOrigin.replace("\"frigate\"", "\"basic\""),
      "basic",
      "viewer",
      "same-password"
    );
    ClientCertModule.NativeClientSession frigate =
      ClientCertModule.getSharedClientSession(testContext(), null, frigateIdentity, false);
    ClientCertModule.NativeClientSession basic =
      ClientCertModule.getSharedClientSession(testContext(), null, basicIdentity, false);

    assertNotSame(frigate, basic);
    assertTrue(frigate.client.dispatcher().executorService().isShutdown());
    ClientCertModule.removeSharedClientSession(null, basicIdentity, false);
  }

  private String register(String auth) throws Exception {
    return register("http", auth);
  }

  private String register(String protocol, String auth) throws Exception {
    return registry.register(
      new MediaProfileRegistry.MediaProfileConfig(
        "test-profile-" + auth + "-" + server.getPort(),
        protocol,
        "127.0.0.1",
        server.getPort(),
        "",
        auth,
        "viewer",
        "synthetic-password",
        "",
        false,
        true
      )
    );
  }

  private MediaProfileRegistry.MediaProfileConfig profileConfig(
    String profileKey,
    String username,
    String password
  ) {
    return new MediaProfileRegistry.MediaProfileConfig(
      profileKey,
      profileKey,
      "http",
      "127.0.0.1",
      server.getPort(),
      "",
      "frigate",
      username,
      password,
      "",
      false,
      true
    );
  }

  private MediaProfileRegistry.MediaProfileConfig profileConfig(
    String profileKey,
    String basePath,
    String username,
    String password
  ) {
    return new MediaProfileRegistry.MediaProfileConfig(
      profileKey,
      profileKey,
      "http",
      "127.0.0.1",
      server.getPort(),
      basePath,
      "basic",
      username,
      password,
      "",
      false,
      true
    );
  }

  private MediaProfileRegistry.MediaProfileConfig rtspProfileConfig(
    String profileKey,
    String password
  ) {
    return new MediaProfileRegistry.MediaProfileConfig(
      profileKey,
      profileKey,
      "http",
      "127.0.0.1",
      server.getPort(),
      "",
      "frigate",
      "viewer",
      password,
      "",
      false,
      true,
      true,
      "http",
      "127.0.0.1",
      server.getPort(),
      "",
      false,
      "",
      false,
      true,
      server.getPort(),
      false
    );
  }

  private static Context testContext() {
    return RuntimeEnvironment.getApplication();
  }
}
