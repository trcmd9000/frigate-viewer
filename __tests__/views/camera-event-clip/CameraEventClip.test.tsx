import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {Navigation} from 'react-native-navigation';
import Share from 'react-native-share';
import {downloadMedia, releaseDownloadedMedia, retainDownloadedMedia} from '../../../helpers/mediaDownload';
import {IntlProvider} from 'react-intl';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
} from 'react-native';
import en from '../../../i18n/en';
import de from '../../../i18n/de';
import {CameraEventClip} from '../../../views/camera-event-clip/CameraEventClip';

const mockProtectedMediaUri = jest.fn();
const mockUseAppSelector = jest.fn();
const mockUseScreenPlaybackLifecycle = jest.fn();
const mockMediaPlayerProps = jest.fn();
const mockProgressBarProps = jest.fn();
const mockPerformTransportHaptic = jest.fn();
const mockEmitProgress = {current: false};
let mockGeneration = 0;
const mockPlayerCleanup = jest.fn();
const lucideIconWithName = (view: ReturnType<typeof render>, name: string) =>
  view.getAllByTestId('lucide-icon').find(
    icon => icon.props.accessibilityLabel === name,
  );
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
  store: {getState: () => ({events: {scopeGeneration: mockGeneration}})},
  useAppSelector: (selector: unknown) =>
    selector === require('../../../store/events').selectServerScopeGeneration
      ? mockGeneration
      : mockUseAppSelector(),
}));

