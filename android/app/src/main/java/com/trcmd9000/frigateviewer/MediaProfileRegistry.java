package com.trcmd9000.frigateviewer;

import android.content.Context;
import android.net.Uri;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import okhttp3.Credentials;
import okhttp3.HttpUrl;
import okhttp3.MediaType;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * Native-only registry for protected Media3 media resources.
 *
 * <p>JavaScript receives only a random profile authority and a resource path.
 * Endpoint details, credentials, cookies, and client identities remain in this
 * registry and in the profile-scoped OkHttp client.</p>
 */
final class MediaProfileRegistry {
  static final String MEDIA_SCHEME = "frigate-media";
  private static final String JSON_MEDIA_TYPE = "application/json";

  private static volatile MediaProfileRegistry instance;

  private final Context context;
  private final LocalRouteResolver localRouteResolver;
  private final Map<String, MediaProfile> profiles = new ConcurrentHashMap<>();
  private final Map<String, String> profileIdsByLogicalId = new ConcurrentHashMap<>();
  private final Map<String, RtspMediaHandle> rtspHandles = new ConcurrentHashMap<>();
  private final Map<String, Long> registrationGenerations = new ConcurrentHashMap<>();
  private final Map<String, Integer> pendingRegistrations = new ConcurrentHashMap<>();
  private long globalRegistrationGeneration;
  private boolean acceptingRegistrations = true;

  MediaProfileRegistry(Context context) {
    this.context = context.getApplicationContext();
    this.localRouteResolver = new LocalRouteResolver(this.context);
  }

  static MediaProfileRegistry initialize(Context context) {
    MediaProfileRegistry current = instance;
    if (current != null) {
      return current;
    }
    synchronized (MediaProfileRegistry.class) {
      current = instance;
      if (current == null) {
        current = new MediaProfileRegistry(context);
        instance = current;
      }
      return current;
    }
  }

  static MediaProfileRegistry get(Context context) {
    return initialize(context);
  }

  synchronized void invalidateLocalRoutes() {
    localRouteResolver.invalidate();
    rtspHandles.clear();
  }

  synchronized void unregister(
    String profileKey,
    ProfileRetirementListener retirementListener
  ) {
    if (profileKey == null || profileKey.isEmpty()) {
      return;
    }
    bumpRegistrationGeneration(profileKey);
    profiles.values().forEach(profile -> {
      if (profileKey.equals(profile.profileKey)) {
        retireProfile(profile, retirementListener);
      }
    });
    cleanupRegistrationStateLocked(profileKey);
  }

  synchronized void invalidateAll() {
    globalRegistrationGeneration += 1L;
    acceptingRegistrations = false;
    profiles.values().forEach(profile -> retireProfile(profile, null));
    rtspHandles.clear();
    profileIdsByLogicalId.clear();
    // Advance the global tombstone before clearing the maps. Any task that
    // was already queued carries the previous generation and cannot register
    // after lifecycle invalidation, even if shutdownNow races with execution.
    registrationGenerations.clear();
    pendingRegistrations.clear();
  }

  synchronized String register(MediaProfileConfig config) throws Exception {
    return register(config, null);
  }

  synchronized String register(
    MediaProfileConfig config,
    ProfileRetirementListener retirementListener
  ) throws Exception {
    RegistrationToken token = reserveRegistrationLocked(
      config == null ? null : config.profileKey
    );
    try {
      return register(config, retirementListener, token);
    } finally {
      completeRegistrationLocked(token);
    }
  }

  synchronized RegistrationToken reserveRegistration(String profileKey) {
    return reserveRegistrationLocked(profileKey);
  }

  synchronized void completeRegistration(RegistrationToken token) {
    completeRegistrationLocked(token);
  }

  synchronized int registrationGenerationEntryCount() {
    return registrationGenerations.size();
  }

  synchronized int pendingRegistrationEntryCount() {
    return pendingRegistrations.size();
  }

  synchronized String register(
    MediaProfileConfig config,
    ProfileRetirementListener retirementListener,
    RegistrationToken token
  ) throws Exception {
    MediaProfile.validateConfig(config);
    if (!isCurrentRegistrationLocked(token, config.profileKey)) {
      throw new IOException("The protected media profile registration was retired");
    }
    String logicalProfileId = config.logicalProfileId;
    String existingId = profileIdsByLogicalId.get(logicalProfileId);
    if (existingId != null) {
      MediaProfile existing = profiles.get(existingId);
      if (existing != null) {
        if (existing.canUpdate(config)) {
          existing.update(config);
          return existing.id;
        }
        retireProfile(existing, retirementListener);
      } else {
        profileIdsByLogicalId.remove(logicalProfileId, existingId);
      }
    }

    MediaProfile profile = new MediaProfile(
      UUID.randomUUID().toString().replace("-", ""),
      config,
      context
    );
    profiles.put(profile.id, profile);
    profileIdsByLogicalId.put(logicalProfileId, profile.id);
    return profile.id;
  }

  private RegistrationToken reserveRegistrationLocked(String profileKey) {
    if (!acceptingRegistrations) {
      throw new IllegalStateException(
        "The protected media profile registry is unavailable"
      );
    }
    if (profileKey == null || profileKey.isEmpty()) {
      return null;
    }
    long generation = registrationGenerations.getOrDefault(profileKey, 0L) + 1L;
    registrationGenerations.put(profileKey, generation);
    pendingRegistrations.merge(profileKey, 1, Integer::sum);
    return new RegistrationToken(
      profileKey,
      generation,
      globalRegistrationGeneration
    );
  }

  private boolean isCurrentRegistrationLocked(
    RegistrationToken token,
    String profileKey
  ) {
    return token != null &&
      token.profileKey.equals(profileKey) &&
      token.globalGeneration == globalRegistrationGeneration &&
      registrationGenerations.getOrDefault(profileKey, 0L) == token.generation;
  }

