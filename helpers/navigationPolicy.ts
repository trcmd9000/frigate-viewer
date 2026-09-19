import {Platform} from 'react-native';
import type {LayoutOrientation} from 'react-native-navigation';
import type {ScreenOrientation} from './screen';

/**
 * Options shared by media modals and the navigation-theme bridge.
 *
 * Android treats a visible, non-drawn-behind status bar as the content
 * inset. Media keeps the navigation bar hidden in both orientations, while
 * portrait opts into that status-bar inset and landscape remains immersive.
 */
export const mediaNavigationOptions = (
  orientation: ScreenOrientation,
  lockLandscape = false,
) => {
  const portrait = orientation === 'portrait';
  const android = Platform.OS === 'android';

  return {
    layout: {
      orientation: [
        (lockLandscape ? 'sensorLandscape' : 'sensor') as LayoutOrientation,
      ],
      backgroundColor: '#000000',
      componentBackgroundColor: '#000000',
      fitSystemWindows: false,
    },
    topBar: {visible: false},
    statusBar: {
      visible: !android || portrait,
      hideWithTopBar: false,
      drawBehind: true,
      backgroundColor: '#000000',
      style: 'light' as const,
      translucent: android,
    },
    navigationBar: {
      visible: false,
      backgroundColor: '#000000',
    },
  };
};
