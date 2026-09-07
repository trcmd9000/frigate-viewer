import React from 'react';
import {act, render} from '@testing-library/react-native';
import {View} from 'react-native';

const mockCallbacks: {
  componentDidAppear?: () => void;
  componentDidDisappear?: () => void;
} = {};
const mockMergeOptions = jest.fn();
const mockRemoveListener = jest.fn();
let mockCurrentTheme = {background: '#fff', mediaBackground: '#000'};
let mockCurrentScheme: 'light' | 'dark' = 'light';

jest.mock('react-native-navigation', () => ({
  Navigation: {
    events: () => ({
      registerComponentListener: (
        nextCallbacks: typeof mockCallbacks,
        _componentId: string,
      ) => {
        Object.assign(mockCallbacks, nextCallbacks);
        return {remove: mockRemoveListener};
      },
    }),
    mergeOptions: mockMergeOptions,
  },
}));

jest.mock('../../helpers/colors', () => ({
  useTheme: () => mockCurrentTheme,
  useAppColorScheme: () => mockCurrentScheme,
  navigationThemeOptions: (
    theme: typeof mockCurrentTheme,
    _scheme: typeof mockCurrentScheme,
    surface: 'app' | 'media' = 'app',
  ) => ({
    navigationBar: {
      backgroundColor:
        surface === 'media' ? theme.mediaBackground : theme.background,
      visible: surface !== 'media',
    },
  }),
}));

const {withNavigationTheme} =
  require('../../helpers/navigationTheme') as typeof import('../../helpers/navigationTheme');

const Screen = withNavigationTheme(() => <View />);

describe('withNavigationTheme', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete mockCallbacks.componentDidAppear;
    delete mockCallbacks.componentDidDisappear;
    mockCurrentTheme = {background: '#fff', mediaBackground: '#000'};
    mockCurrentScheme = 'light';
  });

  it('applies media chrome while visible and restores the app surface on dismiss', () => {
    const view = render(
      <Screen componentId="event-player" componentName="CameraEventClip" />,
    );

    act(() => mockCallbacks.componentDidAppear?.());
    expect(mockMergeOptions).toHaveBeenLastCalledWith(
      'event-player',
      expect.objectContaining({
        navigationBar: {backgroundColor: '#000', visible: false},
      }),
    );

    act(() => {
      mockCurrentTheme = {background: '#121212', mediaBackground: '#000'};
      mockCurrentScheme = 'dark';
      view.rerender(
        <Screen componentId="event-player" componentName="CameraEventClip" />,
      );
    });
    expect(mockMergeOptions).toHaveBeenLastCalledWith(
      'event-player',
      expect.objectContaining({
        navigationBar: {backgroundColor: '#000', visible: false},
      }),
    );

    act(() => mockCallbacks.componentDidDisappear?.());
    expect(mockMergeOptions).toHaveBeenLastCalledWith(
      'event-player',
      expect.objectContaining({
        navigationBar: {backgroundColor: '#121212', visible: true},
      }),
    );
  });

  it('uses the app surface for regular screens after media is dismissed', () => {
    const mediaView = render(
      <Screen componentId="live-preview" componentName="CameraPreview" />,
    );
    act(() => mockCallbacks.componentDidAppear?.());
    act(() => mockCallbacks.componentDidDisappear?.());
    mediaView.unmount();

    const regularView = render(
      <Screen componentId="settings" componentName="Settings" />,
    );
    act(() => mockCallbacks.componentDidAppear?.());
    expect(mockMergeOptions).toHaveBeenLastCalledWith(
      'settings',
      expect.objectContaining({
        navigationBar: {backgroundColor: '#fff', visible: true},
      }),
    );
    regularView.unmount();
  });

  it('restores the app bar after repeated media appearance and disappearance', () => {
    const view = render(
      <Screen componentId="repeated-player" componentName="CameraPreview" />,
    );

    act(() => mockCallbacks.componentDidAppear?.());
    act(() => mockCallbacks.componentDidDisappear?.());
    act(() => mockCallbacks.componentDidAppear?.());
    expect(mockMergeOptions).toHaveBeenLastCalledWith(
      'repeated-player',
      expect.objectContaining({
        navigationBar: {backgroundColor: '#000', visible: false},
      }),
    );

    act(() => mockCallbacks.componentDidDisappear?.());
    expect(mockMergeOptions).toHaveBeenLastCalledWith(
      'repeated-player',
      expect.objectContaining({
        navigationBar: {backgroundColor: '#fff', visible: true},
      }),
    );
    view.unmount();
  });

  it('restores the latest themed app bar when media unmounts without disappearing', () => {
    const view = render(
      <Screen componentId="unmounted-player" componentName="CameraEventClip" />,
    );
    act(() => mockCallbacks.componentDidAppear?.());

    act(() => {
      mockCurrentTheme = {background: '#121212', mediaBackground: '#000'};
      mockCurrentScheme = 'dark';
      view.rerender(
        <Screen
          componentId="unmounted-player"
          componentName="CameraEventClip"
        />,
      );
    });
    expect(mockMergeOptions).toHaveBeenLastCalledWith(
      'unmounted-player',
      expect.objectContaining({
        navigationBar: {backgroundColor: '#000', visible: false},
      }),
    );

    view.unmount();
    expect(mockMergeOptions).toHaveBeenLastCalledWith(
      'unmounted-player',
      expect.objectContaining({
        navigationBar: {backgroundColor: '#121212', visible: true},
      }),
    );
  });
});
