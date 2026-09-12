package com.trcmd9000.frigateviewer;

import android.content.Context;

import java.io.IOException;
import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import javax.net.SocketFactory;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

import okhttp3.Dns;
import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.Connection;
import okhttp3.MediaType;

/**
 * Resolves an explicitly configured local route without trusting DNS or the
 * network on which the process happens to be running.
 */
final class LocalRouteResolver {
  static final long HEALTHCHECK_TIMEOUT_SECONDS = 4L;
  static final long LOCAL_REQUEST_TIMEOUT_SECONDS = 15L;
  static final int RTSP_PEER_CONNECT_TIMEOUT_MS = 5_000;

  enum FailureCode {
    DISABLED,
    HTTP_LOCAL_API_DISABLED,
    INVALID_LOCAL_ADDRESS,
    DNS_RESOLUTION_FAILED,
    AUTH_FAILED,
    TLS_FAILED,
    TIMEOUT,
    NETWORK,
    PUBLIC_CONNECTED_PEER
  }

  static final class RouteConfig {
    final String profileKey;
    final String remoteBaseUrl;
    final boolean enabled;
    final String localProtocol;
    final String localHost;
    final int localPort;
    final String localBasePath;
    final String auth;
    final String username;
    final String password;
    final boolean localMtlsEnabled;
    final String localClientCertAlias;
    final boolean localAllowSelfSignedServer;

    RouteConfig(
      String profileKey,
      String remoteBaseUrl,
      boolean enabled,
      String localProtocol,
      String localHost,
      int localPort,
      String localBasePath,
      String auth,
      String username,
      String password,
      boolean localMtlsEnabled,
      String localClientCertAlias,
      boolean localAllowSelfSignedServer
    ) {
      this.profileKey = profileKey == null ? "" : profileKey;
      this.remoteBaseUrl = remoteBaseUrl == null ? "" : remoteBaseUrl;
      this.enabled = enabled;
      this.localProtocol = localProtocol == null ? "" : localProtocol;
      this.localHost = localHost == null ? "" : localHost;
      this.localPort = localPort;
      this.localBasePath = localBasePath == null ? "" : localBasePath;
      this.auth = auth == null ? "none" : auth;
      this.username = username == null ? "" : username;
      this.password = password == null ? "" : password;
      this.localMtlsEnabled = localMtlsEnabled;
      this.localClientCertAlias =
        localClientCertAlias == null ? "" : localClientCertAlias;
      this.localAllowSelfSignedServer = localAllowSelfSignedServer;
    }
  }

  static final class Resolution {
    final boolean local;
    final String baseUrl;
    final long generation;
    final FailureCode failure;

    private Resolution(
      boolean local,
      String baseUrl,
      long generation,
      FailureCode failure
    ) {
      this.local = local;
      this.baseUrl = baseUrl;
      this.generation = generation;
      this.failure = failure;
    }

    static Resolution remote(String baseUrl, long generation, FailureCode failure) {
      return new Resolution(false, baseUrl, generation, failure);
    }

    static Resolution local(String baseUrl, long generation) {
      return new Resolution(true, baseUrl, generation, null);
    }
  }

  static final class RtspResolution {
    final String host;
    final int port;
    final long generation;

    RtspResolution(String host, int port, long generation) {
      this.host = host;
      this.port = port;
      this.generation = generation;
    }
  }

  private final Context context;
  private final Map<String, Resolution> cache = new ConcurrentHashMap<>();
  private final Map<String, RtspResolution> rtspCache = new ConcurrentHashMap<>();
  private volatile long networkGeneration = 1L;

  LocalRouteResolver(Context context) {
    this.context = context.getApplicationContext();
  }

  synchronized void invalidate() {
    networkGeneration += 1L;
    cache.clear();
    rtspCache.clear();
  }

  long generation() {
    return networkGeneration;
  }