jest.mock('react-native-navigation', () => ({
  Navigation: {
    constantsSync: jest.fn(() => ({
      statusBarHeight: 24,
      bottomTabsHeight: 0,
      topBarHeight: 0,
      backButtonId: '',
    })),
    dismissModal: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../../../store/settings', () => ({
  selectServer: jest.fn(),
}));

jest.mock('../../../helpers/playbackLifecycle', () => ({
  useScreenPlaybackLifecycle: () => mockUseScreenPlaybackLifecycle(),
}));

jest.mock('../../../helpers/protectedMedia', () => ({
  eventVodPath: jest.fn(
    (eventId: string) => `/vod/event/${encodeURIComponent(eventId)}/master.m3u8`,
  ),
  eventClipPath: jest.fn(
    (eventId: string) => `/api/events/${encodeURIComponent(eventId)}/clip.mp4`,
  ),
  protectedMediaUri: (...args: unknown[]) => mockProtectedMediaUri(...args),
}));

jest.mock('../../../components/media/Media3MediaPlayer', () => ({
  ['Media3MediaPlayer']: (props: Record<string, unknown>) => {
    const ReactModule = require('react');
    const {View: NativeView} = require('react-native');
    mockMediaPlayerProps(props);
    ReactModule.useEffect(() => {
      return () => mockPlayerCleanup();
    }, []);
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
  ['ProgressBar']: (props: Record<string, unknown>) => {
    const ReactModule = require('react');
    const {View: NativeView} = require('react-native');
    mockProgressBarProps(props);
    return ReactModule.createElement(NativeView, {
      testID: 'mock-progress-bar',
    });
  },
}));

jest.mock('../../../helpers/playerFeedback', () => {
  const actual = jest.requireActual('../../../helpers/playerFeedback');
  return {
    ...actual,
    performTransportHaptic: () => mockPerformTransportHaptic(),
  };
});

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
  has_clip: false,
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
    mockGeneration = 0;
    (releaseDownloadedMedia as jest.Mock).mockResolvedValue(undefined);
    mockEmitProgress.current = false;
    (Platform as {OS: string}).OS = 'android';
    mockUseAppSelector.mockReturnValue(server);
    mockUseScreenPlaybackLifecycle.mockReturnValue({
      active: true,
      activationId: 0,
    });
    jest
      .spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
      .mockResolvedValue(false);
  });

  const clipElement = (ownerScopeGeneration = 0) => (
    <IntlProvider locale="en" messages={en}>
      <CameraEventClip event={event as never} componentId="camera-event-clip"
        componentName="CameraEventClip" ownerScopeGeneration={ownerScopeGeneration} />
    </IntlProvider>
  );

  it(
    'preserves playback in scope, then unmounts the player without preparing on the new server',
    async () => {
      mockProtectedMediaUri.mockResolvedValue(
        'frigate-media://test/vod/master.m3u8',
      );
      const view = render(clipElement());
      await view.findByTestId('media-player');
      view.rerender(clipElement());
      expect(mockPlayerCleanup).not.toHaveBeenCalled();
      expect(mockProtectedMediaUri).toHaveBeenCalledTimes(1);
      mockGeneration = 1;
      view.rerender(clipElement(1));
      expect(view.toJSON()).toBeNull();
      expect(mockPlayerCleanup).toHaveBeenCalledTimes(1);
      expect(mockProtectedMediaUri).toHaveBeenCalledTimes(1);
      expect(Navigation.dismissModal).toHaveBeenCalledWith('camera-event-clip');
    },
    30000,
  );

  it('uses the documented event MP4 path for generated Android clips', async () => {
    const view = renderClip(en, 'en', {...event, has_clip: true});
    await waitFor(() => expect(view.getByTestId('media-player')).toBeTruthy());

    expect(mockProtectedMediaUri).toHaveBeenCalledWith(
      server,
      '/api/events/event-1/clip.mp4',
    );
    expect(mockProtectedMediaUri).toHaveBeenCalledTimes(1);
    expect(downloadMedia).not.toHaveBeenCalled();
    expect(mockMediaPlayerProps).toHaveBeenCalledWith(
      expect.objectContaining({
        media: expect.objectContaining({
          mimeType: 'video/mp4',
          mode: 'direct',
        }),
      }),
    );
  });

  it('uses the documented event VOD path when no generated clip exists', async () => {
    const view = renderClip(en, 'en', {...event, has_clip: false});
    await waitFor(() => expect(view.getByTestId('media-player')).toBeTruthy());

    expect(mockProtectedMediaUri).toHaveBeenCalledWith(
      server,
      '/vod/event/event-1/master.m3u8',
    );
    expect(mockProtectedMediaUri).toHaveBeenCalledTimes(1);
    expect(downloadMedia).not.toHaveBeenCalled();
    expect(mockMediaPlayerProps).toHaveBeenCalledWith(
      expect.objectContaining({
        media: expect.objectContaining({
          mimeType: 'application/x-mpegURL',
          mode: 'direct',
        }),
      }),
    );
  });

  it('aggregates repeated seek feedback and resets when direction changes', async () => {
    mockEmitProgress.current = true;
    mockProtectedMediaUri.mockResolvedValueOnce(
      'frigate-media://0123456789abcdef0123456789abcdef/vod/front-door/master.m3u8',
    );
    const view = renderClip(en);
    await view.findByTestId('mock-progress-bar');
    const transportAction = mockProgressBarProps.mock.lastCall[0]
      .onTransportAction as (action: string) => void;

    act(() => {
      transportAction('seekForward');
      transportAction('seekForward');
    });
    expect(view.getByText('+20', {includeHiddenElements: true})).toBeTruthy();

    act(() => {
      transportAction('seekBackward');
    });
    expect(view.getByText('-10', {includeHiddenElements: true})).toBeTruthy();
    expect(mockPerformTransportHaptic).toHaveBeenCalledTimes(3);
  });

  it('shows a safe-inset 48dp close control and dismisses the modal', async () => {
    mockProtectedMediaUri.mockResolvedValueOnce(
      'frigate-media://0123456789abcdef0123456789abcdef/vod/front-door/master.m3u8',
    );
    const view = renderClip(en);
    await view.findByTestId('media-player');
    const close = view.getByTestId('event-player-close');

    expect(close.props.style).toEqual(
      expect.objectContaining({minWidth: 48, minHeight: 48}),
    );
    expect(close.props.accessibilityLabel).toBe('Close player');
    expect(view.getByTestId('event-player-tools').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({top: 24})]),
    );
    fireEvent.press(close);
    expect(Navigation.dismissModal).toHaveBeenCalledWith('camera-event-clip');
  });

  it('auto-hides controls after inactivity and restores them on tap', async () => {
    jest.useFakeTimers();
    mockEmitProgress.current = true;
    mockProtectedMediaUri.mockResolvedValueOnce(
      'frigate-media://0123456789abcdef0123456789abcdef/vod/front-door/master.m3u8',
    );
    const view = renderClip(en);
    await view.findByTestId('event-player-audio');
    await act(async () => Promise.resolve());

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(view.queryByTestId('event-player-audio')).toBeNull();

    fireEvent.press(view.getByTestId('event-player-scrim-toggle'));
    expect(view.getByTestId('event-player-audio')).toBeTruthy();
    jest.useRealTimers();
  });

  it('does not auto-hide controls while a screen reader is enabled', async () => {
    jest.useFakeTimers();
    (
      AccessibilityInfo.isScreenReaderEnabled as jest.MockedFunction<
        typeof AccessibilityInfo.isScreenReaderEnabled
      >
    ).mockResolvedValue(true);
    mockEmitProgress.current = true;
    mockProtectedMediaUri.mockResolvedValueOnce(
      'frigate-media://0123456789abcdef0123456789abcdef/vod/front-door/master.m3u8',
    );
    const view = renderClip(en);
    await view.findByTestId('event-player-audio');
    await act(async () => Promise.resolve());

    act(() => {
      jest.advanceTimersByTime(6000);
    });
    expect(view.getByTestId('event-player-audio')).toBeTruthy();
    jest.useRealTimers();
  });

  it('keeps replay controls visible when playback ends', async () => {
    jest.useFakeTimers();
    mockEmitProgress.current = true;
    mockProtectedMediaUri.mockResolvedValueOnce(
      'frigate-media://0123456789abcdef0123456789abcdef/vod/front-door/master.m3u8',
    );
    const view = renderClip(en);
    await view.findByTestId('event-player-audio');
    await act(async () => Promise.resolve());

    const mediaPlayerProps = mockMediaPlayerProps.mock.calls[
      mockMediaPlayerProps.mock.calls.length - 1
    ]?.[0] as {onEnd: () => void};
    act(() => mediaPlayerProps.onEnd());
    act(() => {
      jest.advanceTimersByTime(6000);
    });

    expect(view.getByTestId('event-player-audio')).toBeTruthy();
    jest.useRealTimers();
  });

  it('downloads the documented event clip on non-Android playback', async () => {
    (Platform as {OS: string}).OS = 'ios';
    (downloadMedia as jest.Mock).mockResolvedValue('/cache/event-1.mp4');
    const view = renderClip(en, 'en', {...event, has_clip: true});

    await waitFor(() => expect(view.getByTestId('media-player')).toBeTruthy());

    expect(downloadMedia).toHaveBeenCalledWith(
      server,
      'https://frigate.example.test:443/api/events/event-1/clip.mp4',
    );
    expect(retainDownloadedMedia).toHaveBeenCalledWith(
      '/cache/event-1.mp4',
      'display',
    );
    expect(mockProtectedMediaUri).not.toHaveBeenCalled();
    expect(downloadMedia).toHaveBeenCalledTimes(1);
  });

  it('rejects a delayed old navigation mount before any content hooks run', () => {
    mockGeneration = 1;
    const view = render(clipElement(0));
    expect(view.toJSON()).toBeNull();
    expect(mockUseAppSelector).not.toHaveBeenCalled();
    expect(mockUseScreenPlaybackLifecycle).not.toHaveBeenCalled();
    expect(mockProtectedMediaUri).not.toHaveBeenCalled();
  });

  it('does not start queued preparation after the live store has switched', async () => {
    const view = render(clipElement());
    mockGeneration = 1;
    await act(async () => { await Promise.resolve(); });
    expect(mockProtectedMediaUri).not.toHaveBeenCalled();
    view.rerender(clipElement());
    expect(view.toJSON()).toBeNull();
  });

  it.each([false, true])('releases the local display lease once on scope unmount (late result: %s)', async late => {
    (Platform as {OS: string}).OS = 'ios';
    let resolveDownload!: (path: string) => void;
    (downloadMedia as jest.Mock).mockReturnValue(new Promise<string>(resolve => {
      resolveDownload = resolve;
    }));
    const view = render(clipElement());
    await act(async () => { await Promise.resolve(); });
    if (!late) {
      await act(async () => resolveDownload('/cache/scoped-clip.mp4'));
      expect(view.getByTestId('media-player')).toBeTruthy();
    }
    mockGeneration = 1;
    view.rerender(clipElement());
    if (late) {
      await act(async () => resolveDownload('/cache/scoped-clip.mp4'));
    }
    expect(view.toJSON()).toBeNull();
    expect(retainDownloadedMedia).toHaveBeenCalledWith('/cache/scoped-clip.mp4', 'display');
    expect(releaseDownloadedMedia).toHaveBeenCalledTimes(1);
    expect(releaseDownloadedMedia).toHaveBeenCalledWith('/cache/scoped-clip.mp4', 'display');
    expect(downloadMedia).toHaveBeenCalledTimes(1);
  });

  it.each(['share', 'download'])('blocks stale %s callbacks and releases a pending share lease', async action => {
    mockEmitProgress.current = true;
    mockProtectedMediaUri.mockResolvedValue('frigate-media://test/vod/master.m3u8');
    let resolveDownload!: (path: string) => void;
    (downloadMedia as jest.Mock).mockReturnValue(new Promise<string>(resolve => {
      resolveDownload = resolve;
    }));
    const view = render(clipElement());
    fireEvent.press(await view.findByTestId('event-player-overflow'));
    const press = view.UNSAFE_getAllByType(Pressable).find(
      button => button.props.testID === `event-player-${action}`,
    )!.props.onPress;
    act(() => { void press(); });
    mockGeneration = 1;
    view.rerender(clipElement());
    await act(async () => resolveDownload('/cache/shared-clip.mp4'));
    expect(Share.open).not.toHaveBeenCalled();
    expect(retainDownloadedMedia).toHaveBeenCalledWith('/cache/shared-clip.mp4', 'share');
    expect(releaseDownloadedMedia).toHaveBeenCalledWith('/cache/shared-clip.mp4', 'share');
    await act(async () => press());
    expect(downloadMedia).toHaveBeenCalledTimes(1);
  });

  it('shows localized loading and retryable error states', async () => {
    mockProtectedMediaUri
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce(
        'frigate-media://0123456789abcdef0123456789abcdef/vod/front-door/master.m3u8',
      );
    const view = renderClip(de, 'de');

    expect(
      view.getByLabelText('Medien werden vorbereitet'),
    ).toBeTruthy();

    await waitFor(() => {
      expect(
        view.getByText(
          'Medien konnten nicht abgespielt werden. Überprüfen Sie Ihre Verbindung und versuchen Sie es erneut.',
        ),
      ).toBeTruthy();
    });
    expect(
      view.getByLabelText('Medien erneut versuchen'),
    ).toBeTruthy();
    expect(view.queryByText('Unable to play media.')).toBeNull();
    expect(mockProtectedMediaUri).toHaveBeenCalledTimes(1);

    fireEvent.press(view.getByTestId('protected-media-retry'));
    await waitFor(() => expect(view.getByTestId('media-player')).toBeTruthy());
    expect(mockProtectedMediaUri).toHaveBeenCalledTimes(2);
    expect(mockProtectedMediaUri).toHaveBeenNthCalledWith(
      1,
      server,
      '/vod/event/event-1/master.m3u8',
    );
    expect(mockProtectedMediaUri).toHaveBeenNthCalledWith(
      2,
      server,
      '/vod/event/event-1/master.m3u8',
    );
  });

  it('keeps the English fallback when no translation is supplied', async () => {
    mockProtectedMediaUri.mockRejectedValueOnce(
      new Error('Network unavailable'),
    );
    const view = renderClip(en);

    await waitFor(() =>
      expect(
        view.getByText(
          'Unable to play media. Check your connection and try again.',
        ),
      ).toBeTruthy(),
    );
    expect(view.getByLabelText('Retry media')).toBeTruthy();
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
        'Unable to play media. Check your connection and try again.',
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
    expect(lucideIconWithName(view, 'volume-x')).toBeTruthy();
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
    expect(lucideIconWithName(view, 'volume-x')).toBeTruthy();

    fireEvent.press(view.getByTestId('event-player-audio'));

    expect(view.getByTestId('media-player').props.muted).toBe(false);
    expect(lucideIconWithName(view, 'volume')).toBeTruthy();
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

  it('serializes a changed preparation instead of running two concurrently', async () => {
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
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
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
