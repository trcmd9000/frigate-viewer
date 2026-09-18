import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';
import {Navigation, NavigationFunctionComponent, NavigationProps} from 'react-native-navigation';
import {
  NavigationSurface,
  useAppColorScheme,
  useTheme,
  navigationThemeOptions,
} from './colors';
import {useOrientation} from './screen';

const MEDIA_COMPONENT_NAMES = new Set(['CameraEventClip', 'CameraPreview']);
const activeMediaComponentIds = new Set<string>();
const activeAppComponentIds = new Set<string>();

export const navigationSurfaceForComponent = (
  componentName: string | undefined,
): NavigationSurface =>
  componentName === 'CameraEventClip'
    ? 'event'
    : componentName && MEDIA_COMPONENT_NAMES.has(componentName)
    ? 'media'
    : 'app';

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
    const {orientation} = useOrientation();
    const [screenVisible, setScreenVisible] = useState(false);
    const screenVisibleRef = useRef(false);
    const themeRef = useRef(theme);
    const schemeRef = useRef(scheme);
    const orientationRef = useRef(orientation);
    themeRef.current = theme;
    schemeRef.current = scheme;
    orientationRef.current = orientation;

    const mergeOptions = useCallback(
      (
        surfaceToApply: NavigationSurface,
        targetComponentId = props.componentId,
      ) => {
        Navigation.mergeOptions(
          targetComponentId,
          navigationThemeOptions(
            themeRef.current,
            schemeRef.current,
            surfaceToApply,
            orientationRef.current,
          ),
        );
      },
      [props.componentId],
    );
    const restoreAppOptions = useCallback(() => {
      const targetComponentId =
        activeAppComponentIds.values().next().value ?? props.componentId;
      mergeOptions('app', targetComponentId);
    }, [mergeOptions, props.componentId]);

    useEffect(() => {
      const listener = Navigation.events().registerComponentListener(
        {
          componentDidAppear() {
            screenVisibleRef.current = true;
            setScreenVisible(true);
            if (surface !== 'app') {
              activeMediaComponentIds.add(props.componentId);
            } else {
              activeAppComponentIds.add(props.componentId);
            }
          },
          componentDidDisappear() {
            screenVisibleRef.current = false;
            setScreenVisible(false);
            if (surface !== 'app') {
              const wasActive = activeMediaComponentIds.delete(
                props.componentId,
              );
              if (wasActive && activeMediaComponentIds.size === 0) {
                restoreAppOptions();
              }
            } else {
              activeAppComponentIds.delete(props.componentId);
            }
          },
        },
        props.componentId,
      );

      return () => {
        listener.remove();
        screenVisibleRef.current = false;
        if (surface !== 'app') {
          const wasActive = activeMediaComponentIds.delete(props.componentId);
          if (wasActive && activeMediaComponentIds.size === 0) {
            restoreAppOptions();
          }
        } else {
          activeAppComponentIds.delete(props.componentId);
        }
      };
    }, [props.componentId, restoreAppOptions, surface]);

    useEffect(() => {
      const appStateListener = AppState.addEventListener('change', nextState => {
        if (!screenVisibleRef.current) {
          return;
        }
        if (nextState !== 'active') {
          if (
            surface !== 'app' &&
            activeMediaComponentIds.has(props.componentId)
          ) {
            restoreAppOptions();
          }
          return;
        }
        if (
          surface !== 'app' &&
          activeMediaComponentIds.has(props.componentId)
        ) {
          mergeOptions(surface);
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
      restoreAppOptions,
      screenVisible,
      surface,
    ]);

    useEffect(() => {
      if (!screenVisible) {
        return;
      }
      if (surface !== 'app') {
        if (!activeMediaComponentIds.has(props.componentId)) {
          return;
        }
        mergeOptions(surface);
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
      orientation,
    ]);

    return React.createElement(component, props);
  };
