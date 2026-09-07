package com.trcmd9000.frigateviewer;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.net.InetAddress;

import org.junit.Test;

public class RtspMediaPolicyTest {
  @Test
  public void defaultsToTheGo2RtcPortAndRejectsInvalidNames() throws Exception {
    assertTrue(RtspMediaPolicy.buildUrl(
      "192.168.1.20", 0, "front_main", "", "", false
    ).equals("rtsp://192.168.1.20:8554/front_main"));
    try {
      RtspMediaPolicy.validateStreamName("../front");
    } catch (java.io.IOException expected) {
      return;
    }
    throw new AssertionError("Expected traversal in an RTSP stream name to fail");
  }

  @Test
  public void credentialsAreOnlyAddedAfterExplicitConsent() throws Exception {
    String anonymous = RtspMediaPolicy.buildUrl(
      "fd00::20", 8554, "front", "viewer", "secret", false
    );
    String approved = RtspMediaPolicy.buildUrl(
      "fd00::20", 8554, "front", "viewer", "secret", true
    );
    assertFalse(anonymous.contains("secret"));
    assertTrue(approved.contains("viewer:secret@"));
  }

  @Test
  public void connectedPeersUseTheSamePrivateAddressPolicy() throws Exception {
    assertTrue(RtspMediaPolicy.hasPrivatePeer(InetAddress.getByName("10.0.0.4")));
    assertTrue(RtspMediaPolicy.hasPrivatePeer(InetAddress.getByName("fe80::4")));
    assertFalse(RtspMediaPolicy.hasPrivatePeer(InetAddress.getByName("1.1.1.1")));
  }

  @Test
  public void consentIsRequiredForEveryAuthenticatedMode() {
    assertTrue(RtspMediaPolicy.shouldUseCredentials("frigate", true));
    assertTrue(RtspMediaPolicy.shouldUseCredentials("basic", true));
    assertFalse(RtspMediaPolicy.shouldUseCredentials("frigate", false));
    assertFalse(RtspMediaPolicy.shouldUseCredentials("none", true));
  }
}
