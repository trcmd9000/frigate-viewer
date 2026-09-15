import React from 'react';
import {act, render} from '@testing-library/react-native';
import {AccessibilityInfo, Animated} from 'react-native';
import {PlaybackActionOverlay} from '../../../views/camera-event-clip/PlaybackActionOverlay';

const theme = {
  mediaOverlay: '#000000b8',
  mediaText: '#ffffff',
};

jest.mock('../../../helpers/colors', () => ({
  useStyles: (fn: (value: unknown) => unknown) => fn({theme}),
  useTheme: () => theme,
}));

jest.mock('@ant-design/icons-react-native', () => ({
  IconOutline: (props: Record<string, unknown>) => {
    const ReactModule = require('react');
    const {Text} = require('react-native');
    return ReactModule.createElement(Text, {
      ...props,
      testID: 'feedback-icon',
    });
  },
}));

describe('PlaybackActionOverlay', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('places signed seek feedback on the requested side with safe insets', () => {
    const view = render(
      <PlaybackActionOverlay
        feedback={{action: 'seekBackward', amount: -20, id: 1}}
        leftInset={8}
        rightInset={12}
        onHidden={jest.fn()}
      />,
    );

    expect(view.getByText('-20', {includeHiddenElements: true})).toBeTruthy();
    expect(
      view.getByTestId('event-player-action-overlay', {
        includeHiddenElements: true,
      }).props.style,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({paddingLeft: 28, paddingRight: 32}),
      ]),
    );
    expect(
      view.getByTestId('event-player-action-feedback', {
        includeHiddenElements: true,
      }).props.style,
    ).toEqual(expect.objectContaining({alignSelf: 'flex-start'}));
  });

  it('uses central action icons and hides feedback after the animation', () => {
    const onHidden = jest.fn();
    const view = render(
      <PlaybackActionOverlay
        feedback={{action: 'pause', id: 7}}
        onHidden={onHidden}
      />,
    );

    expect(
      view.getByTestId('feedback-icon', {includeHiddenElements: true}).props
        .name,
    ).toBe('pause');

    act(() => {
      jest.runAllTimers();
    });
    expect(onHidden).toHaveBeenCalledWith(7);
  });

  it('restarts animation when feedback changes', () => {
    const stopAnimation = jest.spyOn(Animated.Value.prototype, 'stopAnimation');
    const view = render(
      <PlaybackActionOverlay
        feedback={{action: 'seekForward', amount: 10, id: 1}}
        onHidden={jest.fn()}
      />,
    );

    view.rerender(
      <PlaybackActionOverlay
        feedback={{action: 'seekForward', amount: 20, id: 2}}
        onHidden={jest.fn()}
      />,
    );

    expect(view.getByText('+20', {includeHiddenElements: true})).toBeTruthy();
    expect(stopAnimation).toHaveBeenCalled();
  });
});
