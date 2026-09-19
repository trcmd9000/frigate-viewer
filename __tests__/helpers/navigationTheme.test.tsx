import React from 'react';
import {act, render} from '@testing-library/react-native';
import {AppState, AppStateStatus, View} from 'react-native';

const mockAppStateListeners: Array<(nextState: AppStateStatus) => void> = [];

jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
  mockAppStateListeners.push(listener);
  return {remove: jest.fn()};
});

const mockCallbacks: {
  componentDidAppear?: () => void;
  componentDidDisappear?: () => void;
} = {};
const mockMergeOptions = jest.fn();
const mockApplyAndroidSystemBarSurface = jest.fn();
const mockRemoveListener = jest.fn();
let mockCurrentTheme = {background: '#fff', mediaBackground: '#000'};
let mockCurrentScheme: 'light' | 'dark' = 'light';
let mockOrientation: 'portrait' | 'landscape' = 'landscape';

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
    surface: 'app' | 'media' | 'event' = 'app',
    orientation: 'portrait' | 'landscape' = 'landscape',
  ) => ({
    layout: {
      fitSystemWindows: surface === 'app',
    },
    statusBar: {
      visible: surface === 'app' || orientation === 'portrait',
      drawBehind: surface !== 'app',
    },
    navigationBar: {
      backgroundColor:
        surface === 'app' ? theme.background : theme.mediaBackground,
      visible: surface === 'app',
    },
  }),
}));
jest.mock('../../helpers/screen', () => ({
  useOrientation: () => ({orientation: mockOrientation}),
}));
jest.mock('../../helpers/systemBars', () => ({
  applyAndroidSystemBarSurface: mockApplyAndroidSystemBarSurface,
}));

const {navigationSurfaceForComponent, withNavigationTheme} =
  require('../../helpers/navigationTheme') as typeof import('../../helpers/navigationTheme');

const Screen = withNavigationTheme(() => <View />);

