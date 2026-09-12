package com.trcmd9000.frigateviewer;

import android.net.Uri;

import androidx.media3.common.C;
import androidx.media3.datasource.BaseDataSource;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSpec;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.Collections;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okio.ByteString;

final class ProtectedMseLiveDataSource extends BaseDataSource {
  private static final String MSE_REQUEST =
    "{\"type\":\"mse\",\"value\":\"hvc1.1.6.L153.B0\"}";
  private static final int MAX_CONTROL_CHARS = 4096;
  private static final int MAX_BUFFERED_BYTES = 4 * 1024 * 1024;
  private static final long START_TIMEOUT_NANOS = TimeUnit.SECONDS.toNanos(10);
  private static final long READ_TIMEOUT_NANOS = TimeUnit.SECONDS.toNanos(15);

  private final MediaProfileRegistry registry;
  private final Object stateLock = new Object();
  private final ArrayDeque<byte[]> messages = new ArrayDeque<>();
  private final ProtectedMseMp4Probe mp4 = new ProtectedMseMp4Probe();

  private WebSocket webSocket;
  private Uri openedUri;
  private byte[] currentMessage;
  private int currentOffset;
  private int bufferedBytes;
  private int connectionGeneration;
  private boolean mimeReady;
  private boolean contractReady;
  private final AtomicBoolean retriedAuthentication = new AtomicBoolean();
  private boolean closed;
  private boolean transferStarted;
  private IOException failure;

  ProtectedMseLiveDataSource(MediaProfileRegistry registry) {
    super(true);
    this.registry = registry;
  }

  @Override
  public long open(DataSpec dataSpec) throws IOException {
    if (dataSpec.position != 0) {
      throw new IOException("Protected MSE live media does not support ranges");
    }
    openedUri = dataSpec.uri;
    DataSpec listenerDataSpec = dataSpec
      .buildUpon()
      .setHttpBody(null)
      .setHttpRequestHeaders(Collections.emptyMap())
      .setKey(null)
      .build();
    transferInitializing(listenerDataSpec);
    try {
      connect(openedUri);
      awaitMseContract();
    } catch (IOException | RuntimeException error) {
      close();
      throw error;
    }
    transferStarted(listenerDataSpec);
    transferStarted = true;
    return C.LENGTH_UNSET;
  }

  @Override
  public int read(byte[] buffer, int offset, int length) throws IOException {
    if (length == 0) {
      return 0;
    }
    int copied;
    synchronized (stateLock) {
      long deadline = System.nanoTime() + READ_TIMEOUT_NANOS;
      while (currentMessage == null || currentOffset == currentMessage.length) {
        currentMessage = messages.pollFirst();
        currentOffset = 0;
        if (currentMessage != null) {
          bufferedBytes -= currentMessage.length;
          break;
        }
        throwIfUnavailable();
        awaitState(deadline, "Protected MSE live media stalled");
      }
      copied = Math.min(length, currentMessage.length - currentOffset);
      System.arraycopy(currentMessage, currentOffset, buffer, offset, copied);
      currentOffset += copied;
    }
    bytesTransferred(copied);
    return copied;
  }

  @Override
  public Uri getUri() {
    return openedUri;
  }

  @Override
  public void close() {
    WebSocket socket;
    synchronized (stateLock) {
      if (closed) {
        return;
      }
      closed = true;
      connectionGeneration += 1;
      socket = webSocket;
      webSocket = null;
      messages.clear();
      currentMessage = null;
      bufferedBytes = 0;
      stateLock.notifyAll();
    }
    if (socket != null) {
      socket.cancel();
    }
    openedUri = null;
    if (transferStarted) {
      transferEnded();
      transferStarted = false;
    }
  }

