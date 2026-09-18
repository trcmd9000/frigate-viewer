import {NativeModules, Platform} from 'react-native';

export type StatusBarStyle = 'light' | 'dark';

interface SystemBarsModule {
  setSystemBarSurface: (
    backgroundColor: string,
    statusBarStyle: StatusBarStyle,
  ) => void;
}

export const applyAndroidSystemBarSurface = (
  backgroundColor: string,
  statusBarStyle: StatusBarStyle,
): void => {
  if (Platform.OS !== 'android') {
    return;
  }

  const module = NativeModules.SystemBarsModule as
    | SystemBarsModule
    | undefined;
  module?.setSystemBarSurface(backgroundColor, statusBarStyle);
};
