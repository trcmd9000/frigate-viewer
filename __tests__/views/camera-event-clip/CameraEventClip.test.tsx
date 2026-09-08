import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {IntlProvider} from 'react-intl';
import {Platform, StyleSheet} from 'react-native';
import en from '../../../i18n/en';
import de from '../../../i18n/de';
import {CameraEventClip} from '../../../views/camera-event-clip/CameraEventClip';

const mockProtectedMediaUri = jest.fn();
const mockUseAppSelector = jest.fn();
const mockUseScreenPlaybackLifecycle = jest.fn();
const mockMediaPlayerProps = jest.fn();
const mockEmitProgress = {current: false};
let mockTheme = {
  background: '#ffffff',
  text: '#1f2933',
  overlay: '#00000066',
  highlighted: '#f0f4f8',
  mediaBackground: '#000000',
  mediaOverlay: '#000000b8',
  mediaText: '#ffffff',
  surface: '#ffffff',
};

jest.mock('../../../store/store', () => ({
  useAppSelector: () => mockUseAppSelector(),
}));

jest.mock('../../../store/settings', () => ({
  selectServer: jest.fn(),
}));

jest.mock('../../../helpers/playbackLifecycle', () => ({
  useScreenPlaybackLifecycle: () => mockUseScreenPlaybackLifecycle(),
}));

jest.mock('../../../helpers/protectedMedia', () => ({
  eventVodPath: jest.fn(() => '/vod/front-door/master.m3u8'),
  protectedMediaUri: (...args: unknown[]) => mockProtectedMediaUri(...args),
}));

jest.mock('../../../components/media/Media3MediaPlayer', () => ({
  ['Media3MediaPlayer']: (props: Record<string, unknown>) => {
    const ReactModule = require('react');
    const {View: NativeView} = require('react-native');
    mockMediaPlayerProps(props);
    ReactModule.useEffect(() => {
      if (mockEmitProgress.current) {
        (props.onProgress as CallableFunction)?.({
          currentTime: 2,
          duration: 10,
        });
      }
    }, []);
    return ReactModule.createElement(NativeView, {
      testID: 'media-player',
      paused: props.paused,
      muted: props.muted,
    });
  },
}));

jest.mock('../../../views/camera-event-clip/ProgressBar', () => ({
  ['ProgressBar']: () => null,
}));

jest.mock('../../../helpers/colors', () => ({
  useStyles: (fn: (value: unknown) => unknown) =>
    fn({theme: mockTheme}),
  useTheme: () => mockTheme,
}));

jest.mock('react-native-gesture-handler', () => {
  const ReactModule = require('react');
  const {Pressable} = require('react-native');
  return {
    TouchableHighlight: Pressable,
    gestureHandlerRootHOC: (component: unknown) => component,
    ['GestureHandlerRootView']: ({children}: {children: React.ReactNode}) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
  };
});

jest.mock('@ant-design/icons-react-native', () => ({
  ['IconOutline']: (props: Record<string, unknown>) => {
    const ReactModule = require('react');
    const {Text: NativeText} = require('react-native');
    return ReactModule.createElement(NativeText, {
      ...props,
      testID: 'share-icon',
    });
  },
}));

jest.mock('react-native-share', () => ({open: jest.fn()}));

jest.mock('../../../helpers/mediaDownload', () => ({
  downloadMedia: jest.fn(),
  fileUri: jest.fn((path: string) => `file://${path}`),
  releaseDownloadedMedia: jest.fn(),
  retainDownloadedMedia: jest.fn(),
}));

const server = {
  protocol: 'https',
  host: 'frigate.example.test',
  port: 443,
  path: '',
  auth: 'none',
  credentials: {},
};

const event = {
  id: 'event-1',
  camera: 'front-door',
  start_time: 10,
  end_time: 20,
};

const renderClip = (
  messages: Record<string, string>,
  locale = 'en',
  clipEvent = event,
) =>
  render(
    <IntlProvider locale={locale} messages={messages}>
      <CameraEventClip
        event={clipEvent as never}
        componentId="camera-event-clip"
        componentName="CameraEventClip"
      />
    </IntlProvider>,
  );

