import {act, renderHook} from '@testing-library/react-native';
import type {AppStateStatus} from 'react-native';

const mockNavigationCallbacks: {
  componentDidAppear?: () => void;
  componentDidDisappear?: () => void;
} = {};
let mockAppStateCallback:
  | ((nextState: AppStateStatus) => void)
  | undefined;
const mockNavigationRemove = jest.fn();
const mockAppStateRemove = jest.fn();
const mockAppState = {
  currentState: 'active' as AppStateStatus,
  addEventListener: jest.fn(
    (_event: string, callback: (nextState: AppStateStatus) => void) => {
      mockAppStateCallback = callback;
      return {remove: mockAppStateRemove};
    },
  ),
};

jest.mock('react-native-navigation', () => ({
  Navigation: {
    events: () => ({
      registerComponentListener: (
        callbacks: typeof mockNavigationCallbacks,
        _componentId: string,
      ) => {
        Object.assign(mockNavigationCallbacks, callbacks);
        return {remove: mockNavigationRemove};
      },
    }),
  },
}));

jest.mock('react-native/Libraries/AppState/AppState', () => mockAppState);

const {
  usePlaybackLifecycle,
} = require('../../helpers/playbackLifecycle') as typeof import('../../helpers/playbackLifecycle');

describe('usePlaybackLifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState.currentState = 'active';
    mockAppStateCallback = undefined;
    delete mockNavigationCallbacks.componentDidAppear;
    delete mockNavigationCallbacks.componentDidDisappear;
  });

  it('deactivates on navigation and requires an explicit active transition', () => {
    const onDeactivate = jest.fn();
    const {result} = renderHook(() =>
      usePlaybackLifecycle('clip-screen', onDeactivate),
    );

    expect(result.current).toEqual({active: false, activationId: 0});
    act(() => mockNavigationCallbacks.componentDidAppear?.());
    expect(result.current).toEqual({active: true, activationId: 0});
    act(() => mockNavigationCallbacks.componentDidDisappear?.());
    expect(result.current).toEqual({active: false, activationId: 1});
    expect(onDeactivate).toHaveBeenCalledTimes(1);

    act(() => mockNavigationCallbacks.componentDidAppear?.());
    expect(result.current).toEqual({active: true, activationId: 1});
    expect(onDeactivate).toHaveBeenCalledTimes(1);
  });

  it('stays inactive in the background and cleans up subscriptions', () => {
    const onDeactivate = jest.fn();
    const {result, unmount} = renderHook(() =>
      usePlaybackLifecycle('clip-screen', onDeactivate),
    );

    act(() => mockNavigationCallbacks.componentDidAppear?.());
    expect(result.current).toEqual({active: true, activationId: 0});
    act(() => {
      mockAppState.currentState = 'background';
      mockAppStateCallback?.('background');
    });
    expect(result.current).toEqual({active: false, activationId: 1});
    expect(onDeactivate).toHaveBeenCalledTimes(1);

    act(() => mockNavigationCallbacks.componentDidDisappear?.());
    expect(onDeactivate).toHaveBeenCalledTimes(1);

    unmount();
    expect(mockNavigationRemove).toHaveBeenCalledTimes(1);
    expect(mockAppStateRemove).toHaveBeenCalledTimes(1);
    expect(onDeactivate).toHaveBeenCalledTimes(1);
  });

});