  private void completeRegistrationLocked(RegistrationToken token) {
    if (token == null) {
      return;
    }
    pendingRegistrations.computeIfPresent(
      token.profileKey,
      (key, count) -> count <= 1 ? null : count - 1
    );
    cleanupRegistrationStateLocked(token.profileKey);
  }

  private void cleanupRegistrationStateLocked(String profileKey) {
    if (
      !pendingRegistrations.containsKey(profileKey) &&
      !hasProfileKey(profileKey)
    ) {
      registrationGenerations.remove(profileKey);
    }
  }

  private boolean hasProfileKey(String profileKey) {
    for (MediaProfile profile : profiles.values()) {
      if (profileKey.equals(profile.profileKey)) {
        return true;
      }
    }
    return false;
  }

  private void bumpRegistrationGeneration(String profileKey) {
    registrationGenerations.put(
      profileKey,
      registrationGenerations.getOrDefault(profileKey, 0L) + 1L
    );
  }

  private void retireProfile(
    MediaProfile profile,
    ProfileRetirementListener retirementListener
  ) {
    if (!profiles.remove(profile.id, profile)) {
      return;
    }
    profileIdsByLogicalId.remove(profile.logicalProfileId, profile.id);
    rtspHandles.entrySet().removeIf(
      entry -> profile.id.equals(entry.getValue().profileId)
    );
    if (retirementListener != null) {
      retirementListener.onProfileRetired(profile.id);
    }
    profile.retire();
  }

  interface ProfileRetirementListener {
    void onProfileRetired(String profileId);
  }

  static final class RegistrationToken {
    final String profileKey;
    final long generation;
    final long globalGeneration;

    RegistrationToken(
      String profileKey,
      long generation,
      long globalGeneration
    ) {
      this.profileKey = profileKey;
      this.generation = generation;
      this.globalGeneration = globalGeneration;
    }
  }

  String createMediaUri(String profileId, String resourcePath) throws IOException {
    MediaProfile profile = profileFor(profileId);
    profile.requireRemoteHttpConsent();
    Uri resource = parseResourcePath(resourcePath);
    String path = normalizePath(resource.getEncodedPath(), true);
    if ("/".equals(path)) {
      throw new IOException("A protected media resource path is required");
    }

    if (!profile.isMediaPath(path)) {
      throw new IOException("The protected media path is not approved");
    }
    Uri.Builder builder = new Uri.Builder()
      .scheme(MEDIA_SCHEME)
      .authority(profile.id)
      .encodedPath(path);
    if (resource.getEncodedQuery() != null) {
      builder.encodedQuery(resource.getEncodedQuery());
    }
    return builder.build().toString();
  }

  String createRtspMediaUri(String profileId, String streamName) throws IOException {
    MediaProfile profile = profileFor(profileId);
    if (!profile.rtspEnabled) {
      throw new IOException("Local RTSP is disabled");
    }
    String validatedStream = RtspMediaPolicy.validateStreamName(streamName);
    LocalRouteResolver.RtspResolution resolution =
      localRouteResolver.resolveRtsp(profile.localRouteConfig(), profile.rtspPort);
    String handle = UUID.randomUUID().toString().replace("-", "");
    rtspHandles.put(
      handle,
      new RtspMediaHandle(profile.id, validatedStream, resolution.generation)
    );
    return new Uri.Builder()
      .scheme(MEDIA_SCHEME)
      .authority(profile.id)
      .appendPath("rtsp")
      .appendPath(handle)
      .build()
      .toString();
  }

  String createMseMediaUri(String profileId, String streamName) throws IOException {
    MediaProfile profile = profileFor(profileId);
    profile.requireRemoteHttpConsent();
    String validatedStream = validateMseStreamName(streamName);
    return new Uri.Builder()
      .scheme(MEDIA_SCHEME)
      .authority(profile.id)
      .appendPath("mse")
      .appendPath(validatedStream)
      .build()
      .toString();
  }

  synchronized void releaseRtspMediaUri(String profileId, String handle) throws IOException {
    MediaProfile profile = profileFor(profileId);
    if (handle == null || !handle.matches("[A-Za-z0-9_-]{16,64}")) {
      return;
    }
    RtspMediaHandle value = rtspHandles.get(handle);
    if (value != null && profile.id.equals(value.profileId)) {
      rtspHandles.remove(handle, value);
    }
  }

  /**
   * This is called only by the native Media3 plugin. The one-shot handle keeps
   * the resolved endpoint and any RTSP authentication out of JavaScript.
   */
  synchronized String resolveRtspMediaUri(Uri requestUri) throws IOException {
    if (requestUri == null ||
      !MEDIA_SCHEME.equalsIgnoreCase(requestUri.getScheme()) ||
      requestUri.getPathSegments().size() != 2 ||
      !"rtsp".equals(requestUri.getPathSegments().get(0))) {
      throw new IOException("The RTSP media handle is invalid");
    }
    MediaProfile profile = profileFor(requestUri.getHost());
    RtspMediaHandle handle = rtspHandles.remove(requestUri.getPathSegments().get(1));
    if (handle == null || !profile.id.equals(handle.profileId)) {
      throw new IOException("The RTSP media handle is unavailable");
    }
    if (handle.generation != localRouteResolver.generation()) {
      throw new IOException("The local RTSP route changed");
    }
    return RtspMediaPolicy.buildUrl(
      profile.localHost,
      profile.rtspPort,
      handle.streamName,
      profile.username,
      profile.password,
      RtspMediaPolicy.shouldUseCredentials(
        profile.auth,
        profile.allowInsecureCredentials
      )
    );
  }

  boolean hasProfile(String profileId) {
    return profileId != null && profiles.containsKey(profileId);
  }

