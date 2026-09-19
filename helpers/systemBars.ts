import {NativeModules, Platform} from 'react-native';

export type StatusBarStyle = 'light' | 'dark';

interface SystemBarsModule {
  setSystemBarSurface: (
    backgroundColor: string,
    statusBarStyle: StatusBarStyle,
    immersive: boolean,
    navigationBarVisible: boolean,
    edgeToEdge: boolean,
  ) => void;
}

export const applyAndroidSystemBarSurface = (
  backgroundColor: string,
  statusBarStyle: StatusBarStyle,
  immersive = false,
  navigationBarVisible = true,
  edgeToEdge = false,
): void => {
  if (Platform.OS !== 'android') {
    return;
  }

  const module = NativeModules.SystemBarsModule as
    | SystemBarsModule
    | undefined;
  module?.setSystemBarSurface(
    backgroundColor,
    statusBarStyle,
    immersive,
    navigationBarVisible,
    edgeToEdge,
  );
};
