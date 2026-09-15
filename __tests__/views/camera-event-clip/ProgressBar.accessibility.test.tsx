import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {IntlProvider} from 'react-intl';
import de from '../../../i18n/de';
import en from '../../../i18n/en';
import {ProgressBar} from '../../../views/camera-event-clip/ProgressBar';

let mockTheme = {
  text: '#1f2933',
  overlay: '#00000066',
  highlighted: '#f0f4f8',
  mediaOverlay: '#000000b8',
  mediaText: '#ffffff',
};

jest.mock('../../../helpers/colors', () => ({
  useStyles: (fn: (value: unknown) => unknown) =>
    fn({theme: mockTheme}),
  useTheme: () => mockTheme,
}));

jest.mock('@ant-design/icons-react-native', () => ({
  IconOutline: () => null,
}));

describe('event player controls', () => {
  const renderProgressBar = (
    messages: Record<string, string> = en,
    locale = 'en',
    props: Partial<React.ComponentProps<typeof ProgressBar>> = {},
  ) =>
    render(
      <IntlProvider locale={locale} messages={messages}>
        <ProgressBar
          paused
          currentTime={2}
          duration={10}
          onPausePress={jest.fn()}
          {...props}
        />
      </IntlProvider>,
    );

  it('exposes accessible transport controls and 48dp targets', () => {
    const onPausePress = jest.fn();
    const {getByTestId, getByRole} = render(
      <IntlProvider locale="en" messages={en}>
        <ProgressBar
          paused
          currentTime={2}
          duration={10}
          onPausePress={onPausePress}
        />
      </IntlProvider>,
    );

    const play = getByRole('button', {name: 'Play video'});
    expect(play.props.style.width).toBeGreaterThanOrEqual(48);
    expect(play.props.style.height).toBeGreaterThanOrEqual(48);
    expect(getByTestId('event-player-timeline').props.accessibilityRole).toBe(
      'adjustable',
    );
    expect(
      getByTestId('event-player-timeline').props.accessibilityValue,
    ).toEqual({
      min: 0,
      now: 2,
      max: 10,
      text: '0:02 of 0:10',
    });
    fireEvent.press(play);
    expect(onPausePress).toHaveBeenCalledWith(false);
  });

  it('adjusts the timeline by safe 10-second TalkBack actions', () => {
    const onSeek = jest.fn();
    const view = renderProgressBar(en, 'en', {
      currentTime: 4,
      duration: 12,
      onSeek,
    });

    const timeline = view.getByTestId('event-player-timeline');

    fireEvent(timeline, 'accessibilityAction', {
      nativeEvent: {actionName: 'increment'},
    });
    fireEvent(timeline, 'accessibilityAction', {
      nativeEvent: {actionName: 'decrement'},
    });

    expect(onSeek).toHaveBeenNthCalledWith(1, 12);
    expect(onSeek).toHaveBeenNthCalledWith(2, 0);
    expect(timeline.props.accessibilityActions).toEqual([
      {name: 'increment', label: 'Forward 10 seconds'},
      {name: 'decrement', label: 'Back 10 seconds'},
    ]);
  });

  it('reports feedback only for direct transport button actions', () => {
    const onTransportAction = jest.fn();
    const onPausePress = jest.fn();
    const onSkip = jest.fn();
    const view = renderProgressBar(en, 'en', {
      onPausePress,
      onSkip,
      onTransportAction,
    });

    fireEvent.press(view.getByTestId('event-player-play-toggle'));
    fireEvent.press(view.getByTestId('event-player-skip-backward'));
    fireEvent.press(view.getByTestId('event-player-skip-forward'));

    expect(onTransportAction.mock.calls).toEqual([
      ['play'],
      ['seekBackward'],
      ['seekForward'],
    ]);

    const timeline = view.getByTestId('event-player-timeline');
    fireEvent(timeline, 'layout', {
      nativeEvent: {layout: {width: 100}},
    });
    fireEvent(timeline, 'touchStart', {
      nativeEvent: {locationX: 20},
    });
    fireEvent(timeline, 'touchEnd');
    fireEvent(timeline, 'accessibilityAction', {
      nativeEvent: {actionName: 'increment'},
    });

    expect(onTransportAction).toHaveBeenCalledTimes(3);
  });

  it('disables no-op seek actions at media boundaries', () => {
    const onTransportAction = jest.fn();
    const atStart = renderProgressBar(en, 'en', {
      currentTime: 0,
      duration: 10,
      onTransportAction,
    });

    const backward = atStart.getByTestId('event-player-skip-backward');
    expect(backward.props.accessibilityState).toEqual({disabled: true});
    fireEvent.press(backward);
    expect(onTransportAction).not.toHaveBeenCalled();

    atStart.rerender(
      <IntlProvider locale="en" messages={en}>
        <ProgressBar
          paused
          currentTime={10}
          duration={10}
          onPausePress={jest.fn()}
          onTransportAction={onTransportAction}
        />
      </IntlProvider>,
    );

    const forward = atStart.getByTestId('event-player-skip-forward');
    expect(forward.props.accessibilityState).toEqual({disabled: true});
    fireEvent.press(forward);
    expect(onTransportAction).not.toHaveBeenCalled();
  });

  it('uses a separate full-width timeline row in portrait', () => {
    const view = renderProgressBar();

    expect(view.getByTestId('event-player-transport-row')).toBeTruthy();
    expect(view.getByTestId('event-player-timeline-row').props.style).toEqual(
      expect.objectContaining({
        flexDirection: 'row',
        minHeight: 48,
      }),
    );
  });

  it('applies bottom and horizontal system insets to the overlay', () => {
    const view = renderProgressBar(en, 'en', {
      bottomInset: 24,
      leftInset: 8,
      rightInset: 12,
    });

    expect(view.getByTestId('event-player-progress-bar').props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          paddingBottom: 32,
          paddingLeft: 12,
          paddingRight: 16,
        }),
      ]),
    );
  });

  it('renders German transport labels and hints without English fallbacks', () => {
    const view = renderProgressBar(de, 'de');

    expect(
      view.getByRole('button', {name: 'Video abspielen'}).props
        .accessibilityHint,
    ).toBe('Startet die Videowiedergabe');
    expect(
      view.getByRole('button', {name: '10 Sekunden zurück'}).props
        .accessibilityHint,
    ).toBe('Springt 10 Sekunden zurück');
    expect(
      view.getByRole('button', {name: '10 Sekunden vor'}).props
        .accessibilityHint,
    ).toBe('Springt 10 Sekunden vor');
    expect(
      view.getByTestId('event-player-timeline').props.accessibilityLabel,
    ).toBe('Videofortschritt');
    expect(
      view.getByTestId('event-player-timeline').props.accessibilityHint,
    ).toBe('Passt die Position im Video an');
    expect(view.queryByRole('button', {name: 'Play video'})).toBeNull();
    expect(
      view.queryByRole('button', {name: 'cameraEventClip.play'}),
    ).toBeNull();
  });

  it('uses localized pause and replay variants', () => {
    const {rerender, getByRole} = renderProgressBar(de, 'de', {
      paused: false,
    });
    expect(getByRole('button', {name: 'Video pausieren'})).toBeTruthy();

    rerender(
      <IntlProvider locale="de" messages={de}>
        <ProgressBar
          paused
          ended
          currentTime={10}
          duration={10}
          onPausePress={jest.fn()}
        />
      </IntlProvider>,
    );
    expect(getByRole('button', {name: 'Video erneut abspielen'})).toBeTruthy();
  });

  it.each([
    ['light', '#1f2933', '#00000066'],
    ['dark', '#f5f7fa', '#00000088'],
  ])('uses media contrast colors in %s theme', (scheme, text, overlay) => {
    mockTheme = {
      text,
      overlay,
      highlighted: scheme === 'light' ? '#f0f4f8' : '#30363d',
      mediaOverlay: scheme === 'light' ? '#000000b8' : '#000000cc',
      mediaText: '#ffffff',
    };
    const view = renderProgressBar();

    expect(
      view.getByTestId('event-player-track-background').props.style,
    ).toMatchObject({
      backgroundColor: '#ffffff',
      opacity: 0.45,
    });
    expect(view.getByTestId('event-player-progress').props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: '#ffffff',
          zIndex: 1,
        }),
      ]),
    );
    expect(view.getByRole('button', {name: 'Play video'}).props.style).toEqual(
      expect.objectContaining({width: 48, height: 48}),
    );
    const timeline = view.getByTestId('event-player-timeline');
    fireEvent(timeline, 'layout', {
      nativeEvent: {layout: {width: 100}},
    });
    fireEvent(timeline, 'touchStart', {
      nativeEvent: {locationX: 20},
    });
    expect(view.getByTestId('event-player-thumb').props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: '#ffffff',
          zIndex: 2,
        }),
      ]),
    );
  });
});
