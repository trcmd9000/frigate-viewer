import {Platform} from 'react-native';
import {Navigation} from 'react-native-navigation';
import type {LayoutOrientation} from 'react-native-navigation';
import {SecureLogger} from './secureLogger';
import type {ScreenOrientation} from './screen';

const statusBarHeight = (): number => {
  if (Platform.OS !== 'android' || !Navigation.constantsSync) {
    return 0;
  }
  try {
    const value = Navigation.constantsSync().statusBarHeight;
    return typeof value === 'number' && value > 0 ? value : 0;
  } catch (error) {
    SecureLogger.logError(
      error instanceof Error ? error : new Error(String(error)),
      'navigation-policy.status-bar',
    );
    return 0;
  }
};

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
  const insetTop = android && portrait ? statusBarHeight() : 0;

  return {
    layout: {
      orientation: [
        (lockLandscape ? 'sensorLandscape' : 'sensor') as LayoutOrientation,
      ],
      backgroundColor: '#000000',
      fitSystemWindows: portrait,
      insets: {top: insetTop},
    },
    topBar: {visible: false},
    statusBar: {
      visible: !android || portrait,
      drawBehind: !android || !portrait,
      backgroundColor: '#000000',
      translucent: false,
    },
    navigationBar: {
      visible: false,
      backgroundColor: '#000000',
    },
  };
};