  ResolvedMediaRequest resolve(Uri requestUri) throws IOException {
    if (requestUri == null || requestUri.getScheme() == null) {
      throw new IOException("A protected media URI is required");
    }

    String scheme = requestUri.getScheme().toLowerCase(Locale.US);
    if (MEDIA_SCHEME.equals(scheme)) {
      if (
        requestUri.getUserInfo() != null ||
        requestUri.getPort() != -1 ||
        requestUri.getFragment() != null
      ) {
        throw new IOException("The protected media URI authority is invalid");
      }
      MediaProfile profile = profileFor(requestUri.getHost());
      profile.requireRemoteHttpConsent();
      String profilePath = normalizePath(requestUri.getEncodedPath(), true);
      HttpUrl url = profile.toServerUrl(
        profilePath,
        requestUri.getEncodedQuery()
      );
      return new ResolvedMediaRequest(profile, url);
    }

    if (!"http".equals(scheme) && !"https".equals(scheme)) {
      throw new IOException("The protected media URI scheme is not allowed");
    }

    if (requestUri.getUserInfo() != null || requestUri.getFragment() != null) {
      throw new IOException("The protected media URI authority is invalid");
    }
    HttpUrl absolute = HttpUrl.parse(requestUri.toString());
    if (absolute == null) {
      throw new IOException("The protected media URI is invalid");
    }

    MediaProfile profile = findProfileForAbsoluteUrl(absolute);
    if (profile == null) {
      throw new IOException("The protected media host is not approved");
    }
    profile.validateAbsoluteUrl(absolute);
    return new ResolvedMediaRequest(profile, absolute);
  }

  Uri opaqueUri(ResolvedMediaRequest resolved) throws IOException {
    String actualPath = normalizePath(resolved.url.encodedPath(), true);
    String profilePath = actualPath;
    String basePath = resolved.profile.basePath;
    if (!basePath.isEmpty()) {
      if (!actualPath.startsWith(basePath + "/")) {
        throw new IOException("The protected media path is not approved");
      }
      profilePath = actualPath.substring(basePath.length());
    }
    return new Uri.Builder()
      .scheme(MEDIA_SCHEME)
      .authority(resolved.profile.id)
      .encodedPath(profilePath)
      .build();
  }

  Response executeWithReauthentication(
    ResolvedMediaRequest resolved,
    Request request,
    long requestGeneration
  ) throws IOException {
    MediaProfile profile = resolved.profile;
    Response response = profile.session.client.newCall(request).execute();
    if (!ProtectedMediaPolicy.shouldReauthenticate(profile.auth, response.code(), false)) {
      return response;
    }

    response.close();
    if (!refreshSession(profile, requestGeneration)) {
      throw new ProtectedMediaException(401, "Protected media authentication failed");
    }
    return profile.session.client.newCall(request).execute();
  }

  long currentSessionGeneration(MediaProfile profile) {
    synchronized (profile.session.loginLock) {
      return profile.session.sessionGeneration;
    }
  }

  LiveSocketRequest liveSocketRequest(
    String profileId,
    String streamName
  ) throws IOException {
    if (
      streamName == null ||
      !streamName.matches("[A-Za-z0-9_.:-]{1,128}")
    ) {
      throw new IOException("The protected live stream name is invalid");
    }
    MediaProfile profile = profileFor(profileId);
    profile.requireRemoteHttpConsent();
    return new LiveSocketRequest(
      profile,
      authenticatedRequest(profile, profile.liveSocketUrl(streamName)).build(),
      currentSessionGeneration(profile)
    );
  }

  LiveSocketRequest mseSocketRequest(
    String profileId,
    String streamName
  ) throws IOException {
    String validatedStream = validateMseStreamName(streamName);
    MediaProfile profile = profileFor(profileId);
    profile.requireRemoteHttpConsent();
    return new LiveSocketRequest(
      profile,
      authenticatedRequest(profile, profile.mseSocketUrl(validatedStream)).build(),
      currentSessionGeneration(profile)
    );
  }

  LiveSocketRequest mseSocketRequest(Uri requestUri) throws IOException {
    if (requestUri == null ||
      !MEDIA_SCHEME.equalsIgnoreCase(requestUri.getScheme()) ||
      requestUri.getUserInfo() != null ||
      requestUri.getPort() != -1 ||
      requestUri.getQuery() != null ||
      requestUri.getFragment() != null ||
      requestUri.getPathSegments().size() != 2 ||
      !"mse".equals(requestUri.getPathSegments().get(0))) {
      throw new IOException("The protected MSE media handle is invalid");
    }
    return mseSocketRequest(
      requestUri.getHost(),
      requestUri.getPathSegments().get(1)
    );
  }

  private static String validateMseStreamName(String streamName) throws IOException {
    if (streamName == null || !streamName.matches("[A-Za-z0-9_.:-]{1,128}")) {
      throw new IOException("The protected MSE stream name is invalid");
    }
    return streamName;
  }

  boolean refreshLiveSession(
    String profileId,
    long failedGeneration
  ) throws IOException {
    return refreshSession(profileFor(profileId), failedGeneration);
  }

  Request.Builder authenticatedRequest(MediaProfile profile, HttpUrl url) {
    Request.Builder request = new Request.Builder().url(url);
    if ("basic".equals(profile.auth)) {
      request.header(
        "Authorization",
        Credentials.basic(profile.username, profile.password, StandardCharsets.UTF_8)
      );
    }
    return request;
  }

  private boolean refreshSession(
    MediaProfile profile,
    long failedGeneration
  ) throws IOException {
    ClientCertModule.NativeClientSession session = profile.session;
    synchronized (session.loginLock) {
      if (session.sessionGeneration != failedGeneration) {
        return true;
      }
      if (session.loginInFlight) {
        while (session.loginInFlight) {
          try {
            session.loginLock.wait();
          } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IOException("Protected media authentication was interrupted", interrupted);
          }
        }
        if (session.sessionGeneration != failedGeneration) {
          return true;
        }
        throw new IOException("Protected media authentication failed");
      }
      session.loginInFlight = true;
    }

