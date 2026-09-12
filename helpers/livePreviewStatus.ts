import type {OutlineGlyphMapType} from '@ant-design/icons-react-native';

export type LivePreviewTransport = 'rtsp' | 'webrtc' | 'mse';

/**
 * The connection phase is deliberately separate from the transport being
 * attempted. In particular, selecting RTSP or WebRTC is not proof that the
 * transport has produced a decoded frame.
 */
export type LivePreviewPhase =
  | 'snapshot'
  | 'preparing'
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'fallback'
  | 'degraded';

/**
 * The legacy transport states remain accepted by the helper for callers that
 * have not migrated yet. LivePreview itself only uses the phase plus transport
 * form above.
 */
export type LivePreviewState =
  | LivePreviewPhase
  | LivePreviewTransport;

export interface LivePreviewStateDescriptor {
  phase: LivePreviewPhase;
  transport?: LivePreviewTransport;
}

export interface LivePreviewStatus {
  icon: OutlineGlyphMapType;
  messageId: string;
}

const statusByState: Record<LivePreviewState, LivePreviewStatus> = {
  snapshot: {
    icon: 'picture',
    messageId: 'cameraPreview.status.snapshot',
  },
  preparing: {
    icon: 'loading-3-quarters',
    messageId: 'cameraPreview.status.preparing',
  },
  connecting: {
    icon: 'loading-3-quarters',
    messageId: 'cameraPreview.status.connecting',
  },
  rtsp: {
    icon: 'video-camera',
    messageId: 'cameraPreview.status.rtsp',
  },
  webrtc: {
    icon: 'video-camera',
    messageId: 'cameraPreview.status.webrtc',
  },
  mse: {
    icon: 'video-camera',
    messageId: 'cameraPreview.status.mse',
  },
  live: {
    icon: 'video-camera',
    messageId: 'cameraPreview.status.live',
  },
  reconnecting: {
    icon: 'reload',
    messageId: 'cameraPreview.status.reconnecting',
  },
  degraded: {
    icon: 'warning',
    messageId: 'cameraPreview.status.degraded',
  },
  fallback: {
    icon: 'warning',
    messageId: 'cameraPreview.status.fallback',
  },
};

export function livePreviewStatus(
  state: LivePreviewStateDescriptor,
): LivePreviewStatus;
export function livePreviewStatus(
  state: LivePreviewState,
  transport?: LivePreviewTransport,
): LivePreviewStatus;
export function livePreviewStatus(
  state: LivePreviewState | LivePreviewStateDescriptor,
  transport?: LivePreviewTransport,
): LivePreviewStatus {
  if (typeof state === 'object') {
    return livePreviewStatus(state.phase, state.transport);
  }
  if (state === 'live' && transport) {
    return statusByState[transport];
  }
  return statusByState[state];
}
