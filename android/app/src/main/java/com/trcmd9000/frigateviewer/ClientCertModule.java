package com.trcmd9000.frigateviewer;

import android.app.Activity;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.security.KeyChain;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.Principal;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import javax.net.ssl.KeyManager;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLEngine;
import javax.net.ssl.SSLHandshakeException;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509ExtendedKeyManager;
import javax.net.ssl.X509TrustManager;

import okhttp3.Cookie;
import okhttp3.CookieJar;
import okhttp3.Headers;
import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

/**
 * Provides access to user-approved client identities from Android KeyChain.
 */
public class ClientCertModule extends ReactContextBaseJavaModule implements LifecycleEventListener {
  private static final String MODULE_NAME = "ClientCertModule";
  private static final String SELECT_CANCELLED = "CERT_SELECTION_CANCELLED";
  private static final String TAG = "FrigateClientCert";
  private static final String MEDIA_CACHE_DIRECTORY = "frigate-media";
  private static final long MAX_MEDIA_BYTES = 256L * 1024L * 1024L;
  private static final int MAX_LIVE_MESSAGE_CHARS = 1024 * 1024;
  private static final long MEDIA_MAX_AGE_MS = 24L * 60L * 60L * 1000L;
  private static final Object MEDIA_CACHE_LOCK = new Object();

  private final ReactApplicationContext reactContext;
  private final ExecutorService executor = Executors.newFixedThreadPool(4);
  private final Map<String, ProtectedLiveSocket> protectedLiveSockets =
    new ConcurrentHashMap<>();
  private final LocalRouteResolver localRouteResolver;
  private final ConnectivityManager connectivityManager;
  private final ConnectivityManager.NetworkCallback networkCallback =
    new ConnectivityManager.NetworkCallback() {
      @Override
      public void onAvailable(Network network) {
        localRouteResolver.invalidate();
        MediaProfileRegistry.get(reactContext).invalidateLocalRoutes();
      }

      @Override
      public void onLost(Network network) {
        localRouteResolver.invalidate();
        MediaProfileRegistry.get(reactContext).invalidateLocalRoutes();
      }

      @Override
      public void onLinkPropertiesChanged(Network network, android.net.LinkProperties properties) {
        localRouteResolver.invalidate();
        MediaProfileRegistry.get(reactContext).invalidateLocalRoutes();
      }
    };

  /**
   * All native HTTP entry points use this registry. Keeping the client and
   * CookieJar together is what lets a Media3 request observe a login performed
   * by the regular API client (and vice versa) without moving cookies through
   * JavaScript.
   */
  private static final Map<String, NativeClientSession> clientSessions =
    new ConcurrentHashMap<>();