describe('CameraEventClip protected playback state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEmitProgress.current = false;
    (Platform as {OS: string}).OS = 'android';
    mockUseAppSelector.mockReturnValue(server);
    mockUseScreenPlaybackLifecycle.mockReturnValue({
      active: true,
      activationId: 0,
    });
  });

  it('shows localized loading and retryable error states', async () => {
    mockProtectedMediaUri
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce(
        'frigate-media://0123456789abcdef0123456789abcdef/vod/front-door/master.m3u8',
      );
    const view = renderClip(de, 'de');

    expect(
      view.getByLabelText('Geschützte Medien werden vorbereitet'),
    ).toBeTruthy();

    await waitFor(() => {
      expect(
        view.getByText(
          'Geschützte Medien konnten nicht abgespielt werden. Überprüfen Sie Ihre Verbindung und versuchen Sie es erneut.',
        ),
      ).toBeTruthy();
    });
    expect(
      view.getByLabelText('Geschützte Medien erneut versuchen'),
    ).toBeTruthy();
    expect(view.queryByText('Unable to play the protected media.')).toBeNull();

    fireEvent.press(view.getByTestId('protected-media-retry'));
    await waitFor(() => expect(view.getByTestId('media-player')).toBeTruthy());
    expect(mockProtectedMediaUri).toHaveBeenCalledTimes(2);
  });

  it('keeps the English fallback when no translation is supplied', async () => {
    mockProtectedMediaUri.mockRejectedValueOnce(
      new Error('Network unavailable'),
    );
    const view = renderClip(en);

    await waitFor(() =>
      expect(
        view.getByText(
          'Unable to play protected media. Check your connection and try again.',
        ),
      ).toBeTruthy(),
    );
    expect(view.getByLabelText('Retry protected media')).toBeTruthy();
  });

  it.each([
    ['light', '#f0f4f8', '#000000b8'],
    ['dark', '#30363d', '#000000cc'],
  ])('renders loading and errors with media colors in %s theme', async (
    scheme,
    highlighted,
    mediaOverlay,
  ) => {
    mockTheme = {
      background: scheme === 'light' ? '#ffffff' : '#121212',
      text: scheme === 'light' ? '#1f2933' : '#f5f7fa',
      overlay: scheme === 'light' ? '#00000066' : '#00000088',
      highlighted,
      mediaBackground: '#000000',
      mediaOverlay,
      mediaText: '#ffffff',
      surface: scheme === 'light' ? '#ffffff' : '#1e1e1e',
    };
    mockProtectedMediaUri.mockRejectedValueOnce(new Error('Network unavailable'));
    const view = renderClip(en);

    expect(view.getByTestId('event-player-loading-indicator').props.color).toBe(
      '#ffffff',
    );
    await waitFor(() => expect(view.getByTestId('protected-media-retry')).toBeTruthy());
    expect(
      view.getByText(
        'Unable to play protected media. Check your connection and try again.',
      ).props.style,
    ).toEqual(expect.objectContaining({color: '#ffffff'}));
  });

  it('puts localized share and save actions in the overflow menu', async () => {
    mockEmitProgress.current = true;
    mockProtectedMediaUri.mockResolvedValueOnce(
      'frigate-media://0123456789abcdef0123456789abcdef/vod/front-door/master.m3u8',
    );
    const view = renderClip(de, 'de');

    const moreButton = await view.findByTestId('event-player-overflow');
    fireEvent.press(moreButton);
    const shareButton = view.getByTestId('event-player-share');
    const menuStyle = StyleSheet.flatten(
      view.getByTestId('event-player-overflow-menu').props.style,
    );
    expect(menuStyle.left).toBeGreaterThanOrEqual(-40);
    expect(menuStyle.width).toBeLessThanOrEqual(280);

    expect(view.getByTestId('event-player-audio')).toBeTruthy();
    expect(view.getByTestId('event-player-overflow')).toBeTruthy();
    const audio = view.getByTestId('event-player-audio');
    expect(audio.props.accessibilityLabel).toBe('Audio einschalten');
    expect(audio.props.accessibilityState).toEqual({checked: false});
    expect(view.getByTestId('event-player-audio-slash')).toBeTruthy();
    expect(shareButton.props.accessibilityLabel).toBe('Clip teilen');
    expect(shareButton.props.accessibilityHint).toBe(
      'Teilt den Clip mit einer anderen App',
    );
    expect(view.getByTestId('event-player-download').props.accessibilityLabel).toBe(
      'Auf Gerät speichern',
    );
    expect(
      view.getAllByTestId('share-icon').every(icon => icon.props.accessible === false),
    ).toBe(true);

    fireEvent.press(shareButton);
    expect(view.queryByTestId('event-player-overflow-menu')).toBeNull();
  });

  it('localizes event player action labels and hints in German', async () => {
    mockEmitProgress.current = true;
    mockProtectedMediaUri.mockResolvedValueOnce(
      'frigate-media://0123456789abcdef0123456789abcdef/vod/front-door/master.m3u8',
    );
    const view = renderClip(de, 'de');

    const more = await view.findByTestId('event-player-overflow');
    expect(more.props.accessibilityLabel).toBe('Weitere Ereignisaktionen');
    expect(more.props.accessibilityHint).toBe(
      'Öffnet weitere Ereignisaktionen',
    );
    expect(
      view.getByTestId('event-player-scrim-toggle').props.accessibilityLabel,
    ).toBe('Player-Steuerelemente ein- oder ausblenden');
    expect(
      view.getByTestId('event-player-scrim-toggle').props.accessibilityHint,
    ).toBe('Blendet die Player-Steuerelemente ein oder aus');
    expect(view.queryByLabelText('More event actions')).toBeNull();
    expect(view.queryByLabelText('cameraEventClip.more')).toBeNull();

    fireEvent.press(more);
    const download = view.getByTestId('event-player-download');
    expect(download.props.accessibilityLabel).toBe(
      'Auf Gerät speichern',
    );
    expect(download.props.accessibilityHint).toBe(
      'Speichert eine Kopie des Clips auf diesem Gerät',
    );
  });

  it('starts muted and lets the icon-only control enable event audio', async () => {
    mockProtectedMediaUri.mockResolvedValueOnce(
      'frigate-media://0123456789abcdef0123456789abcdef/vod/front-door/master.m3u8',
    );
    const view = renderClip(en);
    await view.findByTestId('event-player-audio');

    expect(view.getByTestId('media-player').props.muted).toBe(true);
    expect(view.getByTestId('event-player-audio-slash')).toBeTruthy();

    fireEvent.press(view.getByTestId('event-player-audio'));

    expect(view.getByTestId('media-player').props.muted).toBe(false);
    expect(view.queryByTestId('event-player-audio-slash')).toBeNull();
  });

  it('re-mutes audio when playback is retried after an error', async () => {
    mockProtectedMediaUri.mockResolvedValue(
      'frigate-media://0123456789abcdef0123456789abcdef/vod/front-door/master.m3u8',
    );
    const view = renderClip(en);
    await view.findByTestId('event-player-audio');
    fireEvent.press(view.getByTestId('event-player-audio'));
    expect(view.getByTestId('media-player').props.muted).toBe(false);

    const mediaPlayerProps = mockMediaPlayerProps.mock.calls[
      mockMediaPlayerProps.mock.calls.length - 1
    ]?.[0] as Record<string, unknown>;
    (mediaPlayerProps.onError as () => void)();
    await waitFor(() =>
      expect(view.getByTestId('protected-media-retry')).toBeTruthy(),
    );
    fireEvent.press(view.getByTestId('protected-media-retry'));

    await waitFor(() => expect(view.getByTestId('media-player')).toBeTruthy());
    expect(view.getByTestId('media-player').props.muted).toBe(true);
  });

  it('re-mutes audio when the event media identity is replaced', async () => {
    mockProtectedMediaUri.mockResolvedValue(
      'frigate-media://0123456789abcdef0123456789abcdef/vod/front-door/master.m3u8',
    );
    const view = renderClip(en);
    await view.findByTestId('event-player-audio');
    fireEvent.press(view.getByTestId('event-player-audio'));
    expect(view.getByTestId('media-player').props.muted).toBe(false);

    view.rerender(
      <IntlProvider locale="en" messages={en}>
        <CameraEventClip
          event={{...event, id: 'event-replacement'} as never}
          componentId="camera-event-clip"
          componentName="CameraEventClip"
        />
      </IntlProvider>,
    );

    await waitFor(() => expect(mockProtectedMediaUri).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(view.getByTestId('media-player').props.muted).toBe(true),
    );
  });

  it('queues a changed preparation instead of running two concurrently', async () => {
    let resolveInitial!: (uri: string) => void;
    mockProtectedMediaUri
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveInitial = resolve;
          }),
      )
      .mockResolvedValueOnce(
        'frigate-media://0123456789abcdef0123456789abcdef/vod/front-door/master.m3u8',
      );
    const view = renderClip(en);
    await waitFor(() => expect(mockProtectedMediaUri).toHaveBeenCalledTimes(1));

    view.rerender(
      <IntlProvider locale="en" messages={en}>
        <CameraEventClip
          event={{...event, id: 'event-2'} as never}
          componentId="camera-event-clip"
          componentName="CameraEventClip"
        />
      </IntlProvider>,
    );
    expect(mockProtectedMediaUri).toHaveBeenCalledTimes(1);

    resolveInitial(
      'frigate-media://0123456789abcdef0123456789abcdef/vod/front-door/master.m3u8',
    );
    await waitFor(() => expect(mockProtectedMediaUri).toHaveBeenCalledTimes(2));
  });

  it('keeps playback paused after screen deactivation and reactivation', async () => {
    mockProtectedMediaUri.mockResolvedValue(
      'frigate-media://0123456789abcdef0123456789abcdef/vod/front-door/master.m3u8',
    );
    const lifecycle = {active: true, activationId: 0};
    mockUseScreenPlaybackLifecycle.mockImplementation(() => lifecycle);
    const view = renderClip(en);

    await view.findByTestId('media-player');
    expect(view.getByTestId('media-player').props.paused).toBe(false);

    lifecycle.active = false;
    lifecycle.activationId = 1;
    view.rerender(
      <IntlProvider locale="en" messages={en}>
        <CameraEventClip
          event={event as never}
          componentId="camera-event-clip"
          componentName="CameraEventClip"
        />
      </IntlProvider>,
    );
    expect(view.queryByTestId('media-player')).toBeNull();

    lifecycle.active = true;
    lifecycle.activationId = 2;
    view.rerender(
      <IntlProvider locale="en" messages={en}>
        <CameraEventClip
          event={event as never}
          componentId="camera-event-clip"
          componentName="CameraEventClip"
        />
      </IntlProvider>,
    );
    await waitFor(() =>
      expect(view.getByTestId('media-player').props.paused).toBe(true),
    );
  });
});
