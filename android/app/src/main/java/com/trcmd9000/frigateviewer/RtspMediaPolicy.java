package com.trcmd9000.frigateviewer;

import java.net.InetAddress;

/** Validation and URL construction for the opt-in local RTSP profile. */
final class RtspMediaPolicy {
  static final int DEFAULT_PORT = 8554;
  // Media3 first tries UDP and switches to TCP after this inactivity window.
  // It must leave time for the outer 15 second first-frame deadline.
  static final long RTP_FALLBACK_TIMEOUT_MS = 5_000L;

  private RtspMediaPolicy() {}

  static int validatePort(int port) throws LocalRouteResolver.RouteFailureException {
    int effective = port == 0 ? DEFAULT_PORT : port;
    if (effective < 1 || effective > 65535) {
      throw new LocalRouteResolver.RouteFailureException(
        LocalRouteResolver.FailureCode.INVALID_LOCAL_ADDRESS,
        "Invalid RTSP port"
      );
    }
    return effective;
  }

  static String validateStreamName(String streamName) throws java.io.IOException {
    if (streamName == null || !streamName.matches("[A-Za-z0-9_.:-]{1,128}")) {
      throw new java.io.IOException("The local RTSP stream name is invalid");
    }
    return streamName;
  }

  static String buildUrl(
    String host,
    int port,
    String streamName,
    String username,
    String password,
    boolean allowInsecureCredentials
  ) throws java.io.IOException {
    validateStreamName(streamName);
    int effectivePort = validatePort(port);
    String normalizedHost = host == null ? "" : host.trim();
    if (normalizedHost.isEmpty() || normalizedHost.contains("/") ||
      normalizedHost.contains("\\") || normalizedHost.contains("@") ||
      normalizedHost.contains("?") || normalizedHost.contains("#") ||
      normalizedHost.matches(".*\\s+.*")) {
      throw new java.io.IOException("The local RTSP host is invalid");
    }
    if (normalizedHost.startsWith("[") && normalizedHost.endsWith("]")) {
      normalizedHost = normalizedHost.substring(1, normalizedHost.length() - 1);
    }
    String urlHost = normalizedHost.contains(":")
      ? "[" + normalizedHost + "]"
      : normalizedHost;
    String authority = urlHost;
    if (allowInsecureCredentials && username != null && !username.isEmpty() &&
      password != null) {
      authority =
        java.net.URLEncoder.encode(username, "UTF-8").replace("+", "%20") +
        ":" +
        java.net.URLEncoder.encode(password, "UTF-8").replace("+", "%20") +
        "@" + urlHost;
    }
    String encodedStream = encodePathSegment(streamName);
    return "rtsp://" + authority + ":" + effectivePort + "/" + encodedStream;
  }

  private static String encodePathSegment(String value) {
    StringBuilder encoded = new StringBuilder(value.length());
    for (byte character : value.getBytes(java.nio.charset.StandardCharsets.UTF_8)) {
      int unsigned = character & 0xff;
      if ((unsigned >= 'a' && unsigned <= 'z') ||
        (unsigned >= 'A' && unsigned <= 'Z') ||
        (unsigned >= '0' && unsigned <= '9') ||
        unsigned == '-' || unsigned == '.' || unsigned == '_' || unsigned == '~') {
        encoded.append((char) unsigned);
      } else {
        encoded.append('%');
        encoded.append("0123456789ABCDEF".charAt(unsigned >>> 4));
        encoded.append("0123456789ABCDEF".charAt(unsigned & 0x0f));
      }
    }
    return encoded.toString();
  }

  static boolean hasPrivatePeer(InetAddress address) {
    return LocalRouteResolver.isAllowedAddress(address);
  }

  static boolean shouldUseCredentials(
    String authenticationMode,
    boolean allowInsecureCredentials
  ) {
    return allowInsecureCredentials &&
      authenticationMode != null &&
      !"none".equalsIgnoreCase(authenticationMode);
  }
}