  public ClientCertModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;
    this.localRouteResolver = new LocalRouteResolver(reactContext);
    this.connectivityManager =
      (ConnectivityManager) reactContext.getSystemService(Context.CONNECTIVITY_SERVICE);
    reactContext.addLifecycleEventListener(this);
    if (connectivityManager != null) {
      try {
        connectivityManager.registerDefaultNetworkCallback(networkCallback);
      } catch (RuntimeException error) {
        Log.w(TAG, "Unable to observe Android network changes", error);
      }
    }
    MediaProfileRegistry.initialize(reactContext);
  }

  @Override
  public String getName() {
    return MODULE_NAME;
  }

  @Override
  public void invalidate() {
    protectedLiveSockets.forEach((socketId, liveSocket) -> liveSocket.close());
    protectedLiveSockets.clear();
    MediaProfileRegistry.get(reactContext).invalidateAll();
    retireAllClientSessions();
    reactContext.removeLifecycleEventListener(this);
    if (connectivityManager != null) {
      try {
        connectivityManager.unregisterNetworkCallback(networkCallback);
      } catch (RuntimeException ignored) {
        // The callback may not have been registered on old Android versions.
      }
    }
    executor.shutdownNow();
    super.invalidate();
  }

  @Override
  public void onHostResume() {
    localRouteResolver.invalidate();
    MediaProfileRegistry.get(reactContext).invalidateLocalRoutes();
  }

  @Override
  public void onHostPause() {}

  @Override
  public void onHostDestroy() {
    localRouteResolver.invalidate();
    MediaProfileRegistry.get(reactContext).invalidateLocalRoutes();
  }

  @ReactMethod
  public void addListener(String eventName) {
    // Required by NativeEventEmitter.
  }

  @ReactMethod
  public void removeListeners(double count) {
    // Required by NativeEventEmitter.
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  public String scopeServerIdentity(
    String serverIdentity,
    String auth,
    String username,
    String password
  ) {
    return authenticationScopedServerIdentity(
      serverIdentity,
      auth,
      username,
      password
    );
  }

  @ReactMethod
  public void invalidateServerSession(
    String serverIdentity,
    String auth,
    String username,
    String password
  ) {
    if (serverIdentity == null || serverIdentity.trim().isEmpty()) {
      return;
    }
    String scopedIdentity = serverIdentity.contains("\u0000auth\u0000")
      ? serverIdentity
      : authenticationScopedServerIdentity(
        serverIdentity,
        auth,
        username,
        password
      );
    retireClientSessionsForIdentity(scopedIdentity);
  }

  @ReactMethod
  public void invalidateMediaProfile(String profileKey) {
    if (profileKey == null || profileKey.trim().isEmpty()) {
      return;
    }
    MediaProfileRegistry.get(reactContext).unregister(
      profileKey,
      this::closeProtectedLiveSocketsForProfile
    );
  }

  /**
   * Android intentionally does not allow apps to enumerate system identities.
   * Selection must happen through the protected system KeyChain dialog.
   */
  @ReactMethod
  public void selectCertificate(String currentAlias, Promise promise) {
    Activity activity = getCurrentActivity();
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "Certificate selection requires a foreground activity");
      return;
    }

    activity.runOnUiThread(() ->
      KeyChain.choosePrivateKeyAlias(
        activity,
        alias -> {
          if (alias == null) {
            promise.reject(SELECT_CANCELLED, "Certificate selection was cancelled");
          } else {
            promise.resolve(alias);
          }
        },
        null,
        null,
        null,
        -1,
        currentAlias
      )
    );
  }

  @ReactMethod
  public void checkCertificateAvailability(String alias, Promise promise) {
    executor.execute(() -> {
      try {
        boolean available =
          KeyChain.getPrivateKey(reactContext, alias) != null &&
          KeyChain.getCertificateChain(reactContext, alias) != null;
        WritableMap result = Arguments.createMap();
        result.putBoolean("exists", available);
        result.putBoolean("isPrivateKeyEntry", available);
        result.putString("alias", alias);
        promise.resolve(result);
      } catch (Exception error) {
        promise.reject("KEYCHAIN_ERROR", "Unable to access the selected certificate", error);
      }
    });
  }

  @ReactMethod
  public void performHttpRequestWithClientCert(
    String url,
    String alias,
    String serverIdentity,
    String method,
    ReadableArray headers,
    String body,
    boolean allowSelfSignedServer,
    Promise promise
  ) {
    executor.execute(() -> {
      try {
        if (serverIdentity == null || serverIdentity.trim().isEmpty()) {
          promise.reject("SERVER_SCOPE_REQUIRED", "A server identity is required");
          return;
        }
        Request.Builder requestBuilder = new Request.Builder().url(url);
        if (headers != null) {
          for (int index = 0; index < headers.size(); index++) {
            ReadableMap header = headers.getMap(index);
            if (header == null) {
              continue;
            }
            String name = header.getString("key");
            String value = header.getString("value");
            if (name != null && value != null) {
              requestBuilder.addHeader(name, value);
            }
          }
        }

        RequestBody requestBody =
          permitsRequestBody(method)
            ? RequestBody.create(body == null ? "" : body, null)
            : null;
        requestBuilder.method(method, permitsRequestBody(method) ? requestBody : null);
        Request request = requestBuilder.build();
        if (!request.url().isHttps()) {
          promise.reject("TLS_REQUIRED", "Client certificates require HTTPS");
          return;
        }

        OkHttpClient client =
          createHttpClient(alias, serverIdentity, allowSelfSignedServer);
        if (isLocalRouteIdentity(serverIdentity)) {
          client = LocalRouteResolver.checkedClient(client);
        }
        try (Response response = client.newCall(request).execute()) {
          String contentType =
            response.body() == null || response.body().contentType() == null
              ? "unknown"
              : response.body().contentType().toString();
          Log.i(
            TAG,
            "mTLS request completed with HTTP " + response.code() +
            " and content type " + contentType
          );
          WritableMap result = Arguments.createMap();
          result.putInt("statusCode", response.code());
          result.putString("body", response.body() == null ? "" : response.body().string());

          WritableMap responseHeaders = Arguments.createMap();
          Headers receivedHeaders = response.headers();
          for (String name : receivedHeaders.names()) {
            responseHeaders.putString(name, receivedHeaders.get(name));
          }
          result.putMap("headers", responseHeaders);
          if (response.isSuccessful() && isLoginRequest(request)) {
            markLoginSuccess(alias, serverIdentity, allowSelfSignedServer);
          }
          promise.resolve(result);
        }
      } catch (Exception error) {
        rejectRequestError(promise, error);
      }
    });
  }

  @ReactMethod
  public void performHttpRequest(
    String url,
    String serverIdentity,
    String method,
    ReadableArray headers,
    String body,
    Promise promise
  ) {
    executor.execute(() -> {
      try {
        if (serverIdentity == null || serverIdentity.trim().isEmpty()) {
          promise.reject("SERVER_SCOPE_REQUIRED", "A server identity is required");
          return;
        }

        Request.Builder requestBuilder = new Request.Builder().url(url);
        if (headers != null) {
          for (int index = 0; index < headers.size(); index++) {
            ReadableMap header = headers.getMap(index);
            if (header == null) {
              continue;
            }
            String name = header.getString("key");
            String value = header.getString("value");
            if (name != null && value != null) {
              requestBuilder.addHeader(name, value);
            }
          }
        }

        RequestBody requestBody =
          permitsRequestBody(method)
            ? RequestBody.create(body == null ? "" : body, null)
            : null;
        requestBuilder.method(method, permitsRequestBody(method) ? requestBody : null);
        Request request = requestBuilder.build();
        OkHttpClient client = createDefaultHttpClient(serverIdentity);
        if (isLocalRouteIdentity(serverIdentity)) {
          client = LocalRouteResolver.checkedClient(client);
        }
        try (Response response = client.newCall(request).execute()) {
          WritableMap result = Arguments.createMap();
          result.putInt("statusCode", response.code());
          result.putString("body", response.body() == null ? "" : response.body().string());
          WritableMap responseHeaders = Arguments.createMap();
          for (String name : response.headers().names()) {
            responseHeaders.putString(name, response.headers().get(name));
          }
          result.putMap("headers", responseHeaders);
          if (response.isSuccessful() && isLoginRequest(requestBuilder.build())) {
            markLoginSuccess(null, serverIdentity, false);
          }
          promise.resolve(result);
        }
      } catch (Exception error) {
        rejectRequestError(promise, error);
      }
    });
  }

  /**
   * Resolve an API route after an authenticated local Frigate healthcheck.
   * Endpoint and TLS details stay native; JavaScript receives only a route
   * decision and the non-secret base URL needed to construct its request.
   */
  @ReactMethod
  public void resolveServerRoute(
    ReadableMap config,
    String method,
    Promise promise
  ) {
    executor.execute(() -> {
      try {
        if (config == null) {
          promise.reject("ROUTE_CONFIG_REQUIRED", "A route configuration is required");
          return;
        }
        LocalRouteResolver.RouteConfig routeConfig =
          new LocalRouteResolver.RouteConfig(
            mapString(config, "profileKey"),
            mapString(config, "remoteBaseUrl"),
            mapBoolean(config, "localRoutingEnabled"),
            mapString(config, "localProtocol"),
            mapString(config, "localHost"),
            mapInt(config, "localPort"),
            mapString(config, "localBasePath"),
            mapString(config, "auth"),
            mapString(config, "username"),
            mapString(config, "password"),
            mapBoolean(config, "localMtlsEnabled"),
            mapString(config, "localClientCertAlias"),
            mapBoolean(config, "localAllowSelfSignedServer")
          );
        LocalRouteResolver.Resolution resolution =
          localRouteResolver.resolve(routeConfig, method);
        WritableMap result = Arguments.createMap();
        result.putString("route", resolution.local ? "local" : "remote");
        result.putString("baseUrl", resolution.baseUrl);
        result.putDouble("generation", resolution.generation);
        if (resolution.failure != null) {
          result.putString("reason", resolution.failure.name());
        }
        promise.resolve(result);
      } catch (LocalRouteResolver.RouteFailureException error) {
        promise.reject(error.code.name(), error.getMessage(), error);
      } catch (Exception error) {
        promise.reject("ROUTE_RESOLUTION_FAILED", "Unable to resolve the server route", error);
      }
    });
  }

  @ReactMethod
  public void downloadFileWithClientCert(
    String url,
    String alias,
    String serverIdentity,
    ReadableArray headers,
    boolean allowSelfSignedServer,
    int maxBytes,
    int mediaReservationId,
    Promise promise
  ) {
    executor.execute(() ->
      downloadFileInternal(
        url,
        alias,
        serverIdentity,
        headers,
        allowSelfSignedServer,
        true,
        maxBytes,
        mediaReservationId,
        promise
      )
    );
  }

  @ReactMethod
  public void downloadFileWithoutClientCert(
    String url,
    String serverIdentity,
    ReadableArray headers,
    int maxBytes,
    int mediaReservationId,
    Promise promise
  ) {
    executor.execute(() ->
      downloadFileInternal(
        url,
        null,
        serverIdentity,
        headers,
        false,
        false,
        maxBytes,
        mediaReservationId,
        promise
      )
    );
  }

  @ReactMethod
  public void registerMediaProfile(ReadableMap config, Promise promise) {
    final MediaProfileRegistry registry = MediaProfileRegistry.get(reactContext);
    final String profileKey =
      config == null ? "" : mapString(config, "profileKey");
    final MediaProfileRegistry.RegistrationToken registrationToken;
    try {
      registrationToken = profileKey.trim().isEmpty()
        ? null
        : registry.reserveRegistration(profileKey);
    } catch (RuntimeException error) {
      promise.reject(
        "MEDIA_PROFILE_INVALID",
        "The protected media profile is invalid",
        error
      );
      return;
    }
    try {
      executor.execute(() -> {
      try {
        if (config == null) {
          promise.reject("MEDIA_PROFILE_REQUIRED", "A protected media profile is required");
          return;
        }
        MediaProfileRegistry.MediaProfileConfig profileConfig =
          new MediaProfileRegistry.MediaProfileConfig(
            mapString(config, "profileId"),
            mapString(config, "profileKey"),
            mapString(config, "protocol"),
            mapString(config, "host"),
            mapInt(config, "port"),
            mapString(config, "path"),
            mapString(config, "auth"),
            mapString(config, "username"),
            mapString(config, "password"),
            mapString(config, "clientCertAlias"),
            mapBoolean(config, "allowSelfSignedServer"),
            mapBoolean(config, "allowInsecureRemoteHttp"),
            mapBoolean(config, "localRoutingEnabled"),
            mapString(config, "localProtocol"),
            mapString(config, "localHost"),
            mapInt(config, "localPort"),
            mapString(config, "localBasePath"),
            mapBoolean(config, "localMtlsEnabled"),
            mapString(config, "localClientCertAlias"),
            mapBoolean(config, "localAllowSelfSignedServer"),
            mapBoolean(config, "rtspEnabled"),
            mapInt(config, "rtspPort"),
            mapBoolean(config, "allowInsecureCredentials")
          );
        String profileId = registry.register(
          profileConfig,
          this::closeProtectedLiveSocketsForProfile,
          registrationToken
        );
        protectedLiveSockets.forEach((socketId, liveSocket) -> {
          if (
            !registry.hasProfile(liveSocket.profileId) &&
            protectedLiveSockets.remove(socketId, liveSocket)
          ) {
            liveSocket.close();
          }
        });
        promise.resolve(profileId);
      } catch (Exception error) {
        promise.reject("MEDIA_PROFILE_INVALID", "The protected media profile is invalid", error);
      } finally {
        registry.completeRegistration(registrationToken);
      }
      });
    } catch (RuntimeException error) {
      registry.completeRegistration(registrationToken);
      promise.reject(
        "MEDIA_PROFILE_INVALID",
        "The protected media profile is invalid",
        error
      );
    }
  }

  private void closeProtectedLiveSocketsForProfile(String profileId) {
    protectedLiveSockets.forEach((socketId, liveSocket) -> {
      if (
        profileId.equals(liveSocket.profileId) &&
        protectedLiveSockets.remove(socketId, liveSocket)
      ) {
        liveSocket.close();
      }
    });
  }

  @ReactMethod
  public void createRtspMediaUri(
    String profileId,
    String streamName,
    Promise promise
  ) {
    executor.execute(() -> {
      try {
        promise.resolve(
          MediaProfileRegistry
            .get(reactContext)
            .createRtspMediaUri(profileId, streamName)
        );
      } catch (LocalRouteResolver.RouteFailureException error) {
        promise.reject(error.code.name(), "Local RTSP route validation failed", error);
      } catch (Exception error) {
        promise.reject("RTSP_MEDIA_INVALID", "The local RTSP media handle is invalid", error);
      }
    });
  }

  @ReactMethod
  public void releaseRtspMediaUri(String profileId, String handle) {
    try {
      MediaProfileRegistry
        .get(reactContext)
        .releaseRtspMediaUri(profileId, handle);
    } catch (Exception ignored) {
      // Handles are opaque and release is best effort during teardown.
    }
  }

  @ReactMethod
  public void createMediaUri(
    String profileId,
    String resourcePath,
    Promise promise
  ) {
    executor.execute(() -> {
      try {
        promise.resolve(
          MediaProfileRegistry
            .get(reactContext)
            .createMediaUri(profileId, resourcePath)
        );
      } catch (Exception error) {
        promise.reject("MEDIA_URI_INVALID", "The protected media URI is invalid", error);
      }
    });
  }

  @ReactMethod
  public void openProtectedLiveSocket(
    String profileId,
    String streamName,
    Promise promise
  ) {
    executor.execute(() -> {
      String socketId = java.util.UUID
        .randomUUID()
        .toString()
        .replace("-", "");
      ProtectedLiveSocket liveSocket = new ProtectedLiveSocket(
        socketId,
        profileId,
        streamName
      );
      protectedLiveSockets.put(socketId, liveSocket);
      try {
        liveSocket.connect();
        promise.resolve(socketId);
      } catch (IOException error) {
        protectedLiveSockets.remove(socketId, liveSocket);
        liveSocket.close();
        promise.reject(
          "LIVE_SIGNALING_OPEN_FAILED",
          "Unable to open protected live signaling",
          error
        );
      }
    });
  }

  @ReactMethod
  public void sendProtectedLiveSocketMessage(
    String socketId,
    String message,
    Promise promise
  ) {
    ProtectedLiveSocket liveSocket = protectedLiveSockets.get(socketId);
    if (liveSocket == null || !liveSocket.send(message)) {
      promise.reject(
        "LIVE_SIGNALING_UNAVAILABLE",
        "Protected live signaling is unavailable"
      );
      return;
    }
    promise.resolve(null);
  }

  @ReactMethod
  public void closeProtectedLiveSocket(String socketId) {
    ProtectedLiveSocket liveSocket = protectedLiveSockets.remove(socketId);
    if (liveSocket != null) {
      liveSocket.close();
    }
  }

  @ReactMethod
  public void probeMediaCodecCapabilities(Promise promise) {
    executor.execute(() -> {
      try {
        promise.resolve(MediaCodecCapabilityProbe.probe());
      } catch (RuntimeException error) {
        promise.reject("CODEC_CAPABILITY_PROBE_FAILED", "Codec capability discovery is unavailable");
      }
    });
  }

  private void emitLiveSocketState(
    String socketId,
    String state,
    int statusCode
  ) {
    WritableMap event = Arguments.createMap();
    event.putString("socketId", socketId);
    event.putString("state", state);
    if (statusCode > 0) {
      event.putInt("statusCode", statusCode);
    }
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
      .emit("protectedLiveSocketState", event);
  }

  private void emitLiveSocketMessage(String socketId, String message) {
    WritableMap event = Arguments.createMap();
    event.putString("socketId", socketId);
    event.putString("message", message);
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
      .emit("protectedLiveSocketMessage", event);
  }

  private void downloadFileInternal(
    String url,
    String alias,
    String serverIdentity,
    ReadableArray headers,
    boolean allowSelfSignedServer,
    boolean withClientCert,
    int maxBytes,
    int mediaReservationId,
    Promise promise
  ) {
    File temporaryFile = null;
    try {
      if (serverIdentity == null || serverIdentity.trim().isEmpty()) {
        promise.reject("SERVER_SCOPE_REQUIRED", "A server identity is required");
        return;
      }

      if (maxBytes <= 0) {
        promise.reject("MEDIA_BUDGET_REQUIRED", "A positive media byte budget is required");
        return;
      }
      if (mediaReservationId <= 0) {
        promise.reject("MEDIA_RESERVATION_REQUIRED", "A media reservation is required");
        return;
      }
      Request.Builder requestBuilder = new Request.Builder().url(url).get();
      if (headers != null) {
        for (int index = 0; index < headers.size(); index++) {
          ReadableMap header = headers.getMap(index);
          if (header == null) {
            continue;
          }
          String name = header.getString("key");
          String value = header.getString("value");
          if (name != null && value != null) {
            requestBuilder.addHeader(name, value);
          }
        }
      }

      Request request = requestBuilder.build();
      if (withClientCert && !request.url().isHttps()) {
        promise.reject("TLS_REQUIRED", "Client certificates require HTTPS");
        return;
      }

      OkHttpClient client =
        withClientCert
          ? createHttpClient(alias, serverIdentity, allowSelfSignedServer)
          : createDefaultHttpClient(serverIdentity);
      client = client.newBuilder().callTimeout(30, TimeUnit.SECONDS).build();
      Log.i(TAG, "media download started with a bounded byte budget");
      try (Response response = client.newCall(request).execute()) {
        String contentType =
          response.body() == null || response.body().contentType() == null
            ? "unknown"
            : response.body().contentType().toString();
        Log.i(
          TAG,
          "media download completed with HTTP " + response.code() +
          " and content type " + contentType
        );
        if (!response.isSuccessful()) {
          WritableMap result = Arguments.createMap();
          result.putInt("statusCode", response.code());
          result.putString("path", "");
          result.putString("contentType", contentType);
          promise.resolve(result);
          return;
        }
        if (response.body() == null) {
          promise.reject("HTTP_EMPTY_BODY", "Media download returned an empty body");
          return;
        }

        if (isUnexpectedMediaContentType(contentType)) {
          promise.reject(
            "HTTP_CONTENT_TYPE_ERROR",
            "Media download returned an unexpected content type"
          );
          return;
        }

        long byteLimit = Math.min(MAX_MEDIA_BYTES, (long) maxBytes);
        long contentLength = response.body().contentLength();
        if (contentLength > byteLimit) {
          promise.reject("HTTP_SIZE_ERROR", "Media download exceeded the size limit");
          return;
        }

        File mediaCache = new File(reactContext.getCacheDir(), MEDIA_CACHE_DIRECTORY);
        synchronized (MEDIA_CACHE_LOCK) {
          if (!mediaCache.exists() && !mediaCache.mkdirs()) {
            throw new IOException("Unable to create the media cache directory");
          }
          cleanupMediaCache(mediaCache, null);
          temporaryFile = File.createTempFile(
            "download-" + mediaReservationId + "-",
            ".part",
            mediaCache
          );
        }
        try (
          InputStream input = response.body().byteStream();
          FileOutputStream output = new FileOutputStream(temporaryFile)
        ) {
          byte[] buffer = new byte[8192];
          int bytesRead;
          long totalBytes = 0;
          while ((bytesRead = input.read(buffer)) != -1) {
            totalBytes += bytesRead;
            if (totalBytes > byteLimit) {
              throw new IOException("Media download exceeded the size limit");
            }
            output.write(buffer, 0, bytesRead);
          }
          if (totalBytes == 0) {
            throw new IOException("Media download returned an empty body");
          }
        }

        synchronized (MEDIA_CACHE_LOCK) {
          cleanupMediaCache(mediaCache, temporaryFile);
        }

        WritableMap result = Arguments.createMap();
        result.putInt("statusCode", response.code());
        result.putString("path", temporaryFile.getAbsolutePath());
        result.putString("contentType", contentType);
        // Keep the download-*.part name until JS validates and commits it.
        temporaryFile = null;
        promise.resolve(result);
      }
    } catch (Exception error) {
      if (temporaryFile != null && temporaryFile.exists() && !temporaryFile.delete()) {
        Log.w(TAG, "Unable to remove incomplete media cache file");
      }
      rejectRequestError(promise, error);
    }
  }

  private static String mapString(ReadableMap map, String key) {
    return map.hasKey(key) && !map.isNull(key) ? map.getString(key) : "";
  }

  private static int mapInt(ReadableMap map, String key) {
    return map.hasKey(key) && !map.isNull(key) ? map.getInt(key) : 0;
  }

  private static boolean mapBoolean(ReadableMap map, String key) {
    return map.hasKey(key) && !map.isNull(key) && map.getBoolean(key);
  }

  static NativeClientSession getSharedClientSession(
    android.content.Context context,
    String alias,
    String serverIdentity,
    boolean allowSelfSignedServer
  ) throws Exception {
    String clientKey = clientSessionKey(
      alias,
      serverIdentity,
      allowSelfSignedServer
    );

    synchronized (clientSessions) {
      String scopePrefix = authenticationScopePrefix(serverIdentity);
      if (scopePrefix != null) {
        clientSessions.forEach((key, session) -> {
          if (
            scopePrefix.equals(authenticationScopePrefix(session.serverIdentity)) &&
            !(
              serverIdentity.equals(session.serverIdentity) &&
              allowSelfSignedServer == session.allowSelfSignedServer &&
              (alias == null ? "" : alias).equals(session.alias == null ? "" : session.alias)
            ) &&
            clientSessions.remove(key, session)
          ) {
            closeClientSession(session);
          }
        });
      }

      NativeClientSession existing = clientSessions.get(clientKey);
      if (existing != null) {
        return existing;
      }

      OkHttpClient.Builder clientBuilder;
      if (alias == null || alias.trim().isEmpty()) {
        clientBuilder = new OkHttpClient.Builder();
        if (allowSelfSignedServer) {
          X509TrustManager trustManager = createTrustManager(true);
          SSLContext sslContext = SSLContext.getInstance("TLS");
          sslContext.init(null, new TrustManager[] {trustManager}, null);
          clientBuilder.sslSocketFactory(sslContext.getSocketFactory(), trustManager);
        }
      } else {
        SSLContext sslContext =
          createClientSslContext(context, alias, allowSelfSignedServer);
        X509TrustManager trustManager = createTrustManager(allowSelfSignedServer);
        clientBuilder = new OkHttpClient.Builder()
          .sslSocketFactory(sslContext.getSocketFactory(), trustManager);
      }

      NativeClientSession created = new NativeClientSession(
        serverIdentity,
        alias,
        allowSelfSignedServer,
        clientBuilder
          .followRedirects(false)
          .followSslRedirects(false)
          .cookieJar(new InMemoryCookieJar())
          .build()
      );
      clientSessions.put(clientKey, created);
      return created;
    }
  }

  private static String clientSessionKey(
    String alias,
    String serverIdentity,
    boolean allowSelfSignedServer
  ) {
    String identityKey = serverIdentity == null ? "" : serverIdentity;
    return opaqueFingerprint(
      identityKey + "\u0000" + (alias == null ? "" : alias) +
      "\u0000" + allowSelfSignedServer
    );
  }

  static String authenticationScopedServerIdentity(
    String serverIdentity,
    String auth,
    String username,
    String password
  ) {
    if (serverIdentity == null || serverIdentity.trim().isEmpty()) {
      throw new IllegalArgumentException("A server identity is required");
    }
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      updateDigest(digest, auth);
      updateDigest(digest, username);
      updateDigest(digest, password);
      byte[] bytes = digest.digest();
      StringBuilder fingerprint = new StringBuilder(bytes.length * 2);
      for (byte value : bytes) {
        fingerprint.append(String.format(Locale.US, "%02x", value & 0xff));
      }
      return serverIdentity + "\u0000auth\u0000" + fingerprint;
    } catch (NoSuchAlgorithmException error) {
      throw new IllegalStateException("SHA-256 is unavailable", error);
    }
  }

  private static void updateDigest(MessageDigest digest, String value) {
    byte[] bytes = (value == null ? "" : value).getBytes(StandardCharsets.UTF_8);
    digest.update((byte) (bytes.length >>> 24));
    digest.update((byte) (bytes.length >>> 16));
    digest.update((byte) (bytes.length >>> 8));
    digest.update((byte) bytes.length);
    digest.update(bytes);
  }

  static void removeSharedClientSession(
    String alias,
    String serverIdentity,
    boolean allowSelfSignedServer
  ) {
    List<NativeClientSession> removed = new ArrayList<>();
    synchronized (clientSessions) {
      String clientKey = clientSessionKey(alias, serverIdentity, allowSelfSignedServer);
      NativeClientSession exact = clientSessions.remove(clientKey);
      if (exact != null) {
        removed.add(exact);
      }
      String scopePrefix = authenticationScopePrefix(serverIdentity);
      if (scopePrefix != null) {
        clientSessions.forEach((key, session) -> {
          if (scopePrefix.equals(authenticationScopePrefix(session.serverIdentity)) &&
              clientSessions.remove(key, session)) {
            removed.add(session);
          }
        });
      }
    }
    removed.forEach(ClientCertModule::closeClientSession);
  }

  private static void retireClientSessionsForIdentity(String serverIdentity) {
    List<NativeClientSession> removed = new ArrayList<>();
    synchronized (clientSessions) {
      String scopePrefix = authenticationScopePrefix(serverIdentity);
      clientSessions.forEach((key, session) -> {
        boolean matches = scopePrefix == null
          ? serverIdentity.equals(session.serverIdentity)
          : scopePrefix.equals(authenticationScopePrefix(session.serverIdentity));
        if (matches && clientSessions.remove(key, session)) {
          removed.add(session);
        }
      });
    }
    removed.forEach(ClientCertModule::closeClientSession);
  }

  private static void retireAllClientSessions() {
    List<NativeClientSession> removed;
    synchronized (clientSessions) {
      removed = new ArrayList<>(clientSessions.values());
      clientSessions.clear();
    }
    removed.forEach(ClientCertModule::closeClientSession);
  }

  private static String opaqueFingerprint(String value) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
      StringBuilder fingerprint = new StringBuilder(bytes.length * 2);
      for (byte item : bytes) {
        fingerprint.append(String.format(Locale.US, "%02x", item & 0xff));
      }
      return "session-" + fingerprint;
    } catch (NoSuchAlgorithmException error) {
      throw new IllegalStateException("SHA-256 is unavailable", error);
    }
  }

  private static String authenticationScopePrefix(String serverIdentity) {
    if (serverIdentity == null) {
      return null;
    }
    String marker = "\u0000auth\u0000";
    int markerIndex = serverIdentity.lastIndexOf(marker);
    if (markerIndex < 0) {
      return null;
    }
    String base = serverIdentity.substring(0, markerIndex);
    return removeAuthenticationMode(base) + marker;
  }

  /**
   * Authentication mode is part of the route identity for diagnostics and
   * route decisions, but it must not split the native cookie retirement scope.
   * The opaque credential fingerprint appended by
   * authenticationScopedServerIdentity is what rotates the session.
   */
  private static String removeAuthenticationMode(String identity) {
    String field = "\"auth\":";
    int fieldStart = identity.indexOf(field);
    if (fieldStart < 0) {
      return identity;
    }
    int valueStart = fieldStart + field.length();
    if (valueStart >= identity.length() || identity.charAt(valueStart) != '"') {
      return identity;
    }
    int valueEnd = valueStart + 1;
    boolean escaped = false;
    while (valueEnd < identity.length()) {
      char character = identity.charAt(valueEnd);
      if (escaped) {
        escaped = false;
      } else if (character == '\\') {
        escaped = true;
      } else if (character == '"') {
        break;
      }
      valueEnd += 1;
    }
    if (valueEnd >= identity.length()) {
      return identity;
    }
    int removeEnd = valueEnd + 1;
    if (removeEnd < identity.length() && identity.charAt(removeEnd) == ',') {
      removeEnd += 1;
    } else if (fieldStart > 0 && identity.charAt(fieldStart - 1) == ',') {
      return identity.substring(0, fieldStart - 1) + identity.substring(removeEnd);
    }
    return identity.substring(0, fieldStart) + identity.substring(removeEnd);
  }

  private static void closeClientSession(NativeClientSession removed) {
    removed.client.dispatcher().cancelAll();
    removed.client.connectionPool().evictAll();
    CookieJar cookieJar = removed.client.cookieJar();
    if (cookieJar instanceof InMemoryCookieJar) {
      ((InMemoryCookieJar) cookieJar).clear();
    }
    removed.client.dispatcher().executorService().shutdown();
  }

  private static boolean isLoginRequest(Request request) {
    return request.url().encodedPath().endsWith("/api/login");
  }

  private static boolean isLocalRouteIdentity(String serverIdentity) {
    return serverIdentity != null &&
      serverIdentity.contains("\"route\":\"local\"");
  }

  private static void markLoginSuccess(
    String alias,
    String serverIdentity,
    boolean allowSelfSignedServer
  ) {
    String clientKey = clientSessionKey(
      alias,
      serverIdentity,
      allowSelfSignedServer
    );
    NativeClientSession session = clientSessions.get(clientKey);
    if (session == null) {
      return;
    }
    synchronized (session.loginLock) {
      session.sessionGeneration += 1L;
      session.loginFailure = null;
    }
  }

  private OkHttpClient createHttpClient(
    String alias,
    String serverIdentity,
    boolean allowSelfSignedServer
  ) throws Exception {
    return getSharedClientSession(
      reactContext,
      alias,
      serverIdentity,
      allowSelfSignedServer
    ).client;
  }

  private OkHttpClient createDefaultHttpClient(String serverIdentity) {
    try {
      return getSharedClientSession(reactContext, null, serverIdentity, false).client;
    } catch (Exception error) {
      throw new IllegalStateException("Unable to initialize the native HTTP client", error);
    }
  }

  private static SSLContext createClientSslContext(
    android.content.Context appContext,
    String alias,
    boolean allowSelfSignedServer
  ) throws Exception {
    PrivateKey privateKey = KeyChain.getPrivateKey(appContext, alias);
    X509Certificate[] certificateChain =
      KeyChain.getCertificateChain(appContext, alias);
    if (privateKey == null || certificateChain == null || certificateChain.length == 0) {
      throw new IllegalStateException("The selected client identity is unavailable");
    }

    KeyManager[] keyManagers = {
      new AliasKeyManager(alias, privateKey, certificateChain)
    };
    X509TrustManager trustManager = createTrustManager(allowSelfSignedServer);
    SSLContext sslContext = SSLContext.getInstance("TLS");
    sslContext.init(keyManagers, new TrustManager[] {trustManager}, null);
    return sslContext;
  }

  private static X509TrustManager createTrustManager(boolean allowSelfSigned) throws Exception {
    if (allowSelfSigned) {
      return new X509TrustManager() {
        @Override
        public void checkClientTrusted(X509Certificate[] chain, String authType) {}

        @Override
        public void checkServerTrusted(X509Certificate[] chain, String authType) {}

        @Override
        public X509Certificate[] getAcceptedIssuers() {
          return new X509Certificate[0];
        }
      };
    }

    TrustManagerFactory factory =
      TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
    factory.init((java.security.KeyStore) null);
    for (TrustManager trustManager : factory.getTrustManagers()) {
      if (trustManager instanceof X509TrustManager) {
        return (X509TrustManager) trustManager;
      }
    }
    throw new IllegalStateException("No system X509TrustManager is available");
  }

  private boolean permitsRequestBody(String method) {
    return !method.equalsIgnoreCase("GET") && !method.equalsIgnoreCase("HEAD");
  }

  private boolean isUnexpectedMediaContentType(String contentType) {
    String normalized = contentType == null
      ? ""
      : contentType.toLowerCase(Locale.US).split(";", 2)[0].trim();
    return normalized.equals("application/json") ||
      normalized.equals("application/problem+json") ||
      normalized.equals("text/html") ||
      normalized.startsWith("text/");
  }

  private void cleanupMediaCache(File mediaCache, File protectedFile) {
    File[] entries = mediaCache.listFiles();
    if (entries == null) {
      return;
    }

    long now = System.currentTimeMillis();
    for (File entry : entries) {
      String name = entry.getName();
      if (!entry.isFile() ||
        !name.startsWith("download-")) {
        continue;
      }
      if (now - entry.lastModified() > MEDIA_MAX_AGE_MS) {
        if (!entry.equals(protectedFile)) {
          entry.delete();
        }
      }
    }
  }

  private <T extends Throwable> T findCause(
    Throwable error,
    Class<T> type
  ) {
    Throwable cause = error;
    while (cause != null) {
      if (type.isInstance(cause)) {
        return type.cast(cause);
      }
      if (cause.getCause() == cause) {
        break;
      }
      cause = cause.getCause();
    }
    return null;
  }

  private void rejectRequestError(Promise promise, Exception error) {
    Throwable root = error;
    while (root.getCause() != null && root.getCause() != root) {
      root = root.getCause();
    }
    Log.e(TAG, "request failed with " + root.getClass().getSimpleName());
    if (findCause(error, SSLHandshakeException.class) != null) {
      promise.reject(
        "TLS_HANDSHAKE_ERROR",
        "TLS handshake with the server failed",
        error
      );
    } else if (findCause(error, SocketTimeoutException.class) != null) {
      promise.reject(
        "HTTP_TIMEOUT",
        "Connection timed out before the server returned a response",
        error
      );
    } else if (findCause(error, IOException.class) != null) {
      promise.reject(
        "HTTP_IO_ERROR",
        "The server connection failed",
        error
      );
    } else if (findCause(error, IllegalStateException.class) != null) {
      promise.reject(
        "CERT_IDENTITY_UNAVAILABLE",
        "The selected client identity is unavailable",
        error
      );
    } else {
      promise.reject("HTTP_ERROR", "The secure request failed", error);
    }
  }

  private final class ProtectedLiveSocket {
    private final String socketId;
    private final String profileId;
    private final String streamName;
    private volatile WebSocket webSocket;
    private volatile int connectionGeneration;
    private volatile boolean closed;
    private volatile boolean retriedAuthentication;

    ProtectedLiveSocket(
      String socketId,
      String profileId,
      String streamName
    ) {
      this.socketId = socketId;
      this.profileId = profileId;
      this.streamName = streamName;
    }

    void connect() throws IOException {
      MediaProfileRegistry registry = MediaProfileRegistry.get(reactContext);
      MediaProfileRegistry.LiveSocketRequest liveRequest =
        registry.liveSocketRequest(profileId, streamName);
      int generation = ++connectionGeneration;
      WebSocket socket = liveRequest.profile.session.client.newWebSocket(
        liveRequest.request,
        new WebSocketListener() {
          @Override
          public void onOpen(WebSocket openedSocket, Response response) {
            if (!isCurrent(generation)) {
              openedSocket.cancel();
              return;
            }
            emitLiveSocketState(socketId, "open", response.code());
          }

          @Override
          public void onMessage(WebSocket activeSocket, String text) {
            if (isCurrent(generation)) {
              if (text.length() > MAX_LIVE_MESSAGE_CHARS) {
                activeSocket.cancel();
                fail(0);
              } else {
                emitLiveSocketMessage(socketId, text);
              }
            }
          }

          @Override
          public void onClosing(
            WebSocket activeSocket,
            int code,
            String reason
          ) {
            if (isCurrent(generation)) {
              activeSocket.close(code, null);
            }
          }

          @Override
          public void onClosed(
            WebSocket activeSocket,
            int code,
            String reason
          ) {
            if (isCurrent(generation)) {
              protectedLiveSockets.remove(socketId, ProtectedLiveSocket.this);
              emitLiveSocketState(socketId, "closed", 0);
            }
          }

          @Override
          public void onFailure(
            WebSocket failedSocket,
            Throwable error,
            Response response
          ) {
            int statusCode = response == null ? 0 : response.code();
            if (response != null) {
              response.close();
            }
            if (!isCurrent(generation)) {
              return;
            }
            if (
              statusCode == 401 &&
              "frigate".equals(liveRequest.profile.auth) &&
              !retriedAuthentication
            ) {
              retriedAuthentication = true;
              connectionGeneration += 1;
              executor.execute(() -> {
                try {
                  if (
                    !closed &&
                    registry.refreshLiveSession(
                      profileId,
                      liveRequest.sessionGeneration
                    )
                  ) {
                    connect();
                    return;
                  }
                } catch (IOException refreshError) {
                  Log.e(
                    TAG,
                    "live session refresh failed with " +
                    refreshError.getClass().getSimpleName()
                  );
                }
                fail(401);
              });
              return;
            }
            fail(statusCode);
          }
        }
      );
      webSocket = socket;
      if (closed) {
        socket.cancel();
      }
    }

    boolean send(String message) {
      WebSocket socket = webSocket;
      return (
        !closed &&
        socket != null &&
        message != null &&
        message.length() <= MAX_LIVE_MESSAGE_CHARS &&
        socket.send(message)
      );
    }

    void close() {
      closed = true;
      WebSocket socket = webSocket;
      if (socket != null) {
        socket.close(1000, null);
        socket.cancel();
      }
    }

    private boolean isCurrent(int generation) {
      return (
        !closed &&
        protectedLiveSockets.get(socketId) == this &&
        connectionGeneration == generation
      );
    }

    private void fail(int statusCode) {
      if (protectedLiveSockets.remove(socketId, this)) {
        closed = true;
        emitLiveSocketState(socketId, "error", statusCode);
      }
    }
  }

  static final class NativeClientSession {
    final OkHttpClient client;
    final String serverIdentity;
    final String alias;
    final boolean allowSelfSignedServer;
    final Object loginLock = new Object();
    long sessionGeneration = 0L;
    boolean loginInFlight = false;
    IOException loginFailure;

    NativeClientSession(
      String serverIdentity,
      String alias,
      boolean allowSelfSignedServer,
      OkHttpClient client
    ) {
      this.serverIdentity = serverIdentity;
      this.alias = alias;
      this.allowSelfSignedServer = allowSelfSignedServer;
      this.client = client;
    }
  }

  private static final class AliasKeyManager extends X509ExtendedKeyManager {
    private final String alias;
    private final PrivateKey privateKey;
    private final X509Certificate[] certificateChain;

    AliasKeyManager(
      String alias,
      PrivateKey privateKey,
      X509Certificate[] certificateChain
    ) {
      this.alias = alias;
      this.privateKey = privateKey;
      this.certificateChain = certificateChain.clone();
    }

    @Override
    public String chooseClientAlias(
      String[] keyTypes,
      Principal[] issuers,
      Socket socket
    ) {
      Log.i(TAG, "TLS server requested the configured client identity");
      return alias;
    }

    @Override
    public String chooseEngineClientAlias(
      String[] keyTypes,
      Principal[] issuers,
      SSLEngine engine
    ) {
      Log.i(TAG, "TLS server requested the configured client identity");
      return alias;
    }

    @Override
    public String[] getClientAliases(String keyType, Principal[] issuers) {
      return new String[] {alias};
    }

    @Override
    public X509Certificate[] getCertificateChain(String requestedAlias) {
      return alias.equals(requestedAlias) ? certificateChain.clone() : null;
    }

    @Override
    public PrivateKey getPrivateKey(String requestedAlias) {
      return alias.equals(requestedAlias) ? privateKey : null;
    }

    @Override
    public String[] getServerAliases(String keyType, Principal[] issuers) {
      return null;
    }

    @Override
    public String chooseServerAlias(
      String keyType,
      Principal[] issuers,
      Socket socket
    ) {
      return null;
    }
  }

  private static final class InMemoryCookieJar implements CookieJar {
    private final List<Cookie> cookies = new ArrayList<>();

    @Override
    public synchronized void saveFromResponse(HttpUrl url, List<Cookie> newCookies) {
      long now = System.currentTimeMillis();
      cookies.removeIf(cookie ->
        cookie.expiresAt() <= now || newCookies.stream().anyMatch(newCookie ->
          cookie.name().equals(newCookie.name()) &&
          cookie.domain().equals(newCookie.domain()) &&
          cookie.path().equals(newCookie.path())
        )
      );
      cookies.addAll(newCookies);
    }

    @Override
    public synchronized List<Cookie> loadForRequest(HttpUrl url) {
      long now = System.currentTimeMillis();
      cookies.removeIf(cookie -> cookie.expiresAt() <= now);
      List<Cookie> matchingCookies = new ArrayList<>();
      for (Cookie cookie : cookies) {
        if (cookie.matches(url)) {
          matchingCookies.add(cookie);
        }
      }
      return matchingCookies;
    }

    synchronized void clear() {
      cookies.clear();
    }
  }
}