  Resolution resolve(RouteConfig config, String method) throws RouteFailureException {
    String remote = canonicalBaseUrl(config.remoteBaseUrl);
    long generation = networkGeneration;
    if (!config.enabled) {
      return Resolution.remote(remote, generation, FailureCode.DISABLED);
    }

    validateLocalSecurity(config);
    if (!"https".equalsIgnoreCase(config.localProtocol)) {
      // A cleartext local endpoint is useful to the RTSP layer, but can never
      // become an authenticated API transport.
      return Resolution.remote(remote, generation, FailureCode.HTTP_LOCAL_API_DISABLED);
    }
    if (config.localMtlsEnabled && config.localClientCertAlias.trim().isEmpty()) {
      return Resolution.remote(remote, generation, FailureCode.TLS_FAILED);
    }

    String key = cacheKey(config);
    Resolution cached = cache.get(key);
    if (cached != null && cached.generation == generation) {
      if (cached.failure != null && !isSafeRead(method)) {
        throw new RouteFailureException(cached.failure, "Local route resolution failed");
      }
      return cached;
    }

    Resolution result;
    try {
      String local = localBaseUrl(config);
      validateLocalAddresses(config.localHost);
      healthcheck(config, local);
      if (networkGeneration != generation) {
        throw new RouteFailureException(
          FailureCode.NETWORK,
          "The network changed during local route resolution"
        );
      }
      result = Resolution.local(local, generation);
      cache.put(key, result);
    } catch (RouteFailureException failure) {
      // Only safe reads may fall back after a failed local healthcheck. Writes
      // remain on the already configured remote route and are never replayed.
      if (!isSafeRead(method)) {
        throw failure;
      }
      result = Resolution.remote(remote, generation, failure.code);
      cache.put(key, result);
    } catch (Exception failure) {
      if (!isSafeRead(method)) {
        throw new RouteFailureException(classify(failure), "Local route resolution failed", failure);
      }
      result = Resolution.remote(remote, generation, classify(failure));
      cache.put(key, result);
    }
    return result;
  }

  /**
   * Validate the explicitly configured peer before an RTSP URI is handed to
   * Media3. RTSP has no HTTP fallback, so a failed local route is terminal.
   */
  RtspResolution resolveRtsp(RouteConfig config, int rtspPort)
    throws RouteFailureException {
    if (!config.enabled) {
      throw new RouteFailureException(FailureCode.DISABLED, "Local routing is disabled");
    }
    int port = RtspMediaPolicy.validatePort(rtspPort);
    String localHost = unbracketedHost(config.localHost);
    long generation = networkGeneration;
    String cacheKey = config.profileKey + "|" + localHost + "|" + port;
    RtspResolution cached = rtspCache.get(cacheKey);
    if (cached != null && cached.generation == generation) {
      return cached;
    }
    validateLocalAddresses(localHost);
    InetAddress[] addresses;
    try {
      addresses = InetAddress.getAllByName(localHost);
    } catch (IOException error) {
      throw new RouteFailureException(
        FailureCode.DNS_RESOLUTION_FAILED,
        "Local RTSP route DNS resolution failed",
        error
      );
    }
    RouteFailureException lastFailure = null;
    for (InetAddress address : addresses) {
      try {
        validateAddress(address);
        java.net.Socket socket = new java.net.Socket();
        try {
          socket.connect(new InetSocketAddress(address, port),
            (int) HEALTHCHECK_TIMEOUT_SECONDS * 1000);
          validateConnectedPeer(socket.getInetAddress());
        } finally {
          socket.close();
        }
        if (networkGeneration != generation) {
          throw new RouteFailureException(
            FailureCode.NETWORK,
            "The network changed during local RTSP route resolution"
          );
        }
        RtspResolution result = new RtspResolution(localHost, port, generation);
        rtspCache.put(cacheKey, result);
        return result;
      } catch (RouteFailureException failure) {
        lastFailure = failure;
      } catch (java.net.SocketTimeoutException error) {
        lastFailure = new RouteFailureException(
          FailureCode.TIMEOUT,
          "The local RTSP peer did not respond",
          error
        );
      } catch (IOException error) {
        lastFailure = new RouteFailureException(
          FailureCode.NETWORK,
          "The local RTSP peer is unavailable",
          error
        );
      }
    }
    if (lastFailure != null) {
      throw lastFailure;
    }
    throw new RouteFailureException(
      FailureCode.DNS_RESOLUTION_FAILED,
      "Local RTSP route has no addresses"
    );
  }

