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
const mockProbeProtectedMseContract = jest.fn();
const mockProtectedMseMediaUri = jest.fn();
const mockLogInfo = jest.fn();
const mockServer = {};
let mockPlaybackActive = true;
let mockActivationId = 1;
let mockPlayerShouldReportPlaying = true;
let mockMseProbeEnabled = false;
let mockPlayerProps:
  | {
      muted?: boolean;
      onPlaying: () => void;
      onAudioAvailabilityChange?: (available: boolean) => void;
      onAudioActivationChange?: (active: boolean) => void;
      onAudioStatusChange?: (status: ProtectedAudioStatus) => void;
    }
  | undefined;

jest.mock('../../../store/store', () => ({
  useAppSelector: () => mockServer,
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

jest.mock('../../../helpers/protectedLive', () => ({
  prepareLocalRtspMedia: mockPrepareLocalRtspMedia,
  selectProtectedLiveStreams: jest.fn(() => ['front']),
}));

jest.mock('../../../helpers/playbackLifecycle', () => ({
  useScreenPlaybackLifecycle: () => ({
    active: mockPlaybackActive,
    activationId: mockActivationId,
  }),
}));

jest.mock('../../../helpers/secureLogger', () => ({
  SecureLogger: {logError: jest.fn(), logInfo: mockLogInfo},
}));

jest.mock('../../../helpers/hevcTransport', () => ({
  fetchStreamMetadata: mockFetchStreamMetadata,
  protectedMseProbeEnabled: () => mockMseProbeEnabled,
  protectedMseProbeFailure: () => 'unknown',
  probeProtectedMseContract: mockProbeProtectedMseContract,
}));

jest.mock('../../../components/media/ProtectedWebRTCPlayer', () => {
  const ReactModule = require('react');
  const {View} = require('react-native');
  return {
    ['ProtectedWebRTCPlayer']: (props: {
      muted?: boolean;
      onPlaying: () => void;
      onAudioAvailabilityChange?: (available: boolean) => void;
      onAudioActivationChange?: (active: boolean) => void;
      onAudioStatusChange?: (status: ProtectedAudioStatus) => void;
    }) => {
      mockPlayerProps = props;
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
  releaseProtectedMediaUri: jest.fn(),
}));

jest.mock('../../../components/media/Media3MediaPlayer', () => {
  const ReactModule = require('react');
  const {View} = require('react-native');
  return {
    ['Media3MediaPlayer']: (props: {onFirstFrame: () => void}) => {
      ReactModule.useEffect(() => props.onFirstFrame(), [props.onFirstFrame]);
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
    fireEvent(view.getByTestId('camera-preview-media'), 'touchEnd');
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
    mockMseProbeEnabled = false;
    mockPlayerProps = undefined;
    mockGet.mockReset();
    mockFetchStreamMetadata.mockReset();
    mockPrepareLocalRtspMedia.mockReset();
    mockPrepareLocalRtspMedia.mockRejectedValue(new Error('no local route'));
    mockProbeProtectedMseContract.mockReset();
    mockProtectedMseMediaUri.mockReset();
    mockProtectedMseMediaUri.mockResolvedValue('frigate-media://profile/mse/front');
    mockLogInfo.mockReset();
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
      expect(mockLogInfo).toHaveBeenCalledWith(
        'streamIndex=0, metadataAvailable=true, malformed=false, aac=false, opus=true, pcma=false, pcmu=false',
        'protected-live-codecs',
      ),
    );
    expect(mockFetchStreamMetadata).toHaveBeenCalledWith(mockServer, 'front');
    expect(mockLogInfo.mock.calls.flat().join(' ')).not.toContain('front');
    view.unmount();
  });

  it('keeps fallback transports idle until an HEVC probe reaches stable MSE playback', async () => {
    let resolveProbe: (result: {
      mimeH265: boolean;
      ftyp: boolean;
      moov: boolean;
      moof: boolean;
      mdat: boolean;
      bytesObserved: number;
    }) => void = () => undefined;
    mockMseProbeEnabled = true;
    mockPlayerShouldReportPlaying = false;
    mockFetchStreamMetadata.mockResolvedValue({
      video: [{kind: 'video', codec: 'h265'}],
      audio: [],
      malformed: false,
    });
    mockProbeProtectedMseContract.mockReturnValue(
      new Promise(resolve => {
        resolveProbe = resolve;
      }),
    );

    const view = render(
      <IntlProvider locale="en" messages={en}>
        <LivePreview cameraName="front" />
      </IntlProvider>,
    );

    await waitFor(() => expect(mockProbeProtectedMseContract).toHaveBeenCalled());
    expect(mockPrepareLocalRtspMedia).not.toHaveBeenCalled();
    expect(view.queryByTestId('protected-player')).toBeNull();
    expect(view.getByTestId('mock-live-status').props.state).toBe('preparing');

    await act(async () => {
      resolveProbe({
        mimeH265: true,
        ftyp: true,
        moov: true,
        moof: true,
        mdat: true,
        bytesObserved: 1024,
      });
    });

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
