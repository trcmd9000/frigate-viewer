import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {IntlProvider} from 'react-intl';
import {Platform} from 'react-native';
import en from '../../../i18n/en';
import {CameraEventClip} from '../../../views/camera-event-clip/CameraEventClip';
import {
  EntitlementProvider,
  EntitlementStore,
  EntitlementsProvider,
} from '../../../helpers/entitlements';
import {resetEventPlaybackSpeed} from '../../../helpers/playbackSpeed';

const server = {
  protocol: 'https',
  host: 'frigate.example.test',
  port: 443,
  path: '',
  auth: 'none',
  credentials: {},
};
const event = {id: 'event-1', camera: 'front-door', start_time: 10, end_time: 20};
const mockProtectedMediaUri = jest.fn();
const mockUseAppSelector = jest.fn(() => server);

jest.mock('../../../store/store', () => ({
  store: {getState: () => ({events: {scopeGeneration: 0}})},
  useAppSelector: (selector: unknown) =>
    selector === require('../../../store/events').selectServerScopeGeneration
      ? 0
      : mockUseAppSelector(),
}));
jest.mock('../../../store/settings', () => ({selectServer: jest.fn()}));
jest.mock('../../../helpers/playbackLifecycle', () => ({
  useScreenPlaybackLifecycle: () => ({active: true, activationId: 0}),
}));
jest.mock('../../../helpers/protectedMedia', () => ({
  eventVodPath: jest.fn(() => '/vod/front-door/master.m3u8'),
  protectedMediaUri: (...args: unknown[]) => mockProtectedMediaUri(...args),
}));
jest.mock('../../../helpers/colors', () => ({
  useStyles: (fn: (value: unknown) => unknown) =>
    fn({theme: {background: '#000', text: '#fff', overlay: '#0008', highlighted: '#333'}}),
  useTheme: () => ({background: '#000', text: '#fff'}),
}));
jest.mock('../../../views/camera-event-clip/ProgressBar', () => ({
  ['ProgressBar']: () => null,
}));
jest.mock('react-native-share', () => ({open: jest.fn()}));
jest.mock('../../../helpers/mediaDownload', () => ({
  downloadMedia: jest.fn(),
  fileUri: jest.fn((path: string) => `file://${path}`),
  releaseDownloadedMedia: jest.fn(),
  retainDownloadedMedia: jest.fn(),
}));
jest.mock('@ant-design/icons-react-native', () => ({
  ['IconOutline']: () => null,
}));
jest.mock('../../../components/media/Media3MediaPlayer', () => {
  const ReactModule = require('react');
  const NativeView = require('react-native').View;
  return {
    Media3MediaPlayer: ReactModule.forwardRef(
      (
        props: {
          onProgress: (progress: {currentTime: number; duration: number}) => void;
          playbackRate: number;
        },
        ref: React.Ref<unknown>,
      ) => {
        ReactModule.useImperativeHandle(ref, () => ({}));
        ReactModule.useEffect(() => {
          props.onProgress({currentTime: 0, duration: 10});
        }, [props.onProgress]);
        return ReactModule.createElement(NativeView, {
          testID: 'media-player',
          playbackRate: props.playbackRate,
        });
      },
    ),
  };
});

const renderClip = (children: React.ReactNode) =>
  render(
    <IntlProvider locale="en" messages={en}>
      {children}
    </IntlProvider>,
  );

describe('CameraEventClip playback speed', () => {
  beforeEach(() => {
    resetEventPlaybackSpeed();
    mockProtectedMediaUri.mockReset();
    mockProtectedMediaUri.mockResolvedValue(
      'frigate-media://0123456789abcdef0123456789abcdef/vod/front-door/master.m3u8',
    );
    (Platform as {OS: string}).OS = 'android';
  });

  it('presents the menu and applies a selected supported speed', async () => {
    const view = renderClip(
      <CameraEventClip
        event={event as never}
        componentId="camera-event-clip"
        componentName="CameraEventClip"
      />,
    );

    const speedButton = await view.findByTestId('event-playback-speed');
    fireEvent.press(speedButton);
    expect(view.getAllByRole('menuitem')).toHaveLength(8);
    fireEvent.press(view.getByTestId('event-playback-speed-1.5'));
    expect(view.getByTestId('media-player').props.playbackRate).toBe(1.5);
  }, 15000);

  it('keeps overflow and speed menus mutually exclusive and anchors speed below its button', async () => {
    const view = renderClip(
      <CameraEventClip
        event={event as never}
        componentId="camera-event-clip"
        componentName="CameraEventClip"
      />,
    );

    const speedButton = await view.findByTestId('event-playback-speed');
    fireEvent.press(speedButton);
    expect(view.getByTestId('event-playback-speed-menu')).toBeTruthy();
    expect(view.queryByTestId('event-player-overflow-menu')).toBeNull();
    expect(view.getByTestId('event-playback-speed-anchor').props.style).toEqual(
      expect.objectContaining({position: 'relative'}),
    );

    fireEvent.press(view.getByTestId('event-player-overflow'));
    expect(view.queryByTestId('event-playback-speed-menu')).toBeNull();
    expect(view.getByTestId('event-player-overflow-menu')).toBeTruthy();

    fireEvent.press(speedButton);
    expect(view.queryByTestId('event-player-overflow-menu')).toBeNull();
    expect(view.getByTestId('event-playback-speed-menu')).toBeTruthy();
  }, 15000);

  it('does not present speed controls for a denied provider', async () => {
    const deniedProvider: EntitlementProvider = {
      id: 'denied-speed-provider',
      resolve: async () => ({
        status: 'available',
        features: {event_playback_speed: false},
      }),
    };
    const view = render(
      <EntitlementsProvider
        provider={deniedProvider}
        store={new EntitlementStore(deniedProvider)}
      >
        <IntlProvider locale="en" messages={en}>
          <CameraEventClip
            event={event as never}
            componentId="camera-event-clip"
            componentName="CameraEventClip"
          />
        </IntlProvider>
      </EntitlementsProvider>,
    );

    await waitFor(() => expect(view.getByTestId('media-player')).toBeTruthy());
    expect(view.queryByTestId('event-playback-speed')).toBeNull();
    expect(view.getByTestId('media-player').props.playbackRate).toBe(1);
  });
});
