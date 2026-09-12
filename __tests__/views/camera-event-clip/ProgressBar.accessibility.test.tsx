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
    fireEvent.press(play);
    expect(onPausePress).toHaveBeenCalledWith(false);
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
