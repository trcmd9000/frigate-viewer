import React, {useEffect} from 'react';
import {
  NavigationFunctionComponent,
  NavigationProps,
} from 'react-native-navigation';
import {PersistGate} from 'redux-persist/integration/react';
import {Provider} from 'react-redux';
import {persistor, store, initializeSecureStorage} from '../store/store';

export const withRedux =
  <P,>(
    Component: NavigationFunctionComponent<P>,
  ): NavigationFunctionComponent<P> =>
  (props: P & NavigationProps) => {
    useEffect(() => {
      // Initialize secure storage on app startup
      initializeSecureStorage();
    }, []);

    return (
      <Provider store={store}>
        <PersistGate persistor={persistor}>
          <Component {...props} />
        </PersistGate>
      </Provider>
    );
  };
