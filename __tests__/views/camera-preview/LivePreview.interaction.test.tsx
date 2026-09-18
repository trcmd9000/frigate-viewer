import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {IntlProvider} from 'react-intl';
import {Platform} from 'react-native';
import en from '../../../i18n/en';
import {LivePreview} from '../../../views/camera-preview/LivePreview';

const mockGet = jest.fn();
const mockDownload = jest.fn();
const mockDispatch = jest.fn();
const mockServer = {
  protocol: 'https',
  host: 'frigate.example.test',
  port: 443,
  path: '',
  auth: 'none',
  credentials: {},
};

jest.mock('../../../store/store', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: () => mockServer,
}));
jest.mock('../../../store/settings', () => ({selectServer: jest.fn()}));
jest.mock('../../../helpers/rest', () => ({
  buildServerApiUrl: () => 'https://frigate.example.test',
  useRest: () => ({get: mockGet}),
}));
jest.mock('../../../helpers/playbackLifecycle', () => ({
  useScreenPlaybackLifecycle: () => ({active: true, activationId: 0}),
}));
jest.mock('../../../helpers/protectedLive', () => ({
  selectProtectedLiveStreams: () => [],
  selectProtectedLiveStreamOptions: () => [],
  prepareLocalRtspMedia: jest.fn(),
}));
jest.mock('../../../helpers/mediaDownload', () => ({
  downloadMedia: (...args: unknown[]) => mockDownload(...args),
  fileUri: (path: string) => `file://${path}`,
  releaseDownloadedMedia: jest.fn(),
  retainDownloadedMedia: jest.fn(),
  removeDownloadedMedia: jest.fn(),
}));
jest.mock('../../../helpers/protectedMedia', () => ({
  releaseProtectedMediaUri: jest.fn(),
}));
jest.mock('../../../helpers/colors', () => ({
  useStyles: (factory: (value: unknown) => unknown) =>
    factory({
      theme: {
        mediaBackground: '#000',
        mediaOverlay: '#00000099',
        mediaOverlayPanel: '#00000066',
        mediaText: '#fff',
        textInverse: '#fff',
        link: '#8ab4ff',
      },
    }),
}));
jest.mock('../../../helpers/secureLogger', () => ({
  SecureLogger: {logError: jest.fn(), logInfo: jest.fn()},
}));
jest.mock('../../../components/ZoomableImage', () => ({
  ZoomableImage: (props: Record<string, unknown>) => {
    const {View} = require('react-native');
    return <View testID="zoomable-image" {...props} />;
  },
}));
jest.mock('../../../components/media/ProtectedWebRTCPlayer', () => ({
  ProtectedWebRTCPlayer: () => null,
}));
jest.mock('../../../components/media/LocalRtspPlayer', () => ({
  LocalRtspPlayer: () => null,
}));
jest.mock('../../../components/media/LiveStatusBadge', () => ({
  LiveStatusBadge: () => null,
}));
jest.mock('../../../views/camera-preview/LiveAudioControl', () => ({
  LiveAudioControl: () => null,
}));

describe('LivePreview interaction layering', () => {
  const originalPlatform = Platform.OS;

  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatform,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({});
    mockDownload.mockResolvedValue('/snapshot.jpg');
  });

  it('keeps retry and snapshot gesture surfaces usable while media taps reveal overlays', async () => {
    const view = render(
      <IntlProvider locale="en" messages={en}>
        <LivePreview cameraName="front-door" />
      </IntlProvider>,
    );

    const media = await view.findByTestId('camera-preview-media');
    await waitFor(() => expect(view.getByTestId('zoomable-image')).toBeTruthy());
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    const retry = await view.findByTestId('camera-preview-retry');

    expect(view.queryByTestId('camera-preview-media-tap')).toBeNull();
    expect(view.getByTestId('zoomable-image').props.source).toEqual({
      uri: 'file:///snapshot.jpg',
    });

    fireEvent(media, 'touchEnd');
    fireEvent.press(retry);
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));

    expect(retry).toBeTruthy();
    view.unmount();
  }, 15000);
});
