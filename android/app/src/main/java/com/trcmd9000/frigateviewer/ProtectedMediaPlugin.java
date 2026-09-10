package com.trcmd9000.frigateviewer;

import android.content.Context;
import android.net.Uri;

import androidx.media3.common.MediaItem;
import androidx.media3.datasource.DataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.drm.DrmSessionManager;
import androidx.media3.exoplayer.rtsp.RtspMediaSource;
import androidx.media3.exoplayer.source.MediaSource;

import com.brentvatne.common.api.Source;
import com.brentvatne.exoplayer.DRMManagerSpec;
import com.brentvatne.exoplayer.RNVExoplayerPlugin;

/**
 * React Native Video extension for profile-scoped protected media.
 */
final class ProtectedMediaPlugin implements RNVExoplayerPlugin {
  private final MediaProfileRegistry registry;

  ProtectedMediaPlugin(Context context) {
    registry = MediaProfileRegistry.get(context);
  }

  @Override
  public DataSource.Factory overrideMediaDataSourceFactory(
    Source source,
    DataSource.Factory mediaDataSourceFactory
  ) {
    Uri uri = source == null ? null : source.getUri();
    if (uri == null ||
      !ProtectedMediaPolicy.isOpaqueMediaUri(uri.toString()) ||
      isRtspHandle(uri)) {
      return null;
    }
    if (BuildConfig.ENABLE_PROTECTED_MSE_PROBE && isMseHandle(uri)) {
      return new ProtectedMseLiveDataSource.Factory(registry);
    }
    return new ProtectedMediaDataSource.Factory(registry);
  }

  @Override
  public boolean shouldDisableCache(Source source) {
    Uri uri = source == null ? null : source.getUri();
    return uri != null &&
      ProtectedMediaPolicy.isOpaqueMediaUri(uri.toString());
  }

  @Override
  public DRMManagerSpec getDRMManager() {
    return null;
  }

  @Override
  public DrmSessionManager overrideDrmSessionManager(
    Source source,
    DrmSessionManager drmSessionManager
  ) {
    return null;
  }

  @Override
  public MediaSource.Factory overrideMediaSourceFactory(
    Source source,
    MediaSource.Factory mediaSourceFactory,
    DataSource.Factory mediaDataSourceFactory
  ) {
    Uri uri = source == null ? null : source.getUri();
    if (uri != null && isRtspHandle(uri)) {
      return new RtspMediaSource.Factory()
        .setSocketFactory(LocalRouteResolver.privateOnlySocketFactory())
        .setTimeoutMs(RtspMediaPolicy.RTP_FALLBACK_TIMEOUT_MS)
        .setDebugLoggingEnabled(false);
    }
    return null;
  }

  @Override
  public MediaItem.Builder overrideMediaItemBuilder(
    Source source,
    MediaItem.Builder mediaItemBuilder
  ) {
    Uri uri = source == null ? null : source.getUri();
    if (uri != null && isRtspHandle(uri)) {
      try {
        return mediaItemBuilder.setUri(registry.resolveRtspMediaUri(uri));
      } catch (java.io.IOException error) {
        throw new IllegalStateException("The local RTSP media handle is unavailable", error);
      }
    }
    return null;
  }

  private static boolean isRtspHandle(Uri uri) {
    return uri != null &&
      ProtectedMediaPolicy.isOpaqueMediaUri(uri.toString()) &&
      uri.getPathSegments().size() == 2 &&
      "rtsp".equals(uri.getPathSegments().get(0));
  }

  private static boolean isMseHandle(Uri uri) {
    return uri != null &&
      ProtectedMediaPolicy.isOpaqueMediaUri(uri.toString()) &&
      uri.getPathSegments().size() == 2 &&
      "mse".equals(uri.getPathSegments().get(0));
  }

  @Override
  public void onInstanceCreated(String id, ExoPlayer player) {
    // Protected data sources are scoped to each open request.
  }

  @Override
  public void onInstanceRemoved(String id, ExoPlayer player) {
    // Protected data sources are closed by Media3 with the player.
  }

  @Override
  public void onInstanceCreated(String id, Object player) {
    if (player instanceof ExoPlayer) {
      onInstanceCreated(id, (ExoPlayer) player);
    }
  }

  @Override
  public void onInstanceRemoved(String id, Object player) {
    if (player instanceof ExoPlayer) {
      onInstanceRemoved(id, (ExoPlayer) player);
    }
  }
}