describe('withNavigationTheme', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppStateListeners.length = 0;
    delete mockCallbacks.componentDidAppear;
    delete mockCallbacks.componentDidDisappear;
    mockCurrentTheme = {background: '#fff', mediaBackground: '#000'};
    mockCurrentScheme = 'light';
    mockOrientation = 'landscape';
  });

  it('uses immersive chrome for both playback surfaces', () => {
    expect(navigationSurfaceForComponent('CameraEventClip')).toBe('event');
    expect(navigationSurfaceForComponent('CameraPreview')).toBe('media');
    expect(navigationSurfaceForComponent('Settings')).toBe('app');
  });

  it('merges portrait safe-area behavior and restores immersive chrome after rotation', () => {
    const view = render(
      <Screen componentId="rotating-player" componentName="CameraPreview" />,
    );

    act(() => mockCallbacks.componentDidAppear?.());
    expect(mockMergeOptions).toHaveBeenLastCalledWith(
      'rotating-player',
      expect.objectContaining({
        layout: {fitSystemWindows: false},
        statusBar: {visible: false, drawBehind: true},
        navigationBar: {backgroundColor: '#000', visible: false},
      }),
    );
    expect(mockApplyAndroidSystemBarSurface).toHaveBeenLastCalledWith(
      '#000',
      'light',
      true,
      false,
      true,
    );

    act(() => {
      mockOrientation = 'portrait';
      view.rerender(
        <Screen
          componentId="rotating-player"
          componentName="CameraPreview"
        />,
      );
    });

    expect(mockMergeOptions).toHaveBeenLastCalledWith(
      'rotating-player',
      expect.objectContaining({
        layout: {fitSystemWindows: false},
        statusBar: {visible: true, drawBehind: true},
        navigationBar: {backgroundColor: '#000', visible: false},
      }),
    );

    act(() => {
      mockOrientation = 'landscape';
      view.rerender(
        <Screen
          componentId="rotating-player"
          componentName="CameraPreview"
        />,
      );
    });
    expect(mockMergeOptions).toHaveBeenLastCalledWith(
      'rotating-player',
      expect.objectContaining({
        layout: {fitSystemWindows: false},
        statusBar: {visible: false, drawBehind: true},
        navigationBar: {backgroundColor: '#000', visible: false},
      }),
    );
    view.unmount();
  });

  it('syncs light and dark app surfaces through the Android bridge', () => {
    const view = render(
      <Screen componentId="themed-app" componentName="Settings" />,
    );

    act(() => mockCallbacks.componentDidAppear?.());
    expect(mockApplyAndroidSystemBarSurface).toHaveBeenLastCalledWith(
      '#fff',
      'dark',
      false,
      true,
      false,
    );
    expect(
      mockMergeOptions.mock.invocationCallOrder[
        mockMergeOptions.mock.invocationCallOrder.length - 1
      ],
    ).toBeLessThan(
      mockApplyAndroidSystemBarSurface.mock.invocationCallOrder[
        mockApplyAndroidSystemBarSurface.mock.invocationCallOrder.length - 1
      ],
    );

    act(() => {
      mockCurrentTheme = {background: '#121212', mediaBackground: '#000'};
      mockCurrentScheme = 'dark';
      view.rerender(
        <Screen componentId="themed-app" componentName="Settings" />,
      );
    });
    expect(mockApplyAndroidSystemBarSurface).toHaveBeenLastCalledWith(
      '#121212',
      'light',
      false,
      true,
      false,
    );
    view.unmount();
  });

  it('uses a black surface and light icons for portrait media', () => {
    mockOrientation = 'portrait';
    const view = render(
      <Screen componentId="portrait-player" componentName="CameraPreview" />,
    );

    act(() => mockCallbacks.componentDidAppear?.());
    expect(mockApplyAndroidSystemBarSurface).toHaveBeenLastCalledWith(
      '#000',
      'light',
      false,
      false,
      true,
    );
    expect(mockMergeOptions).toHaveBeenLastCalledWith(
      'portrait-player',
      expect.objectContaining({
        layout: {fitSystemWindows: false},
        statusBar: {visible: true, drawBehind: true},
        navigationBar: {backgroundColor: '#000', visible: false},
      }),
    );
    view.unmount();
  });

  it('applies media chrome while visible and restores the app surface on dismiss', () => {
    const view = render(
      <Screen componentId="event-player" componentName="CameraEventClip" />,
    );

    act(() => mockCallbacks.componentDidAppear?.());
    expect(mockMergeOptions).toHaveBeenLastCalledWith(
      'event-player',
      expect.objectContaining({
        statusBar: expect.objectContaining({visible: false}),
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
        statusBar: expect.objectContaining({visible: false}),
        navigationBar: {backgroundColor: '#000', visible: false},
      }),
    );

    act(() => mockCallbacks.componentDidDisappear?.());
    expect(mockMergeOptions).toHaveBeenLastCalledWith(
      'event-player',
      expect.objectContaining({
        statusBar: expect.objectContaining({visible: true}),
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
        statusBar: expect.objectContaining({visible: true, drawBehind: false}),
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
        statusBar: expect.objectContaining({visible: false}),
        navigationBar: {backgroundColor: '#000', visible: false},
      }),
    );

    act(() => mockCallbacks.componentDidDisappear?.());
    expect(mockMergeOptions).toHaveBeenLastCalledWith(
      'repeated-player',
      expect.objectContaining({
        statusBar: expect.objectContaining({visible: true}),
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
        statusBar: expect.objectContaining({visible: false}),
        navigationBar: {backgroundColor: '#000', visible: false},
      }),
    );

    view.unmount();
    expect(mockMergeOptions).toHaveBeenLastCalledWith(
      'unmounted-player',
      expect.objectContaining({
        statusBar: expect.objectContaining({visible: true}),
        navigationBar: {backgroundColor: '#121212', visible: true},
      }),
    );
  });

  it('restores chrome in background and reapplies immersive chrome on foreground', () => {
    const view = render(
      <Screen componentId="foreground-event" componentName="CameraEventClip" />,
    );
    act(() => mockCallbacks.componentDidAppear?.());
    act(() => mockAppStateListeners[0]?.('background'));
    expect(mockMergeOptions).toHaveBeenLastCalledWith(
      'foreground-event',
      expect.objectContaining({
        statusBar: expect.objectContaining({visible: true}),
        navigationBar: {backgroundColor: '#fff', visible: true},
      }),
    );

    act(() => mockAppStateListeners[0]?.('active'));
    expect(mockMergeOptions).toHaveBeenLastCalledWith(
      'foreground-event',
      expect.objectContaining({
        statusBar: expect.objectContaining({visible: false}),
        navigationBar: {backgroundColor: '#000', visible: false},
      }),
    );

    view.unmount();
  });

  it('does not let a disappeared event re-hide bars after returning to the app', () => {
    const view = render(
      <Screen componentId="stale-event" componentName="CameraEventClip" />,
    );
    act(() => mockCallbacks.componentDidAppear?.());
    act(() => mockCallbacks.componentDidDisappear?.());
    mockMergeOptions.mockClear();

    act(() => {
      mockCurrentTheme = {background: '#121212', mediaBackground: '#000'};
      mockCurrentScheme = 'dark';
      view.rerender(
        <Screen componentId="stale-event" componentName="CameraEventClip" />,
      );
    });
    expect(mockMergeOptions).not.toHaveBeenCalled();
  });
});
