import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {AppState, Platform} from 'react-native';
import {IntlProvider} from 'react-intl';
import en from '../../../i18n/en';
import type {ProtectedAudioStatus} from '../../../helpers/protectedAudio';

const appStateListeners: Array<(state: 'active' | 'background') => void> = [];
const mockGet = jest.fn();
const mockFetchStreamMetadata = jest.fn();
const mockPrepareLocalRtspMedia = jest.fn();
const mockProbeDeviceCodecCapability = jest.fn();
const mockPlanProtectedLiveStreams = jest.fn();
const mockProtectedMseMediaUri = jest.fn();
const mockDispatch = jest.fn();
const mockLogInfo = jest.fn();
const mockLogError = jest.fn();
const mockServer = {profileId: 'profile-id'};
const mockSelectProtectedLiveStreams = jest.fn(() => ['front']);
const mockSelectProtectedLiveStreamOptions = jest.fn(
  (): Array<{name: string; label: string}> => [],
);
let mockPlaybackActive = true;
let mockActivationId = 1;
let mockPlayerShouldReportPlaying = true;
let mockMseShouldReportPlaying = true;
let mockMseMounts = 0;
let mockWebRtcMounts = 0;
let mockMseProbeEnabled = false;
let mockLiveStreamPreferences: Record<string, Record<string, unknown>> = {};
let mockPlayerProps:
  | {
      muted?: boolean;
      streamName?: string;
      onPlaying: () => void;
      onError?: (reason?: 'codec' | 'network' | 'timeout') => void;
      onAudioAvailabilityChange?: (available: boolean) => void;
      onAudioActivationChange?: (active: boolean) => void;
      onAudioStatusChange?: (status: ProtectedAudioStatus) => void;
    }
  | undefined;

jest.mock('../../../store/store', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      settings: {
        v1: {
          servers: [mockServer],
          activeServerProfileId: 'profile-id',
          liveStreamPreferences: mockLiveStreamPreferences,
        },
      },
    }),
}));

jest.mock('../../../helpers/colors', () => ({
  useStyles: (fn: (value: unknown) => unknown) =>
    fn({
      theme: {
        mediaBackground: '#000',
        mediaOverlay: '#000',
        mediaOverlayPanel: '#000',
        textInverse: '#fff',
        link: '#fff',
      },
    }),
  useTheme: () => ({
    mediaOverlay: '#000',
    mediaText: '#fff',
    text: '#fff',
    textInverse: '#000',
  }),
}));

jest.mock('../../../helpers/rest', () => ({
  buildServerApiUrl: jest.fn(() => 'https://server'),
  useRest: () => ({get: mockGet}),
}));

jest.mock('../../../helpers/liveDiscovery', () => ({
  loadLiveConfig: (_server: unknown, loader: () => Promise<unknown>) => loader(),
}));

jest.mock('../../../helpers/protectedLive', () => ({
  prepareLocalRtspMedia: mockPrepareLocalRtspMedia,
  selectProtectedLiveStreams: () => mockSelectProtectedLiveStreams(),
  selectProtectedLiveStreamOptions: () => mockSelectProtectedLiveStreamOptions(),
}));

jest.mock('../../../helpers/playbackLifecycle', () => ({
  useScreenPlaybackLifecycle: () => ({
    active: mockPlaybackActive,
    activationId: mockActivationId,
  }),
}));

jest.mock('../../../helpers/secureLogger', () => ({
  SecureLogger: {logError: mockLogError, logInfo: mockLogInfo},
}));

jest.mock('../../../helpers/hevcTransport', () => ({
  fetchStreamMetadata: mockFetchStreamMetadata,
  planProtectedLiveStreams: (...args: unknown[]) =>
    mockPlanProtectedLiveStreams(...args),
  probeDeviceCodecCapability: () => mockProbeDeviceCodecCapability(),
  protectedMseProbeEnabled: () => mockMseProbeEnabled,
  protectedMseProbeFailure: () => 'unknown',
}));

