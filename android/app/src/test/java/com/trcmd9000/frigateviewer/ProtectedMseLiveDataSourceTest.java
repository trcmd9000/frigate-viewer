package com.trcmd9000.frigateviewer;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.net.Uri;

import androidx.media3.common.C;
import androidx.media3.datasource.DataSpec;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.tls.HandshakeCertificates;
import okhttp3.tls.HeldCertificate;
import okio.ByteString;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;

@RunWith(RobolectricTestRunner.class)
public class ProtectedMseLiveDataSourceTest {
  private MockWebServer server;
  private MediaProfileRegistry registry;
  private String serverCertificatePin;

  @Before
  public void setUp() throws Exception {
    HeldCertificate certificate = new HeldCertificate.Builder()
      .addSubjectAlternativeName("127.0.0.1")
      .build();
    HandshakeCertificates serverCertificates = new HandshakeCertificates.Builder()
      .heldCertificate(certificate)
      .build();
    server = new MockWebServer();
    server.useHttps(serverCertificates.sslSocketFactory(), false);
    server.start();
    serverCertificatePin = fingerprint(certificate);
    registry = new MediaProfileRegistry(testContext());
  }

  @After
  public void tearDown() throws IOException {
    registry.invalidateAll();
    server.shutdown();
  }

  @Test
  public void streamsOrderedMseBytesAfterTheHevcMimeGate() throws Exception {
    byte[] first = new byte[] {0, 0, 0, 8, 'f', 't', 'y', 'p'};
    byte[] second = new byte[] {0, 0, 0, 8, 'm', 'o', 'o', 'v'};
    byte[] third = new byte[] {0, 0, 0, 8, 'm', 'o', 'o', 'f'};
    byte[] fourth = new byte[] {0, 0, 0, 8, 'm', 'd', 'a', 't'};
    AtomicReference<String> control = new AtomicReference<>();
    CountDownLatch requestReceived = new CountDownLatch(1);
    server.enqueue(new MockResponse().withWebSocketUpgrade(new WebSocketListener() {
      @Override
      public void onMessage(WebSocket webSocket, String text) {
        control.set(text);
        requestReceived.countDown();
        webSocket.send("{\"type\":\"mse\",\"value\":\"video/mp4; codecs=\\\"hvc1.1.6.L153.B0\\\"\"}");
        webSocket.send(ByteString.of(first));
        webSocket.send(ByteString.of(second));
        webSocket.send(ByteString.of(third));
        webSocket.send(ByteString.of(fourth));
      }
    }));
    String profileId = registerProfile();
    String handle = registry.createMseMediaUri(profileId, "front:main");
    ProtectedMseLiveDataSource source = new ProtectedMseLiveDataSource(registry);

    assertEquals(C.LENGTH_UNSET, source.open(new DataSpec(Uri.parse(handle))));
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    byte[] buffer = new byte[5];
    while (output.size() < first.length + second.length + third.length + fourth.length) {
      int read = source.read(buffer, 0, buffer.length);
      assertTrue(read > 0);
      output.write(buffer, 0, read);
    }

    assertTrue(requestReceived.await(1, TimeUnit.SECONDS));
    assertEquals(
      "{\"type\":\"mse\",\"value\":\"hvc1.1.6.L153.B0\"}",
      control.get()
    );
    assertArrayEquals(concat(first, second, third, fourth), output.toByteArray());
    source.close();
    try {
      source.read(buffer, 0, buffer.length);
    } catch (IOException expected) {
      assertTrue(expected.getMessage().contains("closed"));
      return;
    }
    throw new AssertionError("Expected reads after close to fail");
  }

  @Test
  public void rejectsIncompleteMseStartupBeforeExposingMediaBytes() throws Exception {
    byte[] ftyp = new byte[] {0, 0, 0, 8, 'f', 't', 'y', 'p'};
    server.enqueue(new MockResponse().withWebSocketUpgrade(new WebSocketListener() {
      @Override
      public void onMessage(WebSocket webSocket, String text) {
        webSocket.send("{\"type\":\"mse\",\"value\":\"video/mp4; codecs=\\\"hvc1.1.6.L153.B0\\\"\"}");
        webSocket.send(ByteString.of(ftyp));
        webSocket.close(1000, null);
      }
    }));
    String profileId = registerProfile();
    ProtectedMseLiveDataSource source = new ProtectedMseLiveDataSource(registry);

    try {
      source.open(new DataSpec(Uri.parse(
        registry.createMseMediaUri(profileId, "front:main")
      )));
    } catch (IOException expected) {
      return;
    } finally {
      source.close();
    }
    throw new AssertionError("Expected incomplete MSE startup to fail");
  }

  private String registerProfile() throws Exception {
    return registry.register(new MediaProfileRegistry.MediaProfileConfig(
      "mse-data-source-" + server.getPort(),
      "https",
      "127.0.0.1",
      server.getPort(),
      "",
      "none",
      "",
      "",
      "",
      serverCertificatePin,
      true
    ));
  }

  private static byte[] concat(byte[]... messages) throws IOException {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    for (byte[] message : messages) {
      output.write(message);
    }
    return output.toByteArray();
  }

  private static Context testContext() {
    return RuntimeEnvironment.getApplication().getApplicationContext();
  }

  private static String fingerprint(HeldCertificate certificate) throws Exception {
    byte[] digest = MessageDigest.getInstance("SHA-256")
      .digest(certificate.certificate().getEncoded());
    StringBuilder result = new StringBuilder(64);
    for (byte value : digest) {
      result.append(String.format("%02x", value & 0xff));
    }
    return result.toString();
  }
}