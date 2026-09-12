import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {AppState, AppStateStatus} from 'react-native';
import {Navigation} from 'react-native-navigation';

export interface PlaybackLifecycleState {
  active: boolean;
  activationId: number;
}

const PlaybackLifecycleContext = createContext<PlaybackLifecycleState>({
  active: false,
  activationId: 0,
});

export const usePlaybackLifecycle = (
  componentId: string,
  onDeactivate?: () => void,
): PlaybackLifecycleState => {
  // RNN may mount a retained screen before it is actually visible. Wait for
  // componentDidAppear before allowing native media resources to be created.
  const screenVisible = useRef(false);
  const appActive = useRef(AppState.currentState === 'active');
  const activeRef = useRef(false);
  const onDeactivateRef = useRef(onDeactivate);
  const [state, setState] = useState<PlaybackLifecycleState>({
    active: false,
    activationId: 0,
  });

  useEffect(() => {
    onDeactivateRef.current = onDeactivate;
  }, [onDeactivate]);

  useEffect(() => {
    const updateActive = (
      nextScreenVisible: boolean,
      nextAppState: AppStateStatus,
    ) => {
      const wasActive = activeRef.current;
      screenVisible.current = nextScreenVisible;
      appActive.current = nextAppState === 'active';
      const isActive = screenVisible.current && appActive.current;
      activeRef.current = isActive;
      if (wasActive && !isActive) {
        onDeactivateRef.current?.();
      }
      setState(previous => ({
        active: isActive,
        activationId:
          wasActive && !isActive
            ? previous.activationId + 1
            : previous.activationId,
      }));
    };

    const navigationListener = Navigation.events().registerComponentListener(
      {
        componentDidAppear() {
          updateActive(true, AppState.currentState);
        },
        componentDidDisappear() {
          updateActive(false, AppState.currentState);
        },
      },
      componentId,
    );
    const appStateListener = AppState.addEventListener('change', nextState => {
      updateActive(screenVisible.current, nextState);
    });

    return () => {
      navigationListener.remove();
      appStateListener.remove();
      activeRef.current = false;
    };
  }, [componentId]);

  return state;
};

export const PlaybackLifecycleProvider = ({
  componentId,
  children,
}: {
  componentId: string;
  children: ReactNode;
}) => {
  const lifecycle = usePlaybackLifecycle(componentId);
  return (
    <PlaybackLifecycleContext.Provider value={lifecycle}>
      {children}
    </PlaybackLifecycleContext.Provider>
  );
};

export const useScreenPlaybackLifecycle = (): PlaybackLifecycleState =>
  useContext(PlaybackLifecycleContext);