jest.mock('../../../components/media/ProtectedWebRTCPlayer', () => {
  const ReactModule = require('react');
  const {View} = require('react-native');
  return {
    ['ProtectedWebRTCPlayer']: (props: {
      muted?: boolean;
      streamName?: string;
      onPlaying: () => void;
      onError?: (reason?: 'codec' | 'network' | 'timeout') => void;
      onAudioAvailabilityChange?: (available: boolean) => void;
      onAudioActivationChange?: (active: boolean) => void;
      onAudioStatusChange?: (status: ProtectedAudioStatus) => void;
    }) => {
      mockPlayerProps = props;
      ReactModule.useEffect(() => {
        mockWebRtcMounts += 1;
      }, []);
      ReactModule.useEffect(() => {
        props.onAudioAvailabilityChange?.(true);
        props.onAudioActivationChange?.(false);
        props.onAudioStatusChange?.({state: 'inactive'});
        if (mockPlayerShouldReportPlaying) {
          props.onPlaying();
        }
      }, [props.onPlaying]);
      return ReactModule.createElement(View, {testID: 'protected-player'});
    },
  };
});

jest.mock('../../../components/media/LocalRtspPlayer', () => ({
  ['LocalRtspPlayer']: () => null,
}));

jest.mock('../../../helpers/protectedMedia', () => ({
  protectedMseMediaUri: mockProtectedMseMediaUri,
  protectedMediaProfileId: jest.fn().mockResolvedValue('profile-id'),
  releaseProtectedMediaUri: jest.fn(),
}));

jest.mock('../../../components/media/Media3MediaPlayer', () => {
  const ReactModule = require('react');
  const {View} = require('react-native');
  return {
    ['Media3MediaPlayer']: (props: {onFirstFrame: () => void}) => {
      ReactModule.useEffect(() => {
        mockMseMounts += 1;
      }, []);
      ReactModule.useEffect(() => {
        if (mockMseShouldReportPlaying) {
          props.onFirstFrame();
        }
      }, [props.onFirstFrame]);
      return ReactModule.createElement(View, {testID: 'mse-player'});
    },
  };
});

jest.mock('../../../helpers/mediaDownload', () => ({
  downloadMedia: jest.fn(),
  fileUri: jest.fn(() => 'file://snapshot'),
  removeDownloadedMedia: jest.fn(),
  releaseDownloadedMedia: jest.fn(),
  retainDownloadedMedia: jest.fn(),
}));

jest.mock('../../../helpers/snapshotHandoff', () => ({
  commitSnapshotHandoff: jest.fn(),
  discardSnapshotHandoff: jest.fn((state: unknown) => state),
  queueSnapshotHandoff: jest.fn((state: unknown) => state),
}));

jest.mock('../../../helpers/liveReconnect', () => ({
  nextLiveReconnect: jest.fn(() => ({delayMs: 1})),
}));

jest.mock('../../../components/ZoomableImage', () => ({
  ['ZoomableImage']: () => null,
}));

jest.mock('../../../components/media/LiveStatusBadge', () => ({
  ['LiveStatusBadge']: (props: Record<string, unknown>) => {
    const ReactModule = require('react');
    const {View} = require('react-native');
    return ReactModule.createElement(View, {
      testID: 'mock-live-status',
      ...props,
    });
  },
}));

const {LivePreview} =
  require('../../../views/camera-preview/LivePreview') as typeof import('../../../views/camera-preview/LivePreview');