  static boolean isSafeRead(String method) {
    return method == null ||
      "GET".equalsIgnoreCase(method) ||
      "HEAD".equalsIgnoreCase(method) ||
      "OPTIONS".equalsIgnoreCase(method);
  }

  static void validateLocalSecurity(RouteConfig config)
    throws RouteFailureException {
    if (config.localMtlsEnabled &&
      config.localClientCertAlias.trim().isEmpty()) {
      throw new RouteFailureException(
        FailureCode.TLS_FAILED,
        "The local client identity is unavailable"
      );
    }
    if (config.localMtlsEnabled &&
      !"https".equalsIgnoreCase(config.localProtocol)) {
      throw new RouteFailureException(
        FailureCode.TLS_FAILED,
        "Local client certificates require HTTPS"
      );
    }
  }

  static boolean isAllowedAddress(InetAddress address) {
    if (address == null || address.isMulticastAddress() || address.isAnyLocalAddress()) {
      return false;
    }
    if (address instanceof Inet4Address) {
      byte[] bytes = address.getAddress();
      int first = bytes[0] & 0xff;
      int second = bytes[1] & 0xff;
      return first == 10 ||
        (first == 172 && second >= 16 && second <= 31) ||
        (first == 192 && second == 168) ||
        first == 127 ||
        (first == 169 && second == 254);
    }
    if (address instanceof Inet6Address) {
      byte[] bytes = address.getAddress();
      int first = bytes[0] & 0xff;
      int second = bytes[1] & 0xff;
      return first == 0xfc || first == 0xfd ||
        (first == 0xfe && (second & 0xc0) == 0x80) ||
        address.isLoopbackAddress();
    }
    return false;
  }

  static void validateAddress(InetAddress address) throws RouteFailureException {
    if (!isAllowedAddress(address)) {
      throw new RouteFailureException(
        FailureCode.INVALID_LOCAL_ADDRESS,
        "The local route resolved to a public address"
      );
    }
  }

  static void validateConnectedPeer(InetAddress address) throws RouteFailureException {
    if (!isAllowedAddress(address)) {
      throw new RouteFailureException(
        FailureCode.PUBLIC_CONNECTED_PEER,
        "The connected local route peer is public"
      );
    }
  }

  static SocketFactory privateOnlySocketFactory() {
    return new SocketFactory() {
      private final SocketFactory delegate = SocketFactory.getDefault();

      private Socket connectChecked(
        Socket socket,
        InetSocketAddress remote,
        InetSocketAddress local
      ) throws IOException {
        try {
          if (local != null) {
            socket.bind(local);
          }
          socket.connect(remote, RTSP_PEER_CONNECT_TIMEOUT_MS);
          validateConnectedPeer(socket.getInetAddress());
          return socket;
        } catch (IOException | RuntimeException failure) {
          try {
            socket.close();
          } catch (IOException ignored) {
            // Preserve the connection or peer-policy failure.
          }
          throw failure;
        }
      }

      private Socket newSocket() throws IOException {
        return delegate.createSocket();
      }

      @Override public Socket createSocket(String host, int port) throws IOException {
        return connectChecked(
          newSocket(),
          new InetSocketAddress(host, port),
          null
        );
      }

      @Override public Socket createSocket(String host, int port, InetAddress localHost,
        int localPort) throws IOException {
        return connectChecked(
          newSocket(),
          new InetSocketAddress(host, port),
          new InetSocketAddress(localHost, localPort)
        );
      }

      @Override public Socket createSocket(InetAddress host, int port) throws IOException {
        return connectChecked(
          newSocket(),
          new InetSocketAddress(host, port),
          null
        );
      }

      @Override public Socket createSocket(InetAddress address, int port,
        InetAddress localAddress, int localPort) throws IOException {
        return connectChecked(
          newSocket(),
          new InetSocketAddress(address, port),
          new InetSocketAddress(localAddress, localPort)
        );
      }

      @Override public Socket createSocket() throws IOException {
        return newSocket();
      }
    };
  }

