import {livePreviewStatus} from '../../helpers/livePreviewStatus';

describe('live preview status', () => {
  it.each([
    ['snapshot', 'cameraPreview.status.snapshot', 'picture'],
    ['preparing', 'cameraPreview.status.preparing', 'loading-3-quarters'],
    ['connecting', 'cameraPreview.status.connecting', 'loading-3-quarters'],
    ['rtsp', 'cameraPreview.status.rtsp', 'video-camera'],
    ['webrtc', 'cameraPreview.status.webrtc', 'video-camera'],
    ['live', 'cameraPreview.status.live', 'video-camera'],
    ['reconnecting', 'cameraPreview.status.reconnecting', 'reload'],
    ['degraded', 'cameraPreview.status.degraded', 'warning'],
    ['fallback', 'cameraPreview.status.fallback', 'warning'],
  ] as const)(
    'maps %s to an explicit message and icon',
    (state, messageId, icon) => {
      expect(livePreviewStatus(state)).toEqual({messageId, icon});
    },
  );

  it.each([
    ['rtsp', 'cameraPreview.status.rtsp'],
    ['webrtc', 'cameraPreview.status.webrtc'],
  ] as const)(
    'uses the attempted %s transport only for a decoded live phase',
    (transport, messageId) => {
      expect(livePreviewStatus('live', transport)).toEqual({
        messageId,
        icon: 'video-camera',
      });
    },
  );
});
