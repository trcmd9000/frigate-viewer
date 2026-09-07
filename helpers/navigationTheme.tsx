import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';
import {Navigation, NavigationFunctionComponent, NavigationProps} from 'react-native-navigation';
import {
  NavigationSurface,
  useAppColorScheme,
  useTheme,
  navigationThemeOptions,
} from './colors';

const MEDIA_COMPONENT_NAMES = new Set(['CameraEventClip', 'CameraPreview']);
const activeMediaComponentIds = new Set<string>();

export const navigationSurfaceForComponent = (
  componentName: string | undefined,
): NavigationSurface =>
  componentName && MEDIA_COMPONENT_NAMES.has(componentName) ? 'media' : 'app';

/**
 * Keeps native navigation chrome synchronized with the selected app theme.
 * This is a decorator so it runs inside the Redux provider without changing
 * screen navigation or lifecycle behavior.
 */
export const withNavigationTheme =
  <P,>(
    component: NavigationFunctionComponent<P>,
  ): NavigationFunctionComponent<P> =>
  (props: P & NavigationProps) => {
    const theme = useTheme();
    const scheme = useAppColorScheme();
    const surface = navigationSurfaceForComponent(props.componentName);
    const [screenVisible, setScreenVisible] = useState(false);
    const themeRef = useRef(theme);
    const schemeRef = useRef(scheme);
    themeRef.current = theme;
    schemeRef.current = scheme;

    const mergeOptions = useCallback(
      (surfaceToApply: 'app' | 'media') => {
        Navigation.mergeOptions(
          props.componentId,
          navigationThemeOptions(
            themeRef.current,
            schemeRef.current,
            surfaceToApply,
          ),
        );
      },
      [props.componentId],
    );

    useEffect(() => {
      const listener = Navigation.events().registerComponentListener(
        {
          componentDidAppear() {
            setScreenVisible(true);
            if (surface === 'media') {
              activeMediaComponentIds.add(props.componentId);
            }
          },
          componentDidDisappear() {
            setScreenVisible(false);
            if (surface === 'media') {
              const wasActive = activeMediaComponentIds.delete(
                props.componentId,
              );
              if (wasActive && activeMediaComponentIds.size === 0) {
                mergeOptions('app');
              }
            }
          },
        },
        props.componentId,
      );

      return () => {
        listener.remove();
        if (surface === 'media') {
          const wasActive = activeMediaComponentIds.delete(props.componentId);
          if (wasActive && activeMediaComponentIds.size === 0) {
            mergeOptions('app');
          }
        }
      };
    }, [mergeOptions, props.componentId, surface]);

    useEffect(() => {
      const appStateListener = AppState.addEventListener('change', nextState => {
        if (nextState !== 'active' || !screenVisible) {
          return;
        }
        if (
          surface === 'media' &&
          activeMediaComponentIds.has(props.componentId)
        ) {
          mergeOptions('media');
        } else if (
          surface === 'app' &&
          activeMediaComponentIds.size === 0
        ) {
          mergeOptions('app');
        }
      });

      return () => appStateListener.remove();
    }, [
      mergeOptions,
      props.componentId,
      screenVisible,
      surface,
    ]);

    useEffect(() => {
      if (!screenVisible) {
        return;
      }
      if (surface === 'media') {
        if (!activeMediaComponentIds.has(props.componentId)) {
          return;
        }
        mergeOptions('media');
      } else if (activeMediaComponentIds.size === 0) {
        mergeOptions('app');
      }
    }, [
      mergeOptions,
      props.componentId,
      scheme,
      surface,
      screenVisible,
      theme,
    ]);

    return React.createElement(component, props);
  };