  private void healthcheck(RouteConfig config, String localBaseUrl)
    throws Exception {
    HttpUrl base = HttpUrl.parse(localBaseUrl);
    if (base == null) {
      throw new RouteFailureException(FailureCode.INVALID_LOCAL_ADDRESS, "Invalid local endpoint");
    }
    ClientCertModule.NativeClientSession session =
      ClientCertModule.getSharedClientSession(
        context,
        emptyToNull(config.localClientCertAlias),
        config.profileKey,
        config.localAllowSelfSignedServer
      );
    OkHttpClient client = checkedClient(session.client)
      .newBuilder()
      .callTimeout(HEALTHCHECK_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      .connectTimeout(HEALTHCHECK_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      .readTimeout(HEALTHCHECK_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      .writeTimeout(HEALTHCHECK_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      .build();

    HttpUrl healthUrl = base.newBuilder().addPathSegment("api").addPathSegment("version").build();
    Request healthRequest = authenticatedRequest(config, healthUrl).get().build();
    try (Response response = client.newCall(healthRequest).execute()) {
      if (response.code() == 401 && "frigate".equalsIgnoreCase(config.auth)) {
        login(config, client, base);
        try (Response retry = client.newCall(healthRequest).execute()) {
          if (retry.code() < 200 || retry.code() >= 300) {
            throw new RouteFailureException(FailureCode.AUTH_FAILED, "Local Frigate authentication failed");
          }
          return;
        }
      }
      if (response.code() == 401 || response.code() == 403) {
        throw new RouteFailureException(FailureCode.AUTH_FAILED, "Local route authentication failed");
      }
      if (response.code() < 200 || response.code() >= 300) {
        throw new RouteFailureException(FailureCode.NETWORK, "Local Frigate healthcheck failed");
      }
    }
  }

  private void login(RouteConfig config, OkHttpClient client, HttpUrl base)
    throws Exception {
    RequestBody body = RequestBody.create(
      "{\"user\":\"" + jsonEscape(config.username) +
      "\",\"password\":\"" + jsonEscape(config.password) + "\"}",
      MediaType.parse("application/json")
    );
    Request request = new Request.Builder()
      .url(base.newBuilder().addPathSegment("api").addPathSegment("login").build())
      .post(body)
      .header("Accept", "application/json")
      .build();
    try (Response response = client.newCall(request).execute()) {
      if (response.code() < 200 || response.code() >= 300) {
        throw new RouteFailureException(FailureCode.AUTH_FAILED, "Local Frigate authentication failed");
      }
    }
  }

  private static Request.Builder authenticatedRequest(RouteConfig config, HttpUrl url) {
    Request.Builder request = new Request.Builder().url(url);
    if ("basic".equalsIgnoreCase(config.auth)) {
      request.header(
        "Authorization",
        okhttp3.Credentials.basic(config.username, config.password)
      );
    }
    return request;
  }

  static OkHttpClient checkedClient(OkHttpClient base) {
    return base.newBuilder()
      .dns(new PrivateOnlyDns())
      .addNetworkInterceptor(chain -> {
        Connection connection = chain.connection();
        if (connection != null) {
          InetSocketAddress address = connection.route().socketAddress();
          validateConnectedPeer(address.getAddress());
        }
        return chain.proceed(chain.request());
      })
      .callTimeout(LOCAL_REQUEST_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      .connectTimeout(HEALTHCHECK_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      .readTimeout(LOCAL_REQUEST_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      .writeTimeout(LOCAL_REQUEST_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      .build();
  }

  private static final class PrivateOnlyDns implements Dns {
    @Override
    public java.util.List<InetAddress> lookup(String hostname) {
      InetAddress[] addresses;
      try {
        addresses = InetAddress.getAllByName(hostname);
      } catch (IOException error) {
        throw new IllegalStateException(
          new RouteFailureException(
            FailureCode.DNS_RESOLUTION_FAILED,
            "Local route DNS resolution failed",
            error
          )
        );
      }
      if (addresses.length == 0) {
        throw new IllegalStateException(
          new RouteFailureException(
            FailureCode.DNS_RESOLUTION_FAILED,
            "Local route has no addresses"
          )
        );
      }
      try {
        for (InetAddress address : addresses) {
          validateAddress(address);
        }
      } catch (RouteFailureException failure) {
        throw new IllegalStateException(failure);
      }
      return Arrays.asList(addresses);
    }
  }

  private static void validateLocalAddresses(String host) throws RouteFailureException {
    if (host == null || host.trim().isEmpty() || host.length() > 253 ||
      host.matches(".*[/?#@\\s].*")) {
      throw new RouteFailureException(FailureCode.INVALID_LOCAL_ADDRESS, "Invalid local route host");
    }

    try {
      InetAddress[] addresses = InetAddress.getAllByName(host);
      if (addresses.length == 0) {
        throw new RouteFailureException(FailureCode.DNS_RESOLUTION_FAILED, "Local route has no addresses");
      }
      for (InetAddress address : addresses) {
        validateAddress(address);
      }
    } catch (RouteFailureException failure) {
      throw failure;
    } catch (IOException error) {
      throw new RouteFailureException(FailureCode.DNS_RESOLUTION_FAILED, "Local route DNS resolution failed", error);
    }
  }

  private static String unbracketedHost(String value) {
    String host = value == null ? "" : value.trim();
    return host.startsWith("[") && host.endsWith("]")
      ? host.substring(1, host.length() - 1)
      : host;
  }

  private static String localBaseUrl(RouteConfig config) throws RouteFailureException {
    if (config.localPort <= 0 || config.localPort > 65535) {
      throw new RouteFailureException(FailureCode.INVALID_LOCAL_ADDRESS, "Invalid local route port");
    }
    String host = config.localHost.trim();
    String urlHost = host.contains(":") && !host.startsWith("[") ? "[" + host + "]" : host;
    String path = config.localBasePath.trim();
    while (path.startsWith("/")) path = path.substring(1);
    while (path.endsWith("/")) path = path.substring(0, path.length() - 1);
    return "https://" + urlHost + ":" + config.localPort +
      (path.isEmpty() ? "/" : "/" + path + "/");
  }

  private static String canonicalBaseUrl(String value) {
    if (value == null || value.trim().isEmpty()) return "";
    return value.endsWith("/") ? value : value + "/";
  }

  private static String cacheKey(RouteConfig config) {
    return config.profileKey + "\u0000" + config.localProtocol + "\u0000" +
      config.localHost + "\u0000" + config.localPort + "\u0000" +
      config.localBasePath + "\u0000" + config.auth + "\u0000" +
      config.localClientCertAlias + "\u0000" + config.localAllowSelfSignedServer +
      "\u0000" + config.localMtlsEnabled +
      "\u0000" + credentialFingerprint(config.username, config.password);
  }

  private static String credentialFingerprint(String username, String password) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      digest.update((username + "\u0000" + password).getBytes(java.nio.charset.StandardCharsets.UTF_8));
      StringBuilder result = new StringBuilder();
      for (byte value : digest.digest()) result.append(String.format(Locale.US, "%02x", value & 0xff));
      return result.toString();
    } catch (Exception error) {
      return "";
    }
  }

  private static String emptyToNull(String value) {
    return value == null || value.trim().isEmpty() ? null : value;
  }

  private static String jsonEscape(String value) {
    StringBuilder escaped = new StringBuilder(value.length());
    for (int index = 0; index < value.length(); index++) {
      char character = value.charAt(index);
      switch (character) {
        case '\\': escaped.append("\\\\"); break;
        case '"': escaped.append("\\\""); break;
        case '\b': escaped.append("\\b"); break;
        case '\f': escaped.append("\\f"); break;
        case '\n': escaped.append("\\n"); break;
        case '\r': escaped.append("\\r"); break;
        case '\t': escaped.append("\\t"); break;
        default:
          if (character < 0x20) {
            escaped.append(String.format(Locale.US, "\\u%04x", (int) character));
          } else {
            escaped.append(character);
          }
      }
    }
    return escaped.toString();
  }

  private static FailureCode classify(Exception error) {
    if (error instanceof java.net.SocketTimeoutException) return FailureCode.TIMEOUT;
    if (error instanceof javax.net.ssl.SSLException) return FailureCode.TLS_FAILED;
    return FailureCode.NETWORK;
  }

  static final class RouteFailureException extends IOException {
    final FailureCode code;

    RouteFailureException(FailureCode code, String message) {
      super(message);
      this.code = code;
    }

    RouteFailureException(FailureCode code, String message, Throwable cause) {
      super(message, cause);
      this.code = code;
    }
  }
}
