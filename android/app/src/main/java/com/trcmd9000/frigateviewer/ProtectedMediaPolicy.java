package com.trcmd9000.frigateviewer;

import androidx.media3.common.C;

/**
 * Small, side-effect-free decisions shared by the protected media transport
 * and its unit tests.
 */
final class ProtectedMediaPolicy {
  private ProtectedMediaPolicy() {}

  static boolean shouldReauthenticate(
    String authenticationMode,
    int statusCode,
    boolean alreadyRetried
  ) {
    return (
      "frigate".equals(authenticationMode) &&
      statusCode == 401 &&
      !alreadyRetried
    );
  }

  static boolean isRedirectRejected(int statusCode) {
    return statusCode >= 300 && statusCode < 400;
  }

  static boolean isOpaqueMediaUri(String uri) {
    return uri != null &&
      uri.regionMatches(true, 0, MediaProfileRegistry.MEDIA_SCHEME + "://", 0,
        MediaProfileRegistry.MEDIA_SCHEME.length() + 3);
  }

  static long responseBytesRemaining(
    int statusCode,
    long position,
    long requestedLength,
    long contentLength
  ) {
    long availableLength = contentLength;
    if (statusCode == 200 && position > 0 && contentLength != C.LENGTH_UNSET) {
      availableLength = Math.max(0, contentLength - position);
    }
    if (requestedLength == C.LENGTH_UNSET) {
      return availableLength;
    }
    return availableLength == C.LENGTH_UNSET
      ? requestedLength
      : Math.min(requestedLength, availableLength);
  }
}
