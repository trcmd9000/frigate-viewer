import {useMemo} from 'react';
import {
  Platform,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import {Navigation} from 'react-native-navigation';
import {SecureLogger} from './secureLogger';

export const portraitMediaTopInset = (
  width: number,
  height: number,
  statusBarHeight: number,
  platform = Platform.OS,
): number =>
  platform === 'android' && width <= height
    ? Math.max(0, statusBarHeight)
    : 0;

export const usePortraitMediaTopInset = (): number => {
  const {width, height} = useWindowDimensions();

  return useMemo(() => {
    let navigationStatusBarHeight = 0;
    try {
      navigationStatusBarHeight =
        Navigation.constantsSync?.().statusBarHeight ?? 0;
    } catch (error) {
      SecureLogger.logError(
        error instanceof Error ? error : new Error(String(error)),
        'media-safe-area.status-bar-height',
      );
    }
    return portraitMediaTopInset(
      width,
      height,
      Math.max(
        navigationStatusBarHeight,
        StatusBar.currentHeight ?? 0,
      ),
    );
  }, [height, width]);
};