  private void connect(Uri uri) throws IOException {
    MediaProfileRegistry.LiveSocketRequest mseRequest =
      registry.mseSocketRequest(uri);
    int generation;
    synchronized (stateLock) {
      if (closed) {
        throw new IOException("Protected MSE live media is closed");
      }
      generation = ++connectionGeneration;
    }
    WebSocket socket = mseRequest.profile.session.client.newWebSocket(
      mseRequest.request,
      new WebSocketListener() {
        @Override
        public void onOpen(WebSocket openedSocket, Response response) {
          if (!isCurrent(generation)) {
            openedSocket.cancel();
          } else if (!openedSocket.send(MSE_REQUEST)) {
            fail(new IOException("Protected MSE live media request failed"));
          }
        }

        @Override
        public void onMessage(WebSocket activeSocket, String text) {
          if (!isCurrent(generation)) {
            return;
          }
          if (text == null || text.length() > MAX_CONTROL_CHARS) {
            fail(new IOException("Protected MSE live media control was invalid"));
            return;
          }
          try {
            JSONObject message = new JSONObject(text);
            String type = message.optString("type", "");
            String value = message.optString("value", "");
            if ("error".equals(type)) {
              fail(new IOException("Protected MSE live media was rejected"));
            } else if ("mse".equals(type)) {
              String mime = value.toLowerCase(Locale.US);
              if (value.length() > 256 ||
                !mime.startsWith("video/mp4") ||
                !mime.contains("hvc1")) {
                fail(new IOException("Protected MSE HEVC media is unavailable"));
                return;
              }
              synchronized (stateLock) {
                if (isCurrentLocked(generation)) {
                  mimeReady = true;
                  stateLock.notifyAll();
                }
              }
            }
          } catch (JSONException error) {
            fail(new IOException("Protected MSE live media control was invalid"));
          }
        }

        @Override
        public void onMessage(WebSocket activeSocket, ByteString bytes) {
          if (!isCurrent(generation) || bytes == null) {
            return;
          }
          byte[] message = bytes.toByteArray();
          WebSocket socketToCancel = null;
          synchronized (stateLock) {
            if (!isCurrentLocked(generation)) {
              return;
            }
            if (!mimeReady) {
              socketToCancel = failLocked(
                new IOException("Protected MSE media arrived before its MIME type")
              );
            } else if (message.length > ProtectedMseMp4Probe.MAX_MESSAGE_BYTES ||
              bufferedBytes + message.length > MAX_BUFFERED_BYTES) {
              socketToCancel = failLocked(
                new IOException("Protected MSE live media buffer exceeded its limit")
              );
            } else {
              try {
                mp4.accept(message);
                messages.addLast(message);
                bufferedBytes += message.length;
                if (mp4.isComplete()) {
                  contractReady = true;
                }
                stateLock.notifyAll();
              } catch (IOException error) {
                socketToCancel = failLocked(error);
              }
            }
          }
          if (socketToCancel != null) {
            socketToCancel.cancel();
          }
        }

        @Override
        public void onClosed(WebSocket activeSocket, int code, String reason) {
          if (isCurrent(generation)) {
            fail(new IOException("Protected MSE live media closed unexpectedly"));
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
          if (statusCode == 401 &&
            "frigate".equals(mseRequest.profile.auth) &&
            retriedAuthentication.compareAndSet(false, true)) {
            synchronized (stateLock) {
              connectionGeneration += 1;
            }
            mseRequest.profile.session.client.dispatcher().executorService().execute(() -> {
              try {
                if (!closed && registry.refreshLiveSession(
                  mseRequest.profile.id,
                  mseRequest.sessionGeneration
                )) {
                  connect(uri);
                  return;
                }
              } catch (IOException ignored) {
                // Surface only a bounded playback failure to Media3.
              }
              fail(new IOException("Protected MSE live media authentication failed"));
            });
            return;
          }
          fail(new IOException("Protected MSE live media connection failed"));
        }
      }
    );
    synchronized (stateLock) {
      if (isCurrentLocked(generation)) {
        webSocket = socket;
      } else {
        socket.cancel();
      }
    }
  }

  private void awaitMseContract() throws IOException {
    synchronized (stateLock) {
      long deadline = System.nanoTime() + START_TIMEOUT_NANOS;
      while (!contractReady) {
        throwIfUnavailable();
        awaitState(deadline, "Protected MSE live media contract timed out");
      }
    }
  }

  private void awaitState(long deadline, String timeoutMessage) throws IOException {
    long remaining = deadline - System.nanoTime();
    if (remaining <= 0) {
      throw new IOException(timeoutMessage);
    }
    try {
      TimeUnit.NANOSECONDS.timedWait(stateLock, remaining);
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      throw new IOException("Protected MSE live media was interrupted");
    }
  }

  private void throwIfUnavailable() throws IOException {
    if (failure != null) {
      throw failure;
    }
    if (closed) {
      throw new IOException("Protected MSE live media is closed");
    }
  }

  private boolean isCurrent(int generation) {
    synchronized (stateLock) {
      return isCurrentLocked(generation);
    }
  }

  private boolean isCurrentLocked(int generation) {
    return !closed && failure == null && generation == connectionGeneration;
  }

  private void fail(IOException error) {
    WebSocket socket;
    synchronized (stateLock) {
      socket = failLocked(error);
    }
    if (socket != null) {
      socket.cancel();
    }
  }

  private WebSocket failLocked(IOException error) {
    if (failure != null || closed) {
      return null;
    }
    failure = error;
    connectionGeneration += 1;
    WebSocket socket = webSocket;
    webSocket = null;
    stateLock.notifyAll();
    return socket;
  }

  static final class Factory implements DataSource.Factory {
    private final MediaProfileRegistry registry;

    Factory(MediaProfileRegistry registry) {
      this.registry = registry;
    }

    @Override
    public DataSource createDataSource() {
      return new ProtectedMseLiveDataSource(registry);
    }
  }
}