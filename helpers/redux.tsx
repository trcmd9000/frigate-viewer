import React from 'react';
import {
  NavigationFunctionComponent,
  NavigationProps,
} from 'react-native-navigation';
import {Provider} from 'react-redux';
import {
  retrySecureStorageInitialization,
  initializeSecureStorage,
  store,
} from '../store/store';
import {selectLocaleRegion} from '../store/settings';
import {useAppSelector} from '../store/store';
import {SecureStorageGate} from './SecureStorageGate';
import {PlaybackLifecycleProvider} from './playbackLifecycle';
import {EntitlementsProvider} from './entitlements';

const ConnectedSecureStorageGate = (
  props: Omit<React.ComponentProps<typeof SecureStorageGate>, 'locale'>,
) => {
  const locale = useAppSelector(selectLocaleRegion);
  return <SecureStorageGate {...props} locale={locale} />;
};

export {SafeHydrationGate, SecureStorageGate} from './SecureStorageGate';

export const withRedux =
  <P,>(
    Component: NavigationFunctionComponent<P>,
  ): NavigationFunctionComponent<P> =>
  (props: P & NavigationProps) => {
    return (
    <EntitlementsProvider>
      <PlaybackLifecycleProvider componentId={props.componentId}>
        <Provider store={store}>
          <ConnectedSecureStorageGate
            initialize={initializeSecureStorage}
            retry={retrySecureStorageInitialization}
          >
            <Component {...props} />
          </ConnectedSecureStorageGate>
        </Provider>
      </PlaybackLifecycleProvider>
    </EntitlementsProvider>
  );
  };