describe('LivePreview audio render gate', () => {
  it('keeps desired audio pending through legacy false, confirms only explicit active and cancels immediately', async () => {
    const view = render(<IntlProvider locale="en" messages={en}><LivePreview cameraName="front" /></IntlProvider>);
    await waitFor(() => expect(view.getByRole('button', {name: 'Enable audio'})).toBeTruthy());
    expect(mockPlayerProps?.muted).toBe(true);
    fireEvent.press(view.getByRole('button', {name: 'Enable audio'}));
    expect(mockPlayerProps?.muted).toBe(false);
    expect(view.getByRole('button', {name: 'Cancel audio activation'}).props.accessibilityState).toEqual({checked: false, busy: true});
    expect(view.getByText('Activating audio… Tap to cancel.')).toBeTruthy();
    await act(async () => {
      mockPlayerProps?.onAudioActivationChange?.(false);
      mockPlayerProps?.onAudioStatusChange?.({state: 'pending'});
    });
    expect(mockPlayerProps?.muted).toBe(false);
    expect(view.queryByRole('button', {name: 'Disable audio'})).toBeNull();
    fireEvent.press(view.getByRole('button', {name: 'Cancel audio activation'}));
    expect(mockPlayerProps?.muted).toBe(true);
    await act(async () => mockPlayerProps?.onAudioStatusChange?.({state: 'active'}));
    expect(view.getByRole('button', {name: 'Enable audio'})).toBeTruthy();
    fireEvent.press(view.getByRole('button', {name: 'Enable audio'}));
    await act(async () => mockPlayerProps?.onAudioStatusChange?.({state: 'active'}));
    expect(view.getByRole('button', {name: 'Disable audio'}).props.accessibilityState).toEqual({checked: true});
    fireEvent.press(view.getByRole('button', {name: 'Disable audio'}));
    expect(mockPlayerProps?.muted).toBe(true);
    expect(view.getByTestId('camera-preview-audio-container').props.pointerEvents).toBe('box-none');
    expect(view.getByTestId('camera-preview-media').props.pointerEvents).toBe('box-none');
    fireEvent.press(view.getByTestId('camera-preview-media-tap'));
    expect(view.getByRole('button', {name: 'Enable audio'})).toBeTruthy();
    view.unmount();
  });

  it.each(['focus-denied', 'native', 'timeout'] as const)('shows %s failure and allows a fresh attempt', async reason => {
    const view = render(<IntlProvider locale="en" messages={en}><LivePreview cameraName="front" /></IntlProvider>);
    await waitFor(() => expect(view.getByRole('button', {name: 'Enable audio'})).toBeTruthy());
    fireEvent.press(view.getByRole('button', {name: 'Enable audio'}));
    await act(async () => mockPlayerProps?.onAudioStatusChange?.({state: 'failed', reason}));
    expect(mockPlayerProps?.muted).toBe(true);
    expect(view.getByTestId('camera-preview-audio-hint').props.children).toBe(en[`cameraPreview.audio.failure.${reason}`]);
    fireEvent.press(view.getByRole('button', {name: 'Retry audio'}));
    expect(mockPlayerProps?.muted).toBe(false);
    expect(view.getByRole('button', {name: 'Cancel audio activation'})).toBeTruthy();
    view.unmount();
  });

  it('explains unavailable audio and ignores old callbacks after a lifecycle remount', async () => {
    const tree = <IntlProvider locale="en" messages={en}><LivePreview cameraName="front" /></IntlProvider>;
    const view = render(tree);
    await waitFor(() => expect(view.getByRole('button', {name: 'Enable audio'})).toBeTruthy());
    await act(async () => mockPlayerProps?.onAudioAvailabilityChange?.(false));
    expect(view.getByText('No audio is available in this live stream.')).toBeTruthy();
    fireEvent.press(view.getByRole('button', {name: 'Audio unavailable'}));
    expect(mockPlayerProps?.muted).toBe(true);
    const oldProps = mockPlayerProps;
    mockActivationId += 1;
    view.rerender(<IntlProvider locale="en" messages={en}><LivePreview cameraName="front" /></IntlProvider>);
    await waitFor(() => expect(view.getByRole('button', {name: 'Enable audio'})).toBeTruthy());
    fireEvent.press(view.getByRole('button', {name: 'Enable audio'}));
    await act(async () => {
      oldProps?.onAudioStatusChange?.({state: 'failed', reason: 'timeout'});
      oldProps?.onAudioAvailabilityChange?.(false);
    });
    expect(mockPlayerProps?.muted).toBe(false);
    expect(view.getByRole('button', {name: 'Cancel audio activation'})).toBeTruthy();
    await act(async () => appStateListeners.forEach(listener => listener('background')));
    expect(mockPlayerProps?.muted).toBe(true);
    await act(async () => appStateListeners.forEach(listener => listener('active')));
    await waitFor(() => expect(view.getByRole('button', {name: 'Enable audio'})).toBeTruthy());
    expect(mockPlayerProps?.muted).toBe(true);
    view.unmount();
  });

  beforeAll(() => {
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'active',
    });
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, listener) => {
        appStateListeners.push(listener as (state: 'active' | 'background') => void);
        return {remove: jest.fn()};
      });
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
  });

  beforeEach(() => {
    appStateListeners.length = 0;
    mockPlaybackActive = true;
    mockActivationId = 1;
    mockPlayerShouldReportPlaying = true;
    mockMseShouldReportPlaying = true;
    mockMseMounts = 0;
    mockWebRtcMounts = 0;
    mockMseProbeEnabled = false;
    mockLiveStreamPreferences = {};
    mockPlayerProps = undefined;
    mockGet.mockReset();
    mockFetchStreamMetadata.mockReset();
    mockSelectProtectedLiveStreams.mockReset();
    mockSelectProtectedLiveStreams.mockReturnValue(['front']);
    mockSelectProtectedLiveStreamOptions.mockReset();
    mockSelectProtectedLiveStreamOptions.mockReturnValue([]);
    mockDispatch.mockReset();
    mockProbeDeviceCodecCapability.mockReset();
    mockProbeDeviceCodecCapability.mockResolvedValue({availability: 'supported'});
    mockPlanProtectedLiveStreams.mockReset();
    mockPlanProtectedLiveStreams.mockImplementation(({streams, mseEnabled}) => {
      const first = streams[0];
      if (!first?.metadata) {
        return [];
      }
      const hevc = first?.metadata?.video?.some(
        (descriptor: {codec: string}) => descriptor.codec === 'h265',
      );
      return first
        ? [
            {
              name: first.name,
              codec: hevc ? 'h265' : 'h264',
              transport: hevc && mseEnabled ? 'mse' : 'webrtc',
            },
          ]
        : [];
    });
    mockPrepareLocalRtspMedia.mockReset();
    mockPrepareLocalRtspMedia.mockRejectedValue(new Error('no local route'));
    mockProtectedMseMediaUri.mockReset();
    mockProtectedMseMediaUri.mockResolvedValue('frigate-media://profile/mse/front');
    mockLogInfo.mockReset();
    mockLogError.mockReset();
    mockFetchStreamMetadata.mockResolvedValue({
      audio: [{kind: 'audio', codec: 'opus'}],
      malformed: false,
    });
    mockGet.mockResolvedValue({
      go2rtc: {streams: {front: {}}},
      cameras: {front: {live: {streams: {main: 'front'}}}},
    });
  });

  it('logs only normalized audio codec capability for each selected stream', async () => {
    const view = render(
      <IntlProvider locale="en" messages={en}>
        <LivePreview cameraName="front" />
      </IntlProvider>,
    );

    await waitFor(() =>
      expect(mockFetchStreamMetadata).toHaveBeenCalledWith(mockServer, 'front'),
    );
    expect(mockLogInfo).toHaveBeenCalledWith(
      'streamIndex=0, metadataAvailable=true, malformed=false, aac=false, opus=true, pcma=false, pcmu=false',
      'protected-live-codecs',
    );
    expect(mockLogInfo.mock.calls.flat().join(' ')).not.toContain('front');
    view.unmount();
  });

  it('starts Media3 directly so one MSE connection owns validation and playback', async () => {
    mockMseProbeEnabled = true;
    mockFetchStreamMetadata.mockResolvedValue({
      video: [{kind: 'video', codec: 'h265'}],
      audio: [],
      malformed: false,
    });

    const view = render(
      <IntlProvider locale="en" messages={en}>
        <LivePreview cameraName="front" />
      </IntlProvider>,
    );

    await waitFor(() => expect(mockProtectedMseMediaUri).toHaveBeenCalledWith(
      mockServer,
      'front',
    ));
    expect(mockPrepareLocalRtspMedia).not.toHaveBeenCalled();
    await waitFor(() => expect(view.getByTestId('mse-player')).toBeTruthy());
    await waitFor(() => {
      const status = view.getByTestId('mock-live-status');
      expect(status.props.state).toBe('live');
      expect(status.props.transport).toBe('mse');
    });
    expect(mockPrepareLocalRtspMedia).not.toHaveBeenCalled();
    expect(view.queryByText(en['cameraPreview.fallback.codec'])).toBeNull();
    view.unmount();
  });

  it('creates the opaque MSE URI only after metadata selects the stream', async () => {
    mockMseProbeEnabled = true;
    let resolveMetadata!: (value: unknown) => void;
    mockFetchStreamMetadata.mockReturnValue(new Promise(resolve => {
      resolveMetadata = resolve;
    }));

    const view = render(
      <IntlProvider locale="en" messages={en}>
        <LivePreview cameraName="front" />
      </IntlProvider>,
    );

    expect(mockProtectedMseMediaUri).not.toHaveBeenCalled();
    expect(view.queryByTestId('mse-player')).toBeNull();

    resolveMetadata({
      video: [{kind: 'video', codec: 'h265'}],
      audio: [],
      malformed: false,
    });
    await waitFor(() => expect(mockProtectedMseMediaUri).toHaveBeenCalledWith(
      mockServer,
      'front',
    ));
    await waitFor(() => expect(view.getByTestId('mse-player')).toBeTruthy());
    view.unmount();
  });

  it('starts MSE without waiting for the optional camera stats request', async () => {
    mockMseProbeEnabled = true;
    mockGet.mockImplementation((_: unknown, endpoint: string) =>
      endpoint === 'stats'
        ? new Promise(() => undefined)
        : Promise.resolve({
            go2rtc: {streams: {front: {}}},
            cameras: {front: {live: {streams: {main: 'front'}}}},
          }),
    );
    mockFetchStreamMetadata.mockResolvedValue({
      video: [{kind: 'video', codec: 'h265'}],
      audio: [],
      malformed: false,
    });

    const view = render(
      <IntlProvider locale="en" messages={en}>
        <LivePreview cameraName="front" />
      </IntlProvider>,
    );

    await waitFor(() => expect(view.getByTestId('mse-player')).toBeTruthy());
    view.unmount();
  });

  it('starts an eligible MSE stream before slower fallback metadata resolves', async () => {
    mockMseProbeEnabled = true;
    mockSelectProtectedLiveStreams.mockReturnValue(['compatible', 'original']);
    let resolveCompatible!: (value: unknown) => void;
    mockFetchStreamMetadata.mockImplementation((_: unknown, streamName: string) =>
      streamName === 'compatible'
        ? new Promise(resolve => {
            resolveCompatible = resolve;
          })
        : Promise.resolve({
            video: [{kind: 'video', codec: 'h265'}],
            audio: [],
            malformed: false,
          }),
    );
    mockPlanProtectedLiveStreams.mockImplementation(({streams}) => streams
      .filter((stream: {metadata?: unknown}) => stream.metadata)
      .map((stream: {name: string; metadata?: {video?: Array<{codec: string}>}}) => ({
        name: stream.name,
        codec: stream.metadata?.video?.some(
          descriptor => descriptor.codec === 'h265',
        ) ? 'h265' : 'h264',
        transport: stream.metadata?.video?.some(
          descriptor => descriptor.codec === 'h265',
        ) ? 'mse' : 'webrtc',
      })));

    const view = render(
      <IntlProvider locale="en" messages={en}>
        <LivePreview cameraName="front" />
      </IntlProvider>,
    );

    await waitFor(() => expect(view.getByTestId('mse-player')).toBeTruthy());
    resolveCompatible({
      video: [{kind: 'video', codec: 'h264'}],
      audio: [],
      malformed: false,
    });
    await waitFor(() => expect(mockFetchStreamMetadata).toHaveBeenCalledTimes(2));
    expect(mockMseMounts).toBe(1);
    view.unmount();
  });

  it('starts a bounded WebRTC hedge and keeps the first real frame', async () => {
    jest.useFakeTimers();
    mockMseProbeEnabled = true;
    mockMseShouldReportPlaying = false;
    mockPlayerShouldReportPlaying = false;
    mockSelectProtectedLiveStreams.mockReturnValue(['original', 'compatible']);
    mockFetchStreamMetadata.mockImplementation((_: unknown, streamName: string) =>
      Promise.resolve({
        video: [{
          kind: 'video',
          codec: streamName === 'original' ? 'h265' : 'h264',
        }],
        audio: [],
        malformed: false,
      }),
    );
    mockPlanProtectedLiveStreams.mockImplementation(({streams}) => {
      const available = streams.filter(
        (stream: {metadata?: unknown}) => stream.metadata,
      );
      return available.map((stream: {name: string}) => ({
        name: stream.name,
        codec: stream.name === 'original' ? 'h265' : 'h264',
        transport: stream.name === 'original' ? 'mse' : 'webrtc',
      }));
    });

    const view = render(
      <IntlProvider locale="en" messages={en}>
        <LivePreview cameraName="front" />
      </IntlProvider>,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.getByTestId('mse-player')).toBeTruthy();
    expect(view.queryByTestId('protected-player')).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(2500);
      await Promise.resolve();
    });
    expect(view.getByTestId('protected-player')).toBeTruthy();
    await act(async () => mockPlayerProps?.onPlaying());
    expect(view.getByTestId('mock-live-status').props.transport).toBe('webrtc');
    expect(view.queryByTestId('mse-player')).toBeNull();
    view.unmount();
    jest.useRealTimers();
  });

  it('remounts the selected WebRTC stream after a connection error', async () => {
    const view = render(
      <IntlProvider locale="en" messages={en}>
        <LivePreview cameraName="front" />
      </IntlProvider>,
    );
    await waitFor(() => expect(mockWebRtcMounts).toBe(1));
    mockPlayerShouldReportPlaying = false;
    await act(async () => mockPlayerProps?.onError?.('network'));
    await waitFor(() => expect(mockWebRtcMounts).toBe(2));
    expect(mockPlayerProps?.streamName).toBe('front');
    view.unmount();
  });

  it('falls back after failed metadata for a manual stream settles', async () => {
    mockLiveStreamPreferences = {
      'profile-id': {
        front: {mode: 'manual', streamName: 'original'},
      },
    };
    mockSelectProtectedLiveStreams.mockReturnValue(['compatible', 'original']);
    mockFetchStreamMetadata.mockImplementation((_: unknown, streamName: string) =>
      streamName === 'original'
        ? Promise.reject(new Error('metadata unavailable'))
        : Promise.resolve({
            video: [{kind: 'video', codec: 'h264'}],
            audio: [],
            malformed: false,
          }),
    );
    mockPlanProtectedLiveStreams.mockImplementation(({streams, selection}) => {
      const selected = streams.find(
        (stream: {name: string; metadata?: unknown}) =>
          selection.mode === 'manual' &&
          stream.name === selection.streamName &&
          stream.metadata,
      );
      const fallback = streams.find(
        (stream: {metadata?: unknown}) => stream.metadata,
      );
      const candidate = selected || fallback;
      return candidate
        ? [{name: candidate.name, codec: 'h264', transport: 'webrtc'}]
        : [];
    });

    const view = render(
      <IntlProvider locale="en" messages={en}>
        <LivePreview cameraName="front" />
      </IntlProvider>,
    );
    await waitFor(() => expect(view.getByTestId('protected-player')).toBeTruthy());
    expect(mockPlayerProps?.streamName).toBe('compatible');
    view.unmount();
  });

  it('starts a non-primary HEVC candidate before the compatible stream', async () => {
    mockMseProbeEnabled = true;
    mockSelectProtectedLiveStreams.mockReturnValue(['compatible', 'original']);
    mockFetchStreamMetadata.mockImplementation((_: unknown, streamName: string) =>
      Promise.resolve({
        video: [
          {
            kind: 'video',
            codec: streamName === 'original' ? 'h265' : 'h264',
          },
        ],
        audio: [],
        malformed: false,
      }),
    );
    mockPlanProtectedLiveStreams.mockImplementation(({streams}) => [
      {name: streams[1].name, codec: 'h265', transport: 'mse'},
      {name: streams[0].name, codec: 'h264', transport: 'webrtc'},
    ]);
    const view = render(
      <IntlProvider locale="en" messages={en}>
        <LivePreview cameraName="front" />
      </IntlProvider>,
    );

    await waitFor(() =>
      expect(mockProtectedMseMediaUri).toHaveBeenCalledWith(
        mockServer,
        'original',
      ),
    );
    expect(mockPrepareLocalRtspMedia).not.toHaveBeenCalled();
    await waitFor(() => expect(view.getByTestId('mse-player')).toBeTruthy());
    view.unmount();
  });

  it('does not use Frigate camera FPS as the live stream FPS', async () => {
    mockGet.mockImplementation((_server: unknown, endpoint: string) =>
      Promise.resolve(endpoint === 'stats'
        ? {cameras: {front: {camera_fps: 12}}}
        : {
            go2rtc: {streams: {front: {}}},
            cameras: {front: {live: {streams: {main: 'front'}}}},
          }),
    );
    mockSelectProtectedLiveStreams.mockReturnValue(['compatible', 'original']);
    mockSelectProtectedLiveStreamOptions.mockReturnValue([
      {name: 'compatible', label: 'Compatible'},
      {name: 'original', label: 'Original H.264'},
    ]);
    mockFetchStreamMetadata.mockResolvedValue({
      video: [{
        kind: 'video',
        codec: 'h264',
        width: 1920,
        height: 1080,
      }],
      audio: [],
      malformed: false,
    });

    const view = render(
      <IntlProvider locale="en" messages={en}>
        <LivePreview cameraName="front" />
      </IntlProvider>,
    );

    await waitFor(() =>
      expect(view.getByTestId('camera-preview-stream-selector')).toBeTruthy(),
    );
    expect(view.getByTestId('mock-live-status').props.frameRate).toBeUndefined();
    fireEvent.press(view.getByTestId('camera-preview-media-tap'));
    expect(view.getByTestId('camera-preview-stream-selector')).toBeTruthy();
    expect(view.queryByRole('radio')).toBeNull();
    fireEvent.press(view.getByTestId('camera-preview-stream-dropdown'));
    expect(view.getByTestId('camera-preview-stream-menu-dismiss')).toBeTruthy();
    fireEvent.press(view.getByTestId('camera-preview-stream-menu-dismiss'));
    expect(view.queryByRole('radio')).toBeNull();
    fireEvent.press(view.getByTestId('camera-preview-stream-dropdown'));
    fireEvent.press(
      view.getByRole('radio', {
        name: 'Original H.264 - 1920 x 1080',
      }),
    );
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          profileId: 'profile-id',
          cameraName: 'front',
          preference: {mode: 'manual', streamName: 'original'},
        },
      }),
    );
    view.unmount();
  });

  it('uses the selected stream metadata FPS when it is available', async () => {
    mockFetchStreamMetadata.mockResolvedValue({
      video: [{kind: 'video', codec: 'h264', frameRate: 25}],
      audio: [],
      malformed: false,
    });

    const view = render(
      <IntlProvider locale="en" messages={en}>
        <LivePreview cameraName="front" />
      </IntlProvider>,
    );

    await waitFor(() =>
      expect(view.getByTestId('mock-live-status').props.frameRate).toBe(25),
    );
    view.unmount();
  });

  it('marks the active fallback stream instead of an unavailable manual preference', async () => {
    mockLiveStreamPreferences = {
      'profile-id': {
        front: {mode: 'manual', streamName: 'original'},
      },
    };
    mockSelectProtectedLiveStreams.mockReturnValue(['compatible', 'original']);
    mockSelectProtectedLiveStreamOptions.mockReturnValue([
      {name: 'compatible', label: 'Compatible'},
      {name: 'original', label: 'Original'},
    ]);
    mockFetchStreamMetadata.mockImplementation((_: unknown, streamName: string) =>
      Promise.resolve({
        video: [{
          kind: 'video',
          codec: streamName === 'original' ? 'h265' : 'h264',
        }],
        audio: [],
        malformed: false,
      }),
    );
    mockPlanProtectedLiveStreams.mockReturnValue([
      {name: 'compatible', codec: 'h264', transport: 'webrtc'},
    ]);

    const view = render(
      <IntlProvider locale="en" messages={en}>
        <LivePreview cameraName="front" />
      </IntlProvider>,
    );

    const mediaTap = await view.findByTestId('camera-preview-media-tap');
    expect(mediaTap.props.style).toMatchObject({
      top: 48,
      right: 32,
      bottom: 72,
      left: 32,
    });
    fireEvent.press(mediaTap);
    expect(view.queryByRole('radio')).toBeNull();
    fireEvent.press(view.getByTestId('camera-preview-stream-dropdown'));

    expect(
      view.getByRole('radio', {name: 'Compatible - H.264'}).props
        .accessibilityState,
    ).toEqual({selected: true});
    expect(
      view.getByRole('radio', {name: 'Original - H.265'}).props
        .accessibilityState,
    ).toEqual({selected: false});
    view.unmount();
  });

  const gateCases = [
    {name: 'AppState background', kind: 'background'},
    {name: 'playback inactive', kind: 'inactive'},
    {name: 'decoded false', kind: 'decoded'},
    {name: 'live phase not live', kind: 'phase'},
  ] as const;

  it.each(gateCases)(
    'does not expose audio control for $name',
    async ({kind}) => {
      if (kind === 'decoded') {
        mockPlayerShouldReportPlaying = false;
      }
      if (kind === 'inactive') {
        mockPlaybackActive = true;
      }
      const view = render(
        <IntlProvider locale="en" messages={en}>
          <LivePreview cameraName="front" />
        </IntlProvider>,
      );

      if (kind === 'background' || kind === 'inactive' || kind === 'phase') {
        await waitFor(() =>
          expect(view.queryByTestId('camera-preview-audio')).toBeTruthy(),
        );
      } else {
        await waitFor(() => expect(mockPlayerProps).toBeDefined());
        expect(view.queryByTestId('camera-preview-audio')).toBeNull();
      }

      if (kind === 'background') {
        fireEvent.press(view.getByTestId('camera-preview-audio'));
        await waitFor(() => expect(mockPlayerProps?.muted).toBe(false));
        await act(async () => {
          appStateListeners.forEach(listener => listener('background'));
        });
        expect(view.queryByTestId('camera-preview-audio')).toBeNull();
        expect(mockPlayerProps?.muted).toBe(true);
        await act(async () => {
          mockPlayerProps?.onAudioAvailabilityChange?.(true);
          mockPlayerProps?.onAudioActivationChange?.(true);
        });
        expect(view.queryByTestId('camera-preview-audio')).toBeNull();
      } else if (kind === 'inactive') {
        mockPlaybackActive = false;
        mockActivationId = 2;
        view.rerender(
          <IntlProvider locale="en" messages={en}>
            <LivePreview cameraName="front" />
          </IntlProvider>,
        );
        await waitFor(() =>
          expect(view.queryByTestId('camera-preview-audio')).toBeNull(),
        );
      } else if (kind === 'phase') {
        mockPlayerShouldReportPlaying = false;
        mockActivationId = 2;
        view.rerender(
          <IntlProvider locale="en" messages={en}>
            <LivePreview cameraName="front" />
          </IntlProvider>,
        );
        await waitFor(() =>
          expect(view.queryByTestId('camera-preview-audio')).toBeNull(),
        );
      }
      view.unmount();
    },
  );
});
