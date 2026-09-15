import {NativeModules, Platform} from 'react-native';

interface NativeOssLicensesModule {
  open(title: string): Promise<void>;
}

export const openAndroidOssLicenses = (title: string): Promise<void> => {
  if (Platform.OS !== 'android') {
    return Promise.resolve();
  }
  const module = NativeModules.OssLicensesModule as
    | NativeOssLicensesModule
    | undefined;
  if (!module?.open) {
    return Promise.reject(
      new Error('Android open-source license center is unavailable.'),
    );
  }
  return module.open(title);
};
