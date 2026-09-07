package com.trcmd9000.frigateviewer;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;

import javax.net.SocketFactory;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;

@RunWith(RobolectricTestRunner.class)
public class LocalRouteResolverTest {
  @Test
  public void acceptsPrivateUlaAndLinkLocalAddressesOnly() throws Exception {
    assertTrue(LocalRouteResolver.isAllowedAddress(InetAddress.getByName("10.4.0.2")));
    assertTrue(LocalRouteResolver.isAllowedAddress(InetAddress.getByName("192.168.1.5")));
    assertTrue(LocalRouteResolver.isAllowedAddress(InetAddress.getByName("fd00::2")));
    assertTrue(LocalRouteResolver.isAllowedAddress(InetAddress.getByName("fe80::2")));
    assertFalse(LocalRouteResolver.isAllowedAddress(InetAddress.getByName("8.8.8.8")));
    assertFalse(LocalRouteResolver.isAllowedAddress(InetAddress.getByName("2001:db8::2")));
  }

  @Test
  public void rejectsPublicConnectedPeersSeparatelyFromDnsPolicy() throws Exception {
    try {
      LocalRouteResolver.validateConnectedPeer(InetAddress.getByName("203.0.113.4"));
    } catch (LocalRouteResolver.RouteFailureException error) {
      assertEquals(LocalRouteResolver.FailureCode.PUBLIC_CONNECTED_PEER, error.code);
      return;
    }
    throw new AssertionError("Expected public connected peer rejection");
  }

  @Test
  public void localTlsUsesItsOwnAliasAndTrustPolicy() throws Exception {
    String externalAlias = "external-only";
    LocalRouteResolver.RouteConfig config = new LocalRouteResolver.RouteConfig(
      "profile",
      "https://remote.example:5000/",
      true,
      "https",
      "10.0.0.4",
      5000,
      "",
      "frigate",
      "user",
      "password",
      true,
      "local-only",
      true
    );

    assertEquals("local-only", config.localClientCertAlias);
    assertTrue(!externalAlias.equals(config.localClientCertAlias));
    assertTrue(config.localAllowSelfSignedServer);
    LocalRouteResolver.validateLocalSecurity(config);
  }

  @Test
  public void missingLocalAliasFailsClosedBeforeHealthcheck() throws Exception {
    LocalRouteResolver.RouteConfig config = new LocalRouteResolver.RouteConfig(
      "profile",
      "https://remote.example:5000/",
      true,
      "https",
      "10.0.0.4",
      5000,
      "",
      "frigate",
      "user",
      "password",
      true,
      "",
      false
    );
    try {
      LocalRouteResolver.validateLocalSecurity(config);
    } catch (LocalRouteResolver.RouteFailureException error) {
      assertEquals(LocalRouteResolver.FailureCode.TLS_FAILED, error.code);
      return;
    }
    throw new AssertionError("Expected missing local alias rejection");
  }

  @Test
  public void generationChangesOnForegroundOrNetworkInvalidation() {
    LocalRouteResolver resolver = new LocalRouteResolver(RuntimeEnvironment.getApplication());
    long initial = resolver.generation();
    resolver.invalidate();
    assertNotEquals(initial, resolver.generation());
    long next = resolver.generation();
    resolver.invalidate();
    assertNotEquals(next, resolver.generation());
  }

  @Test
  public void cleartextLocalEndpointsNeverBecomeApiRoutes() throws Exception {
    LocalRouteResolver resolver = new LocalRouteResolver(RuntimeEnvironment.getApplication());
    LocalRouteResolver.RouteConfig config = new LocalRouteResolver.RouteConfig(
      "profile",
      "https://remote.example:5000/",
      true,
      "http",
      "10.0.0.4",
      5000,
      "",
      "frigate",
      "user",
      "password",
      false,
      "",
      false
    );

    LocalRouteResolver.Resolution result = resolver.resolve(config, "GET");
    assertFalse(result.local);
    assertEquals(LocalRouteResolver.FailureCode.HTTP_LOCAL_API_DISABLED, result.failure);
    assertEquals("https://remote.example:5000/", result.baseUrl);
  }

  @Test
  public void onlySafeMethodsAreEligibleForFallback() {
    assertTrue(LocalRouteResolver.isSafeRead("GET"));
    assertTrue(LocalRouteResolver.isSafeRead("HEAD"));
    assertTrue(LocalRouteResolver.isSafeRead("OPTIONS"));
    assertFalse(LocalRouteResolver.isSafeRead("POST"));
    assertFalse(LocalRouteResolver.isSafeRead("DELETE"));
  }

  @Test
  public void rtspSocketFactoryUsesAConnectedPrivatePeer() throws Exception {
    try (ServerSocket listener =
        new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) {
      SocketFactory factory = LocalRouteResolver.privateOnlySocketFactory();
      try (Socket socket = factory.createSocket("127.0.0.1", listener.getLocalPort())) {
        assertTrue(socket.isConnected());
        assertTrue(LocalRouteResolver.isAllowedAddress(socket.getInetAddress()));
      }
    }
  }

  @Test
  public void rtspConnectionAndRtpFallbackTimeoutsAreBounded() {
    assertTrue(LocalRouteResolver.RTSP_PEER_CONNECT_TIMEOUT_MS <= 5_000);
    assertTrue(RtspMediaPolicy.RTP_FALLBACK_TIMEOUT_MS <= 5_000L);
  }
}
