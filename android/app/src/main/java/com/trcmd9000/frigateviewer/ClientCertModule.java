package com.trcmd9000.frigateviewer;

import android.app.Activity;
import android.security.KeyChain;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import java.net.Socket;
import java.security.Principal;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.net.ssl.KeyManager;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLEngine;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509ExtendedKeyManager;
import javax.net.ssl.X509TrustManager;

import okhttp3.Headers;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * Provides access to user-approved client identities from Android KeyChain.
 */
public class ClientCertModule extends ReactContextBaseJavaModule {
  private static final String MODULE_NAME = "ClientCertModule";
  private static final String SELECT_CANCELLED = "CERT_SELECTION_CANCELLED";

  private final ReactApplicationContext reactContext;
  private final ExecutorService executor = Executors.newCachedThreadPool();

  public ClientCertModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;
  }

  @Override
  public String getName() {
    return MODULE_NAME;
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

  /**
   * Kept for the cross-platform bridge. Android identities are not enumerable.
   */
  @ReactMethod
  public void listCertificates(Promise promise) {
    promise.resolve(Arguments.createArray());
  }

  @ReactMethod
  public void getCertificateDetails(String alias, Promise promise) {
    executor.execute(() -> {
      try {
        X509Certificate certificate = getLeafCertificate(alias);
        WritableMap details = Arguments.createMap();
        details.putString("alias", alias);
        details.putString("subjectDN", certificate.getSubjectX500Principal().getName());
        details.putString("issuerDN", certificate.getIssuerX500Principal().getName());
        details.putDouble("notBefore", certificate.getNotBefore().getTime());
        details.putDouble("notAfter", certificate.getNotAfter().getTime());
        details.putString("serialNumber", certificate.getSerialNumber().toString(16));
        details.putString("thumbprint", sha256Fingerprint(certificate));
        promise.resolve(details);
      } catch (Exception error) {
        promise.reject("CERT_ERROR", "Unable to read the selected certificate", error);
      }
    });
  }

  @ReactMethod
  public void getCertificateChain(String alias, Promise promise) {
    executor.execute(() -> {
      try {
        X509Certificate[] certificates = KeyChain.getCertificateChain(reactContext, alias);
        if (certificates == null || certificates.length == 0) {
          promise.reject("CERT_NOT_FOUND", "The selected certificate is unavailable");
          return;
        }

        WritableArray chain = Arguments.createArray();
        for (X509Certificate certificate : certificates) {
          WritableMap item = Arguments.createMap();
          item.putString("type", certificate.getType());
          item.putString("subjectDN", certificate.getSubjectX500Principal().getName());
          item.putString("issuerDN", certificate.getIssuerX500Principal().getName());
          chain.pushMap(item);
        }
        promise.resolve(chain);
      } catch (Exception error) {
        promise.reject("CERT_ERROR", "Unable to read the certificate chain", error);
      }
    });
  }

  @ReactMethod
  public void getPrivateKeyInfo(String alias, Promise promise) {
    executor.execute(() -> {
      try {
        WritableMap result = Arguments.createMap();
        result.putString("alias", alias);
        result.putBoolean(
          "isPrivateKeyAvailable",
          KeyChain.getPrivateKey(reactContext, alias) != null
        );
        promise.resolve(result);
      } catch (Exception error) {
        promise.reject("KEYCHAIN_ERROR", "Unable to access the selected private key", error);
      }
    });
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
    String method,
    ReadableArray headers,
    String body,
    boolean allowSelfSignedServer,
    Promise promise
  ) {
    executor.execute(() -> {
      try {
        SSLContext sslContext = createClientSslContext(alias, allowSelfSignedServer);
        X509TrustManager trustManager = createTrustManager(allowSelfSignedServer);
        OkHttpClient.Builder clientBuilder = new OkHttpClient.Builder()
          .sslSocketFactory(sslContext.getSocketFactory(), trustManager);
        if (allowSelfSignedServer) {
          clientBuilder.hostnameVerifier((hostname, session) -> true);
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

        try (Response response = clientBuilder.build().newCall(requestBuilder.build()).execute()) {
          WritableMap result = Arguments.createMap();
          result.putInt("statusCode", response.code());
          result.putString("body", response.body() == null ? "" : response.body().string());

          WritableMap responseHeaders = Arguments.createMap();
          Headers receivedHeaders = response.headers();
          for (String name : receivedHeaders.names()) {
            responseHeaders.putString(name, receivedHeaders.get(name));
          }
          result.putMap("headers", responseHeaders);
          promise.resolve(result);
        }
      } catch (Exception error) {
        promise.reject("HTTP_ERROR", "Client-certificate request failed", error);
      }
    });
  }

  private SSLContext createClientSslContext(
    String alias,
    boolean allowSelfSignedServer
  ) throws Exception {
    PrivateKey privateKey = KeyChain.getPrivateKey(reactContext, alias);
    X509Certificate[] certificateChain =
      KeyChain.getCertificateChain(reactContext, alias);
    if (privateKey == null || certificateChain == null || certificateChain.length == 0) {
      throw new IllegalStateException("The selected client identity is unavailable");
    }

    KeyManager[] keyManagers = {
      new AliasKeyManager(alias, privateKey, certificateChain)
    };
    X509TrustManager trustManager = createTrustManager(allowSelfSignedServer);
    SSLContext context = SSLContext.getInstance("TLS");
    context.init(keyManagers, new TrustManager[] {trustManager}, null);
    return context;
  }

  private X509Certificate getLeafCertificate(String alias) throws Exception {
    X509Certificate[] chain = KeyChain.getCertificateChain(reactContext, alias);
    if (chain == null || chain.length == 0) {
      throw new IllegalStateException("The selected certificate is unavailable");
    }
    return chain[0];
  }

  private X509TrustManager createTrustManager(boolean allowSelfSigned) throws Exception {
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

  private String sha256Fingerprint(X509Certificate certificate) throws Exception {
    byte[] digest =
      java.security.MessageDigest.getInstance("SHA-256").digest(certificate.getEncoded());
    StringBuilder fingerprint = new StringBuilder();
    for (int index = 0; index < digest.length; index++) {
      if (index > 0) {
        fingerprint.append(':');
      }
      fingerprint.append(String.format("%02X", digest[index]));
    }
    return fingerprint.toString();
  }

  private boolean permitsRequestBody(String method) {
    return !method.equalsIgnoreCase("GET") && !method.equalsIgnoreCase("HEAD");
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
      return alias;
    }

    @Override
    public String chooseEngineClientAlias(
      String[] keyTypes,
      Principal[] issuers,
      SSLEngine engine
    ) {
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
}