    IOException failure = null;
    try {
      RequestBody body = RequestBody.create(
        "{\"user\":\"" + jsonEscape(profile.username) +
        "\",\"password\":\"" + jsonEscape(profile.password) + "\"}",
        MediaType.parse(JSON_MEDIA_TYPE)
      );
      Request loginRequest = new Request.Builder()
        .url(profile.loginUrl())
        .post(body)
        .header("Accept", JSON_MEDIA_TYPE)
        .build();
      try (Response response = session.client.newCall(loginRequest).execute()) {
        if (response.code() < 200 || response.code() >= 300) {
          throw new ProtectedMediaException(
            response.code(),
            "Protected media authentication failed"
          );
        }
      }
      synchronized (session.loginLock) {
        session.sessionGeneration += 1L;
      }
      return true;
    } catch (ProtectedMediaException error) {
      failure = error;
      throw error;
    } catch (IOException error) {
      failure = new IOException("Protected media authentication failed", error);
      throw failure;
    } finally {
      synchronized (session.loginLock) {
        session.loginInFlight = false;
        session.loginFailure = failure;
        session.loginLock.notifyAll();
      }
    }
  }

  private MediaProfile profileFor(String profileId) throws IOException {
    if (
      profileId == null ||
      !profileId.matches("[A-Za-z0-9_-]{16,64}")
    ) {
      throw new IOException("The protected media profile is invalid");
    }
    MediaProfile profile = profiles.get(profileId);
    if (profile == null) {
      throw new IOException("The protected media profile is unavailable");
    }
    return profile;
  }

  private MediaProfile findProfileForAbsoluteUrl(HttpUrl url) {
    if ("http".equals(url.scheme())) {
      for (MediaProfile profile : profiles.values()) {
        if (
          profile.host.equalsIgnoreCase(url.host()) &&
          "https".equals(profile.protocol)
        ) {
          return profile;
        }
      }
    }

    MediaProfile downgradeCandidate = null;
    MediaProfile approvedCandidate = null;
    for (MediaProfile profile : profiles.values()) {
      if (
        profile.host.equalsIgnoreCase(url.host()) &&
        profile.port == url.port()
      ) {
        if (
          "https".equals(profile.protocol) &&
          "http".equals(url.scheme())
        ) {
          if (downgradeCandidate != null) {
            return null;
          }
          downgradeCandidate = profile;
          continue;
        }

        try {
          profile.validateAbsoluteUrl(url);
          if (approvedCandidate != null) {
            return null;
          }
          approvedCandidate = profile;
        } catch (IOException ignored) {
          // Another profile may own the same host with a different base path.
        }
      }
    }
    if (approvedCandidate != null) {
      return approvedCandidate;
    }
    return downgradeCandidate;
  }

  private static String mediaSessionIdentity(MediaProfileConfig config) {
    return ClientCertModule.authenticationScopedServerIdentity(
      config.profileKey,
      config.auth,
      config.username,
      config.password
    );
  }

  private static Uri parseResourcePath(String resourcePath) throws IOException {
    if (resourcePath == null || resourcePath.trim().isEmpty()) {
      throw new IOException("A protected media resource path is required");
    }
    if (
      !resourcePath.startsWith("/") ||
      resourcePath.contains("?") ||
      resourcePath.contains("#")
    ) {
      throw new IOException("The protected media resource path is invalid");
    }
    Uri parsed = Uri.parse(resourcePath);
    if (
      parsed.getScheme() != null ||
      parsed.getAuthority() != null ||
      parsed.getUserInfo() != null
    ) {
      throw new IOException("The protected media resource path must be relative");
    }
    return parsed;
  }

  static String normalizePath(String encodedPath, boolean leadingSlash) throws IOException {
    if (encodedPath == null || encodedPath.isEmpty()) {
      return leadingSlash ? "/" : "";
    }
    if (
      encodedPath.contains("\\") ||
      encodedPath.contains("\u0000") ||
      encodedPath.matches("(?i).*%2e.*|.*%2f.*|.*%5c.*")
    ) {
      throw new IOException("The protected media path contains traversal");
    }
    String path = encodedPath.startsWith("/") ? encodedPath : "/" + encodedPath;
    for (String segment : path.split("/", -1)) {
      if (".".equals(segment) || "..".equals(segment)) {
        throw new IOException("The protected media path contains traversal");
      }
    }
    return path;
  }

  private static String jsonEscape(String value) {
    StringBuilder escaped = new StringBuilder(value.length());
    for (int index = 0; index < value.length(); index++) {
      char character = value.charAt(index);
      switch (character) {
        case '\\':
          escaped.append("\\\\");
          break;
        case '"':
          escaped.append("\\\"");
          break;
        case '\b':
          escaped.append("\\b");
          break;
        case '\f':
          escaped.append("\\f");
          break;
        case '\n':
          escaped.append("\\n");
          break;
        case '\r':
          escaped.append("\\r");
          break;
        case '\t':
          escaped.append("\\t");
          break;
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

  static final class MediaProfileConfig {
    final String logicalProfileId;
    final String profileKey;
    final String protocol;
    final String host;
    final int port;
    final String basePath;
    final String auth;
    final String username;
    final String password;
    final String alias;
    final String serverCertificatePin;
    final boolean localRoutingEnabled;
    final String localProtocol;
    final String localHost;
    final int localPort;
    final String localBasePath;
    final boolean localMtlsEnabled;
    final String localClientCertAlias;
    final String localServerCertificatePin;
    final boolean rtspEnabled;
    final int rtspPort;
    final boolean allowInsecureCredentials;

    MediaProfileConfig(
      String logicalProfileId,
      String profileKey,
      String protocol,
      String host,
      int port,
      String basePath,
      String auth,
      String username,
      String password,
      String alias,
      String serverCertificatePin
    ) {
      this(
        logicalProfileId, profileKey, protocol, host, port, basePath, auth,
        username, password,
        alias, serverCertificatePin, false, false, "", "", 0, "", false, "", "",
        false, RtspMediaPolicy.DEFAULT_PORT, false
      );
    }

    MediaProfileConfig(
      String logicalProfileId,
      String profileKey,
      String protocol,
      String host,
      int port,
      String basePath,
      String auth,
      String username,
      String password,
      String alias,
      String serverCertificatePin,
      boolean legacyRemoteHttpValue
    ) {
      this(
        logicalProfileId, profileKey, protocol, host, port, basePath, auth,
        username, password, alias, serverCertificatePin,
        legacyRemoteHttpValue, false, "", "", 0, "", false, "", "",
        false, RtspMediaPolicy.DEFAULT_PORT, false
      );
    }

    MediaProfileConfig(
      String profileKey,
      String protocol,
      String host,
      int port,
      String basePath,
      String auth,
      String username,
      String password,
      String alias,
      String serverCertificatePin
    ) {
      this(
        profileKey, profileKey, protocol, host, port, basePath, auth, username,
        password, alias, serverCertificatePin
      );
    }

    /*
     * Source-compatible migration constructors. A legacy true value means
     * "pin required" and can never re-enable trust-all behavior.
     */
    MediaProfileConfig(
      String profileKey, String protocol, String host, int port,
      String basePath, String auth, String username, String password,
      String alias, boolean legacyPinRequired
    ) {
      this(
        profileKey, protocol, host, port, basePath, auth, username, password,
        alias, legacyPinRequired ? "required" : ""
      );
    }

    MediaProfileConfig(
      String profileKey, String protocol, String host, int port,
      String basePath, String auth, String username, String password,
      String alias, boolean legacyPinRequired, boolean legacyRemoteConsent
    ) {
      this(
        profileKey, protocol, host, port, basePath, auth, username, password,
        alias, legacyPinRequired ? "required" : "", legacyRemoteConsent
      );
    }

    MediaProfileConfig(
      String logicalProfileId, String profileKey, String protocol, String host,
      int port, String basePath, String auth, String username, String password,
      String alias, boolean legacyPinRequired
    ) {
      this(
        logicalProfileId, profileKey, protocol, host, port, basePath, auth,
        username, password, alias, legacyPinRequired ? "required" : ""
      );
    }

    MediaProfileConfig(
      String logicalProfileId, String profileKey, String protocol, String host,
      int port, String basePath, String auth, String username, String password,
      String alias, boolean legacyPinRequired, boolean legacyRemoteConsent
    ) {
      this(
        logicalProfileId, profileKey, protocol, host, port, basePath, auth,
        username, password, alias, legacyPinRequired ? "required" : "",
        legacyRemoteConsent
      );
    }

    MediaProfileConfig(
      String logicalProfileId, String profileKey, String protocol, String host,
      int port, String basePath, String auth, String username, String password,
      String alias, boolean legacyPinRequired, boolean legacyRemoteConsent,
      boolean localRoutingEnabled, String localProtocol, String localHost,
      int localPort, String localBasePath, boolean localMtlsEnabled,
      String localClientCertAlias, boolean legacyLocalPinRequired,
      boolean rtspEnabled, int rtspPort, boolean allowInsecureCredentials
    ) {
      this(
        logicalProfileId, profileKey, protocol, host, port, basePath, auth,
        username, password, alias, legacyPinRequired ? "required" : "",
        legacyRemoteConsent, localRoutingEnabled, localProtocol, localHost,
        localPort, localBasePath, localMtlsEnabled, localClientCertAlias,
        legacyLocalPinRequired ? "required" : "", rtspEnabled, rtspPort,
        allowInsecureCredentials
      );
    }

    MediaProfileConfig(
      String profileKey, String protocol, String host, int port,
      String basePath, String auth, String username, String password,
      String alias, boolean legacyPinRequired, boolean localRoutingEnabled,
      String localProtocol, String localHost, int localPort,
      String localBasePath, boolean localMtlsEnabled,
      String localClientCertAlias, boolean legacyLocalPinRequired,
      boolean rtspEnabled, int rtspPort, boolean allowInsecureCredentials
    ) {
      this(
        profileKey, profileKey, protocol, host, port, basePath, auth, username,
        password, alias, legacyPinRequired ? "required" : "", false,
        localRoutingEnabled, localProtocol, localHost, localPort, localBasePath,
        localMtlsEnabled, localClientCertAlias,
        legacyLocalPinRequired ? "required" : "", rtspEnabled, rtspPort,
        allowInsecureCredentials
      );
    }

    MediaProfileConfig(
      String profileKey,
      String protocol,
      String host,
      int port,
      String basePath,
      String auth,
      String username,
      String password,
      String alias,
      String serverCertificatePin,
      boolean legacyRemoteHttpValue
    ) {
      this(
        profileKey, profileKey, protocol, host, port, basePath, auth, username,
        password, alias, serverCertificatePin, legacyRemoteHttpValue
      );
    }

    MediaProfileConfig(
      String logicalProfileId,
      String profileKey,
      String protocol,
      String host,
      int port,
      String basePath,
      String auth,
      String username,
      String password,
      String alias,
      String serverCertificatePin,
      boolean legacyRemoteHttpValue,
      boolean localRoutingEnabled,
      String localProtocol,
      String localHost,
      int localPort,
      String localBasePath,
      boolean localMtlsEnabled,
      String localClientCertAlias,
      String localServerCertificatePin,
      boolean rtspEnabled,
      int rtspPort,
      boolean allowInsecureCredentials
    ) {
      this.logicalProfileId = logicalProfileId == null || logicalProfileId.isEmpty()
        ? profileKey
        : logicalProfileId;
      this.profileKey = profileKey;
      this.protocol = protocol;
      this.host = host;
      this.port = port;
      this.basePath = basePath;
      this.auth = auth;
      this.username = username;
      this.password = password;
      this.alias = alias;
      this.serverCertificatePin = serverCertificatePin;
      this.localRoutingEnabled = localRoutingEnabled;
      this.localProtocol = localProtocol;
      this.localHost = localHost;
      this.localPort = localPort;
      this.localBasePath = localBasePath;
      this.localMtlsEnabled = localMtlsEnabled;
      this.localClientCertAlias = localClientCertAlias;
      this.localServerCertificatePin = localServerCertificatePin;
      this.rtspEnabled = rtspEnabled;
      this.rtspPort = rtspPort;
      this.allowInsecureCredentials = allowInsecureCredentials;
    }

    MediaProfileConfig(
      String logicalProfileId,
      String profileKey,
      String protocol,
      String host,
      int port,
      String basePath,
      String auth,
      String username,
      String password,
      String alias,
      String serverCertificatePin,
      boolean localRoutingEnabled,
      String localProtocol,
      String localHost,
      int localPort,
      String localBasePath,
      boolean localMtlsEnabled,
      String localClientCertAlias,
      String localServerCertificatePin,
      boolean rtspEnabled,
      int rtspPort,
      boolean allowInsecureCredentials
    ) {
      this(
        logicalProfileId, profileKey, protocol, host, port, basePath, auth,
        username, password, alias, serverCertificatePin, false,
        localRoutingEnabled, localProtocol, localHost, localPort, localBasePath,
        localMtlsEnabled, localClientCertAlias, localServerCertificatePin,
        rtspEnabled, rtspPort, allowInsecureCredentials
      );
    }

    MediaProfileConfig(
      String profileKey,
      String protocol,
      String host,
      int port,
      String basePath,
      String auth,
      String username,
      String password,
      String alias,
      String serverCertificatePin,
      boolean localRoutingEnabled,
      String localProtocol,
      String localHost,
      int localPort,
      String localBasePath,
      boolean localMtlsEnabled,
      String localClientCertAlias,
      String localServerCertificatePin,
      boolean rtspEnabled,
      int rtspPort,
      boolean allowInsecureCredentials
    ) {
      this(
        profileKey, profileKey, protocol, host, port, basePath, auth, username,
        password, alias, serverCertificatePin, false, localRoutingEnabled,
        localProtocol, localHost, localPort, localBasePath, localMtlsEnabled,
        localClientCertAlias, localServerCertificatePin, rtspEnabled, rtspPort,
        allowInsecureCredentials
      );
    }
  }

  static final class RtspMediaHandle {
    final String profileId;
    final String streamName;
    final long generation;

    RtspMediaHandle(String profileId, String streamName, long generation) {
      this.profileId = profileId;
      this.streamName = streamName;
      this.generation = generation;
    }
  }

  static final class ResolvedMediaRequest {
    final MediaProfile profile;
    final HttpUrl url;

    ResolvedMediaRequest(MediaProfile profile, HttpUrl url) {
      this.profile = profile;
      this.url = url;
    }
  }

  static final class LiveSocketRequest {
    final MediaProfile profile;
    final Request request;
    final long sessionGeneration;

    LiveSocketRequest(
      MediaProfile profile,
      Request request,
      long sessionGeneration
    ) {
      this.profile = profile;
      this.request = request;
      this.sessionGeneration = sessionGeneration;
    }
  }

  static final class ProtectedMediaException extends IOException {
    final int statusCode;

    ProtectedMediaException(int statusCode, String message) {
      super(message);
      this.statusCode = statusCode;
    }
  }

  static final class MediaProfile {
    final String id;
    final String logicalProfileId;
    final String profileKey;
    final String host;
    final int port;
    final ClientCertModule.NativeClientSession session;
    final String sessionIdentity;
    String protocol;
    String basePath;
    String auth;
    String username;
    String password;
    String alias;
    String serverCertificatePin;
    boolean localRoutingEnabled;
    String localProtocol;
    String localHost;
    int localPort;
    String localBasePath;
    boolean localMtlsEnabled;
    String localClientCertAlias;
    String localServerCertificatePin;
    boolean rtspEnabled;
    int rtspPort;
    boolean allowInsecureCredentials;

    MediaProfile(String id, MediaProfileConfig config, Context context) throws Exception {
      this.id = id;
      this.logicalProfileId = config.logicalProfileId;
      this.profileKey = config.profileKey;
      this.host = normalizeHost(config.host);
      this.port = effectivePort(config.protocol, config.port);
      this.sessionIdentity = mediaSessionIdentity(config);
      this.session = ClientCertModule.getSharedClientSession(
        context,
        emptyToNull(config.alias),
        sessionIdentity,
        config.serverCertificatePin
      );
      update(config);
    }

    synchronized void update(MediaProfileConfig config) throws Exception {
      validateConfig(config);
      if (!host.equalsIgnoreCase(normalizeHost(config.host))) {
        throw new IOException("The protected media profile host cannot change");
      }
      if (port != effectivePort(config.protocol, config.port)) {
        throw new IOException("The protected media profile port cannot change");
      }
      String nextProtocol = config.protocol.toLowerCase(Locale.US);
      String nextBasePath = normalizeBasePath(config.basePath);
      String nextAlias = config.alias == null ? "" : config.alias;
      if (protocol != null && !protocol.equals(nextProtocol)) {
        throw new IOException("The protected media profile protocol cannot change");
      }
      if (basePath != null && !basePath.equals(nextBasePath)) {
        throw new IOException("The protected media profile base path cannot change");
      }
      if (alias != null && !alias.equals(nextAlias)) {
        throw new IOException("The protected media profile identity cannot change");
      }
      if (protocol != null && !normalizedPin(serverCertificatePin).equals(normalizedPin(config.serverCertificatePin))) {
        throw new IOException("The protected media trust policy cannot change");
      }
      protocol = nextProtocol;
      basePath = nextBasePath;
      auth = config.auth.toLowerCase(Locale.US);
      username = config.username == null ? "" : config.username;
      password = config.password == null ? "" : config.password;
      alias = nextAlias;
      serverCertificatePin = config.serverCertificatePin;
      localRoutingEnabled = config.localRoutingEnabled;
      localProtocol = config.localProtocol == null ? "" : config.localProtocol;
      localHost = config.localHost == null ? "" : config.localHost;
      localPort = config.localPort;
      localBasePath = config.localBasePath == null ? "" : config.localBasePath;
      localMtlsEnabled = config.localMtlsEnabled;
      localClientCertAlias =
        config.localClientCertAlias == null ? "" : config.localClientCertAlias;
      localServerCertificatePin = config.localServerCertificatePin;
      rtspEnabled = config.rtspEnabled;
      rtspPort = config.rtspPort == 0
        ? RtspMediaPolicy.DEFAULT_PORT
        : config.rtspPort;
      allowInsecureCredentials = config.allowInsecureCredentials;
    }

    synchronized boolean canUpdate(MediaProfileConfig config) throws IOException {
      String nextAuth = config.auth == null
        ? ""
        : config.auth.toLowerCase(Locale.US);
      String nextUsername = config.username == null ? "" : config.username;
      String nextPassword = config.password == null ? "" : config.password;
      String nextProtocol = config.protocol.toLowerCase(Locale.US);
      String nextBasePath = normalizeBasePath(config.basePath);
      String nextAlias = config.alias == null ? "" : config.alias;
      String nextLocalProtocol = config.localProtocol == null
        ? ""
        : config.localProtocol;
      String nextLocalHost = config.localHost == null ? "" : config.localHost;
      String nextLocalBasePath = normalizeBasePath(config.localBasePath);
      String nextLocalClientCertAlias = config.localClientCertAlias == null
        ? ""
        : config.localClientCertAlias;
      int nextRtspPort = config.rtspPort == 0
        ? RtspMediaPolicy.DEFAULT_PORT
        : config.rtspPort;
      return profileKey.equals(config.profileKey) &&
        logicalProfileId.equals(config.logicalProfileId) &&
        host.equalsIgnoreCase(normalizeHost(config.host)) &&
        port == effectivePort(config.protocol, config.port) &&
        protocol.equals(nextProtocol) &&
        basePath.equals(nextBasePath) &&
        alias.equals(nextAlias) &&
        normalizedPin(serverCertificatePin).equals(normalizedPin(config.serverCertificatePin)) &&
        auth.equals(nextAuth) &&
        username.equals(nextUsername) &&
        password.equals(nextPassword) &&
        localRoutingEnabled == config.localRoutingEnabled &&
        localProtocol.equals(nextLocalProtocol) &&
        localHost.equals(nextLocalHost) &&
        localPort == config.localPort &&
        localBasePath.equals(nextLocalBasePath) &&
        localMtlsEnabled == config.localMtlsEnabled &&
        localClientCertAlias.equals(nextLocalClientCertAlias) &&
        normalizedPin(localServerCertificatePin).equals(normalizedPin(config.localServerCertificatePin)) &&
        rtspEnabled == config.rtspEnabled &&
        rtspPort == nextRtspPort &&
        allowInsecureCredentials == config.allowInsecureCredentials;
    }

    synchronized void retire() {
      ClientCertModule.removeSharedClientSession(
        emptyToNull(alias),
        sessionIdentity,
        serverCertificatePin
      );
    }

    static void validateConfig(MediaProfileConfig config) throws IOException {
      if (config == null || config.profileKey == null || config.profileKey.isEmpty()) {
        throw new IOException("A protected media profile key is required");
      }
      String protocol = config.protocol == null
        ? ""
        : config.protocol.toLowerCase(Locale.US);
      if (!"https".equals(protocol) && !"http".equals(protocol)) {
        throw new IOException("The protected media profile protocol is invalid");
      }
      if ("http".equals(protocol)) {
        throw new IOException("Remote HTTP is not supported");
      }
      String host = normalizeHost(config.host);
      if (host.isEmpty()) {
        throw new IOException("The protected media profile host is invalid");
      }
      try {
        new HttpUrl.Builder()
          .scheme(protocol)
          .host(host)
          .port(effectivePort(protocol, config.port))
          .build();
      } catch (IllegalArgumentException error) {
        throw new IOException("The protected media profile host is invalid", error);
      }
      if (config.alias != null && !config.alias.trim().isEmpty() && !"https".equals(protocol)) {
        throw new IOException("Client certificates require HTTPS");
      }
      String auth = config.auth == null ? "" : config.auth.toLowerCase(Locale.US);
      if (!"none".equals(auth) && !"basic".equals(auth) && !"frigate".equals(auth)) {
        throw new IOException("The protected media profile authentication mode is invalid");
      }
      if (("basic".equals(auth) || "frigate".equals(auth)) &&
        (config.username == null || config.password == null)) {
        throw new IOException("Protected media credentials are incomplete");
      }
      normalizeBasePath(config.basePath);
      if (config.localRoutingEnabled) {
        String localProtocol = config.localProtocol == null
          ? ""
          : config.localProtocol.toLowerCase(Locale.US);
        if (!"http".equals(localProtocol) && !"https".equals(localProtocol)) {
          throw new IOException("The local route protocol is invalid");
        }
        normalizeHost(config.localHost);
        if (config.localPort < 1 || config.localPort > 65535) {
          throw new IOException("The local route port is invalid");
        }
        normalizeBasePath(config.localBasePath);
        if (config.localMtlsEnabled &&
          (config.localClientCertAlias == null ||
            config.localClientCertAlias.trim().isEmpty())) {
          throw new IOException("The local client identity is unavailable");
        }
        if (config.localMtlsEnabled && !"https".equals(localProtocol)) {
          throw new IOException("Local client certificates require HTTPS");
        }
      }
      if (config.rtspEnabled) {
        RtspMediaPolicy.validatePort(config.rtspPort);
        if (!config.localRoutingEnabled) {
          throw new IOException("Local RTSP requires local routing");
        }
      }
    }

    HttpUrl toServerUrl(String profilePath, String encodedQuery) throws IOException {
      String actualPath = joinBasePath(basePath, profilePath);
      HttpUrl.Builder builder = new HttpUrl.Builder()
        .scheme(protocol)
        .host(host)
        .port(port)
        .encodedPath(actualPath);
      if (encodedQuery != null) {
        builder.encodedQuery(encodedQuery);
      }
      HttpUrl url;
      try {
        url = builder.build();
      } catch (IllegalArgumentException error) {
        throw new IOException("The protected media URL is invalid", error);
      }
      validateAbsoluteUrl(url);
      return url;
    }

    void validateAbsoluteUrl(HttpUrl url) throws IOException {
      if (!protocol.equalsIgnoreCase(url.scheme())) {
        if (!("https".equals(protocol) && "http".equals(url.scheme()))) {
          throw new IOException("The protected media scheme is not allowed");
        }
        throw new IOException("HTTPS-to-HTTP media downgrade rejected");
      }
      if (!host.equalsIgnoreCase(url.host()) || port != url.port()) {
        throw new IOException("The protected media host is not approved");
      }
      String path = normalizePath(url.encodedPath(), true);
      if (!isMediaPath(path, basePath)) {
        throw new IOException("The protected media path is not approved");
      }
      requireRemoteHttpConsent();
    }

    void requireRemoteHttpConsent() throws IOException {
      if ("http".equalsIgnoreCase(protocol)) {
        throw new IOException("Remote HTTP is not supported");
      }
    }

    boolean isMediaPath(String path) throws IOException {
      return isMediaPath(joinBasePath(basePath, path), basePath);
    }

    LocalRouteResolver.RouteConfig localRouteConfig() {
      return new LocalRouteResolver.RouteConfig(
        sessionIdentity,
        protocol + "://" + host + ":" + port + "/",
        localRoutingEnabled,
        localProtocol,
        localHost,
        localPort,
        localBasePath,
        auth,
        username,
        password,
        localMtlsEnabled,
        localClientCertAlias,
        localServerCertificatePin
      );
    }

    HttpUrl loginUrl() throws IOException {
      return toServerUrl(joinPath("/api", "/login"), null);
    }

    HttpUrl liveSocketUrl(String streamName) throws IOException {
      try {
        return new HttpUrl.Builder()
          .scheme(protocol)
          .host(host)
          .port(port)
          .encodedPath(
            normalizePath(joinPath(basePath, "/live/webrtc/api/ws"), true)
          )
          .addQueryParameter("src", streamName)
          .build();
      } catch (IllegalArgumentException error) {
        throw new IOException(
          "The protected live signaling URL is invalid",
          error
        );
      }
    }

    HttpUrl mseSocketUrl(String streamName) throws IOException {
      try {
        return new HttpUrl.Builder()
          .scheme(protocol)
          .host(host)
          .port(port)
          .encodedPath(
            normalizePath(joinPath(basePath, "/live/mse/api/ws"), true)
          )
          .addQueryParameter("src", streamName)
          .build();
      } catch (IllegalArgumentException error) {
        throw new IOException("The protected MSE URL is invalid", error);
      }
    }

    private static String normalizeHost(String value) throws IOException {
      String host = value == null ? "" : value.trim();
      if (host.startsWith("[") && host.endsWith("]")) {
        host = host.substring(1, host.length() - 1);
      }
      if (
        host.isEmpty() ||
        host.contains("/") ||
        host.contains("\\") ||
        host.contains("@") ||
        host.contains("?") ||
        host.contains("#") ||
        host.matches(".*\\s+.*")
      ) {
        throw new IOException("The protected media host is invalid");
      }
      return host.toLowerCase(Locale.US);
    }

    private static int effectivePort(String protocol, int configuredPort) throws IOException {
      if (configuredPort == 0) {
        return "https".equalsIgnoreCase(protocol) ? 443 : 80;
      }
      if (configuredPort < 1 || configuredPort > 65535) {
        throw new IOException("The protected media port is invalid");
      }
      return configuredPort;
    }

    private static String normalizeBasePath(String value) throws IOException {
      String path = value == null ? "" : value.trim();
      if (path.isEmpty() || "/".equals(path)) {
        return "";
      }
      if (path.contains("?") || path.contains("#")) {
        throw new IOException("The protected media base path is invalid");
      }
      String normalized = normalizePath(path, true);
      return normalized.endsWith("/") && normalized.length() > 1
        ? normalized.substring(0, normalized.length() - 1)
        : normalized;
    }

    private static String joinBasePath(String basePath, String profilePath)
      throws IOException {
      String path = normalizePath(profilePath, true);
      String mediaRoot = joinPath(basePath, "/api");
      if (
        !basePath.isEmpty() &&
        (path.equals(mediaRoot) || path.startsWith(mediaRoot + "/"))
      ) {
        return path;
      }
      return normalizePath(joinPath(basePath, path), true);
    }

    private static String joinPath(String left, String right) {
      String first = left == null ? "" : left;
      String second = right == null ? "" : right;
      if (first.isEmpty()) {
        return second.isEmpty() ? "/" : second;
      }
      if (second.isEmpty()) {
        return first;
      }
      return first.endsWith("/") ? first + second.substring(
        second.startsWith("/") ? 1 : 0
      ) : first + (second.startsWith("/") ? second : "/" + second);
    }

    private static boolean isMediaPath(String path, String basePath) {
      return isUnderMediaRoot(path, joinPath(basePath, "/api")) ||
        isUnderMediaRoot(path, joinPath(basePath, "/vod"));
    }

    private static boolean isUnderMediaRoot(String path, String root) {
      return path.equals(root) || path.startsWith(root + "/");
    }

    private static String emptyToNull(String value) {
      return value == null || value.trim().isEmpty() ? null : value;
    }

    private static String normalizedPin(String value) {
      return value == null ? "" : value.trim().toLowerCase(Locale.US);
    }
  }
}