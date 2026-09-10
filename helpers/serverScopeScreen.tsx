import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Navigation, NavigationFunctionComponent} from 'react-native-navigation';
import {selectServerScopeGeneration} from '../store/events';
import {store, useAppSelector} from '../store/store';
import {SecureLogger} from './secureLogger';

export interface ServerScopeScreenProps {
  ownerScopeGeneration?: number;
}

export const currentServerScopeGeneration = (): number =>
  selectServerScopeGeneration(store.getState());

export const isCurrentServerScope = (generation: number): boolean =>
  currentServerScopeGeneration() === generation;

/** Capture once: navigation updates must never transfer old IDs to a new server. */
export const useServerScopeOwner = (ownerScopeGeneration?: number) => {
  const [generation] = useState(
    () => ownerScopeGeneration ?? currentServerScopeGeneration(),
  );
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const isCurrentScope = useCallback(
    () => mounted.current && isCurrentServerScope(generation),
    [generation],
  );
  return {generation, isCurrentScope};
};

export const dismissServerScopeScreen = async (
  componentId: string,
  presentation: 'modal' | 'overlay' = 'modal',
): Promise<void> => {
  try {
    if (presentation === 'overlay') {
      await Navigation.dismissOverlay(componentId);
    } else {
      await Navigation.dismissModal(componentId);
    }
  } catch {
    // A manual/native dismissal may already have removed this exact screen.
    // Do not log native errors containing screen props or server metadata.
    SecureLogger.logError(
      new Error('Scoped screen dismissal failed'),
      'navigation.server-scope-dismiss',
    );
  }
};

export const withServerScopeScreen = <P extends ServerScopeScreenProps,>(
  Content: NavigationFunctionComponent<P>,
  presentation: 'modal' | 'overlay' = 'modal',
): NavigationFunctionComponent<P> => {
  const ScopedScreen: NavigationFunctionComponent<P> = props => {
    const {generation} = useServerScopeOwner(props.ownerScopeGeneration);
    const currentGeneration = useAppSelector(selectServerScopeGeneration);
    const valid = generation === currentGeneration;
    const dismissalStarted = useRef(false);
    useEffect(() => {
      if (!valid && !dismissalStarted.current) {
        dismissalStarted.current = true;
        void dismissServerScopeScreen(props.componentId, presentation);
      }
    }, [props.componentId, valid]);

    // A separate component boundary is essential: content hooks must not run
    // with the new server and an old camera/event, even for a single render.
    return valid ? <Content {...props} ownerScopeGeneration={generation} /> : null;
  };
  ScopedScreen.displayName = `ServerScope(${Content.displayName || Content.name})`;
  ScopedScreen.options = Content.options;
  return ScopedScreen;
};

/** For scoped CameraEvents modals whose list already supplies its render barrier. */
export const dismissModalWhenServerScopeChanges = (
  componentId: string,
  generation: number,
): void => {
  if (!isCurrentServerScope(generation)) {
    void dismissServerScopeScreen(componentId);
    return;
  }
  const dismissed = Navigation.events().registerModalDismissedListener(event => {
    if (event.componentId === componentId) {
      unsubscribe();
      dismissed.remove();
    }
  });
  const unsubscribe = store.subscribe(() => {
    if (!isCurrentServerScope(generation)) {
      unsubscribe();
      dismissed.remove();
      void dismissServerScopeScreen(componentId);
    }
  });
};
