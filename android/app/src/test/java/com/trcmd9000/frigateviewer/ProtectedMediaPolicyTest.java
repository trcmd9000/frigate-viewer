package com.trcmd9000.frigateviewer;

import androidx.media3.common.C;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ProtectedMediaPolicyTest {
  @Test
  public void onlyFrigate401CanJoinTheSingleRetry() {
    assertTrue(ProtectedMediaPolicy.shouldReauthenticate("frigate", 401, false));
    assertFalse(ProtectedMediaPolicy.shouldReauthenticate("frigate", 401, true));
    assertFalse(ProtectedMediaPolicy.shouldReauthenticate("basic", 401, false));
    assertFalse(ProtectedMediaPolicy.shouldReauthenticate("frigate", 403, false));
  }

  @Test
  public void redirectsAreAlwaysRejectedByProtectedTransport() {
    assertTrue(ProtectedMediaPolicy.isRedirectRejected(301));
    assertTrue(ProtectedMediaPolicy.isRedirectRejected(302));
    assertTrue(ProtectedMediaPolicy.isRedirectRejected(307));
    assertFalse(ProtectedMediaPolicy.isRedirectRejected(200));
    assertFalse(ProtectedMediaPolicy.isRedirectRejected(401));
  }

  @Test
  public void protectedResourcesUseTheOpaqueScheme() {
    assertTrue(
      ProtectedMediaPolicy.isOpaqueMediaUri(
        "frigate-media://0123456789abcdef0123456789abcdef/api/master.m3u8"
      )
    );
    assertFalse(
      ProtectedMediaPolicy.isOpaqueMediaUri(
        "https://server.example/api/master.m3u8"
      )
    );
  }

  @Test
  public void ignoredRangeSubtractsSkippedBytesFromAvailableLength() {
    assertEquals(
      2,
      ProtectedMediaPolicy.responseBytesRemaining(200, 4, C.LENGTH_UNSET, 6)
    );
    assertEquals(
      2,
      ProtectedMediaPolicy.responseBytesRemaining(200, 4, 3, 6)
    );
  }

  @Test
  public void partialContentLengthAlreadyDescribesTheReturnedRange() {
    assertEquals(
      3,
      ProtectedMediaPolicy.responseBytesRemaining(206, 4, 3, 3)
    );
    assertEquals(
      3,
      ProtectedMediaPolicy.responseBytesRemaining(206, 4, C.LENGTH_UNSET, 3)
    );
  }
}
