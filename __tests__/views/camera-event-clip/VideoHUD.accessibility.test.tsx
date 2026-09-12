import React from 'react';
import {render} from '@testing-library/react-native';
import {IntlProvider} from 'react-intl';
import {View} from 'react-native';
import de from '../../../i18n/de';
import {VideoHUD} from '../../../views/camera-event-clip/VideoHUD';

jest.mock('../../../helpers/colors', () => ({
  useStyles: (fn: (value: unknown) => unknown) =>
    fn({theme: {textInverse: '#fff'}}),
  useTheme: () => ({textInverse: '#fff'}),
}));

jest.mock('react-native-reanimated', () => {
  const ReactModule = require('react');
  const NativeView = require('react-native').View;
  return {
    __esModule: true,
    default: {View: NativeView},
    LightSpeedInLeft: undefined,
    LightSpeedInRight: undefined,
    withDelay: () => undefined,
    withSequence: () => undefined,
    withSpring: () => undefined,
    withTiming: () => undefined,
    createAnimatedComponent: (component: unknown) => component,
    __mockReact: ReactModule,
  };
});

jest.mock('react-native-gesture-handler', () => {
  const ReactModule = require('react');
  const makeGesture = () => {
    const gesture = {
      runOnJS: () => gesture,
      onEnd: () => gesture,
      onStart: () => gesture,
      onUpdate: () => gesture,
      minDistance: () => gesture,
    };
    return gesture;
  };
  return {
    Gesture: {
      Tap: makeGesture,
      Pan: makeGesture,
      Exclusive: () => ({}),
    },
    GestureDetector: ({children}: {children: React.ReactNode}) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
  };
});

jest.mock('@ant-design/icons-react-native', () => ({
  IconOutline: () => null,
}));

describe('VideoHUD accessibility', () => {
  it('localizes state-dependent play controls in German', () => {
    const view = render(
      <IntlProvider locale="de" messages={de}>
        <VideoHUD paused onPaused={jest.fn()}>
          <View />
        </VideoHUD>
      </IntlProvider>,
    );

    expect(
      view.getByRole('button', {name: 'Video abspielen'}).props
        .accessibilityHint,
    ).toBe('Startet die Videowiedergabe');
    expect(view.queryByLabelText('Play video')).toBeNull();

    view.rerender(
      <IntlProvider locale="de" messages={de}>
        <VideoHUD paused={false} ended onPaused={jest.fn()}>
          <View />
        </VideoHUD>
      </IntlProvider>,
    );
    expect(
      view.getByRole('button', {name: 'Video erneut abspielen'}),
    ).toBeTruthy();
  });

  it('uses English defaults when a translation is unavailable', () => {
    const view = render(
      <IntlProvider locale="de" messages={{}} onError={() => undefined}>
        <VideoHUD paused onPaused={jest.fn()}>
          <View />
        </VideoHUD>
      </IntlProvider>,
    );

    expect(view.getByRole('button', {name: 'Play video'})).toBeTruthy();
  });
});
