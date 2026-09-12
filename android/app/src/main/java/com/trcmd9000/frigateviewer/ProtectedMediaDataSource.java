package com.trcmd9000.frigateviewer;

import android.net.Uri;

import androidx.media3.common.C;
import androidx.media3.datasource.BaseDataSource;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSpec;

import java.io.IOException;
import java.io.EOFException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * Media3 data source backed by a profile-scoped native OkHttp client.
 *
 * <p>Every HLS resource (manifest, segment, initialization range, and AES
 * key) goes through the same resolver and authenticated client. No response is
 * written to a Media3 or OkHttp disk cache.</p>
 */
final class ProtectedMediaDataSource extends BaseDataSource {
  private final MediaProfileRegistry registry;

  private Response response;
  private InputStream input;
  private Uri openedUri;
  private long bytesRemaining;
  private boolean transferStarted;
  private Map<String, List<String>> responseHeaders = Collections.emptyMap();

  ProtectedMediaDataSource(MediaProfileRegistry registry) {
    super(true);
    this.registry = registry;
  }

  @Override
  public long open(DataSpec dataSpec) throws IOException {
    MediaProfileRegistry.ResolvedMediaRequest resolved = registry.resolve(dataSpec.uri);
    openedUri = registry.opaqueUri(resolved);
    DataSpec listenerDataSpec =
      dataSpec
        .buildUpon()
        .setUri(openedUri)
        .setHttpBody(null)
        .setHttpRequestHeaders(Collections.emptyMap())
        .setKey(null)
        .build();
    transferInitializing(listenerDataSpec);
    Request.Builder requestBuilder =
      registry.authenticatedRequest(resolved.profile, resolved.url);
    addRequestHeaders(requestBuilder, dataSpec.httpRequestHeaders);
    addRangeHeader(requestBuilder, dataSpec.position, dataSpec.length);
    setMethod(requestBuilder, dataSpec);

    long requestGeneration = registry.currentSessionGeneration(resolved.profile);
    try {
      response = registry.executeWithReauthentication(
        resolved,
        requestBuilder.build(),
        requestGeneration
      );
      if (response.code() < 200 || response.code() >= 300) {
        int statusCode = response.code();
        response.close();
        response = null;
        throw new MediaProfileRegistry.ProtectedMediaException(
          statusCode,
          ProtectedMediaPolicy.isRedirectRejected(statusCode)
            ? "Protected media redirect rejected"
            : "Protected media request returned HTTP " + statusCode
        );
      }

      ResponseBody body = response.body();
      if (body == null) {
        response.close();
        response = null;
        throw new IOException("Protected media response was empty");
      }
      input = body.byteStream();
      if (response.code() == 200 && dataSpec.position > 0) {
        skipFully(dataSpec.position);
      }

      long contentLength = body.contentLength();
      bytesRemaining = ProtectedMediaPolicy.responseBytesRemaining(
        response.code(),
        dataSpec.position,
        dataSpec.length,
        contentLength
      );
      responseHeaders = responseHeaders(response);
      transferStarted(listenerDataSpec);
      transferStarted = true;
      return bytesRemaining;
    } catch (IOException error) {
      closeAfterFailedOpen();
      if (error instanceof MediaProfileRegistry.ProtectedMediaException) {
        throw error;
      }
      throw new IOException("Protected media request failed");
    } catch (RuntimeException error) {
      closeAfterFailedOpen();
      throw error;
    }
  }

  @Override
  public int read(byte[] buffer, int offset, int length) throws IOException {
    if (length == 0) {
      return 0;
    }
    if (input == null || bytesRemaining == 0) {
      return C.RESULT_END_OF_INPUT;
    }

    int requested = length;
    if (bytesRemaining != C.LENGTH_UNSET) {
      requested = (int) Math.min((long) length, bytesRemaining);
    }
    int read;
    try {
      read = input.read(buffer, offset, requested);
    } catch (IOException error) {
      throw new IOException("Protected media read failed");
    }
    if (read == -1) {
      if (bytesRemaining != C.LENGTH_UNSET && bytesRemaining > 0) {
        throw new EOFException("Protected media response ended before the requested range");
      }
      bytesRemaining = 0;
      return C.RESULT_END_OF_INPUT;
    }
    if (bytesRemaining != C.LENGTH_UNSET) {
      bytesRemaining -= read;
    }
    bytesTransferred(read);
    return read;
  }

