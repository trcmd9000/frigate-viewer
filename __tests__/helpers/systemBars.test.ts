import {NativeModules, Platform} from 'react-native';
import {applyAndroidSystemBarSurface} from '../../helpers/systemBars';

describe('Android system-bar surface bridge', () => {
  const initialPlatform = Platform.OS;
  const nativeModule = NativeModules.SystemBarsModule;

  afterEach(() => {
    (Platform as {OS: string}).OS = initialPlatform;
    NativeModules.SystemBarsModule = nativeModule;
  });

  it('syncs the root surface and icon contrast on Android', () => {
    const setSystemBarSurface = jest.fn();
    (Platform as {OS: string}).OS = 'android';
    NativeModules.SystemBarsModule = {setSystemBarSurface};

    applyAndroidSystemBarSurface('#ffffff', 'dark');

    expect(setSystemBarSurface).toHaveBeenCalledWith('#ffffff', 'dark');
  });

  it('does not call the native bridge on other platforms', () => {
    const setSystemBarSurface = jest.fn();
    (Platform as {OS: string}).OS = 'ios';
    NativeModules.SystemBarsModule = {setSystemBarSurface};

    applyAndroidSystemBarSurface('#000000', 'light');

    expect(setSystemBarSurface).not.toHaveBeenCalled();
  });

  it('tolerates an unavailable native module on Android', () => {
    (Platform as {OS: string}).OS = 'android';
    NativeModules.SystemBarsModule = undefined;

    expect(() =>
      applyAndroidSystemBarSurface('#121212', 'light'),
    ).not.toThrow();
  });
});
