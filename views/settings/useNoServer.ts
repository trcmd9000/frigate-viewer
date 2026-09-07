import {useCallback, useEffect, useRef} from 'react';
import {useIntl} from 'react-intl';
import {ToastAndroid} from 'react-native';
import {useAppSelector} from '../../store/store';
import {messages} from './messages';
import {selectServer} from '../../store/settings';
import {presentSettingsModal} from '../../helpers/navigationShell';
import {Navigation} from 'react-native-navigation';
import {SecureLogger} from '../../helpers/secureLogger';

export const useNoServer = (componentId?: string) => {
  const server = useAppSelector(selectServer);
  const intl = useIntl();
  const focused = useRef(true);
  const promptInFlight = useRef(false);
  const dismissedWhileFocused = useRef(false);

  const prompt = useCallback(() => {
    if (
      server.host ||
      !focused.current ||
      promptInFlight.current ||
      dismissedWhileFocused.current
    ) {
      return;
    }

    promptInFlight.current = true;
    void presentSettingsModal()
      .catch(error => {
        SecureLogger.logError(
          error instanceof Error ? error : new Error(String(error)),
          'navigation.no-server-settings',
        );
        dismissedWhileFocused.current = true;
      })
      .finally(() => {
        promptInFlight.current = false;
      });
    ToastAndroid.showWithGravity(
      intl.formatMessage(messages['toast.noServerData']),
      ToastAndroid.LONG,
      ToastAndroid.TOP,
    );
  }, [intl, server.host]);

  useEffect(() => {
    if (!componentId) {
      prompt();
      return undefined;
    }

    const listener = Navigation.events().registerComponentListener(
      {
        componentDidAppear() {
          if (focused.current) {
            return;
          }
          focused.current = true;
          dismissedWhileFocused.current = false;
          prompt();
        },
        componentDidDisappear() {
          focused.current = false;
        },
      },
      componentId,
    );
    prompt();
    return () => listener.remove();
  }, [componentId, prompt]);

  useEffect(() => {
    if (server.host) {
      dismissedWhileFocused.current = false;
    }
  }, [server.host]);

  useEffect(() => {
    const listener = Navigation.events().registerModalDismissedListener(
      ({componentName}) => {
        if (componentName === 'Settings') {
          dismissedWhileFocused.current = true;
          promptInFlight.current = false;
        }
      },
    );
    return () => listener.remove();
  }, []);
};