  @Override
  public Uri getUri() {
    return openedUri;
  }

  @Override
  public Map<String, List<String>> getResponseHeaders() {
    return responseHeaders;
  }

  @Override
  public void close() throws IOException {
    IOException failure = null;
    try {
      if (input != null) {
        input.close();
      }
    } catch (IOException error) {
      failure = error;
    } finally {
      input = null;
      if (response != null) {
        response.close();
      }
      response = null;
      openedUri = null;
      responseHeaders = Collections.emptyMap();
      bytesRemaining = 0;
      if (transferStarted) {
        transferEnded();
        transferStarted = false;
      }
    }
    if (failure != null) {
      throw failure;
    }
  }

  private void addRequestHeaders(
    Request.Builder request,
    Map<String, String> headers
  ) throws IOException {
    if (headers == null) {
      return;
    }
    for (Map.Entry<String, String> entry : headers.entrySet()) {
      String name = entry.getKey();
      if (name == null || entry.getValue() == null) {
        continue;
      }
      String lowerName = name.toLowerCase(Locale.US);
      if (
        "authorization".equals(lowerName) ||
        "cookie".equals(lowerName) ||
        "host".equals(lowerName) ||
        "range".equals(lowerName)
      ) {
        throw new IOException("Protected media authentication headers are not allowed");
      }
      request.header(name, entry.getValue());
    }
  }

  private void addRangeHeader(
    Request.Builder request,
    long position,
    long length
  ) {
    if (position == 0 && length == C.LENGTH_UNSET) {
      return;
    }
    String end =
      length == C.LENGTH_UNSET
        ? ""
        : Long.toString(position + Math.max(0, length - 1));
    request.header("Range", "bytes=" + position + "-" + end);
  }

  private void setMethod(Request.Builder request, DataSpec dataSpec) throws IOException {
    switch (dataSpec.httpMethod) {
      case DataSpec.HTTP_METHOD_GET:
        request.get();
        return;
      case DataSpec.HTTP_METHOD_HEAD:
        request.head();
        return;
      case DataSpec.HTTP_METHOD_POST:
        request.post(RequestBodyFactory.create(dataSpec.httpBody));
        return;
      default:
        throw new IOException("The protected media request method is not allowed");
    }
  }

  private void skipFully(long bytes) throws IOException {
    long remaining = bytes;
    while (remaining > 0) {
      long skipped = input.skip(remaining);
      if (skipped > 0) {
        remaining -= skipped;
        continue;
      }
      if (input.read() == -1) {
        throw new MediaProfileRegistry.ProtectedMediaException(
          416,
          "Protected media range is not satisfiable"
        );
      }
      remaining -= 1;
    }
  }

  private void closeAfterFailedOpen() {
    try {
      if (input != null) {
        input.close();
      }
    } catch (IOException ignored) {
      // Preserve the original open failure.
    }
    input = null;
    if (response != null) {
      response.close();
    }
    response = null;
    openedUri = null;
    responseHeaders = Collections.emptyMap();
    if (transferStarted) {
      transferEnded();
      transferStarted = false;
    }
  }

  private static Map<String, List<String>> responseHeaders(Response response) {
    Map<String, List<String>> headers = new LinkedHashMap<>();
    for (String name : response.headers().names()) {
      String lowerName = name.toLowerCase(Locale.US);
      if (
        "set-cookie".equals(lowerName) ||
        "cookie".equals(lowerName) ||
        "authorization".equals(lowerName) ||
        "location".equals(lowerName)
      ) {
        continue;
      }
      headers.put(name, new ArrayList<>(response.headers().values(name)));
    }
    return Collections.unmodifiableMap(headers);
  }

  /**
   * Keeps the OkHttp 4.x RequestBody overload in one place so the data source
   * remains compatible with the application's pinned OkHttp version.
   */
  private static final class RequestBodyFactory {
    private RequestBodyFactory() {}

    static okhttp3.RequestBody create(byte[] body) {
      return okhttp3.RequestBody.create(body == null ? new byte[0] : body, null);
    }
  }

  static final class Factory implements DataSource.Factory {
    private final MediaProfileRegistry registry;

    Factory(MediaProfileRegistry registry) {
      this.registry = registry;
    }

    @Override
    public DataSource createDataSource() {
      return new ProtectedMediaDataSource(registry);
    }
  }
}
