import {useCallback, useEffect, useRef} from 'react';
import {useIntl} from 'react-intl';
import {ToastAndroid} from 'react-native';
import {useAppSelector} from '../../store/store';
import {messages} from './messages';
import {selectServer} from '../../store/settings';
import {Navigation} from 'react-native-navigation';
import {SecureLogger} from '../../helpers/secureLogger';
import {presentSecondaryStack} from '../../helpers/secondaryNavigation';

interface NoServerPromptOwner {
  token: symbol;
  focused: boolean;
  mounted: boolean;
  promptActive: boolean;
  suppressCurrentFocus: boolean;
  suppressNextAppearance: boolean;
}

let activePromptOwner: symbol | undefined;

export const useNoServer = (componentId: string) => {
  const server = useAppSelector(selectServer);
  const intl = useIntl();
  const ownerRef = useRef<NoServerPromptOwner>({
    token: Symbol(componentId),
    focused: false,
    mounted: true,
    promptActive: false,
    suppressCurrentFocus: false,
    suppressNextAppearance: false,
  });

  const prompt = useCallback(() => {
    const owner = ownerRef.current;
    if (
      server.host ||
      !owner.focused ||
      owner.promptActive ||
      owner.suppressCurrentFocus ||
      activePromptOwner
    ) {
      return;
    }

    owner.promptActive = true;
    activePromptOwner = owner.token;
    void presentSecondaryStack({
      componentName: 'Settings',
      onDismissed: () => {
        if (activePromptOwner === owner.token) {
          activePromptOwner = undefined;
        }
        owner.promptActive = false;
        if (!owner.mounted) {
          return;
        }
        if (owner.focused) {
          owner.suppressCurrentFocus = true;
        } else {
          owner.suppressNextAppearance = true;
        }
      },
    })
      .then(rootComponentId => {
        if (!rootComponentId && activePromptOwner === owner.token) {
          activePromptOwner = undefined;
          owner.promptActive = false;
        }
      })
      .catch(error => {
        if (activePromptOwner === owner.token) {
          activePromptOwner = undefined;
        }
        owner.promptActive = false;
        SecureLogger.logError(
          error instanceof Error ? error : new Error(String(error)),
          'navigation.no-server-settings',
        );
        owner.suppressCurrentFocus = true;
      });
    ToastAndroid.showWithGravity(
      intl.formatMessage(messages['toast.noServerData']),
      ToastAndroid.LONG,
      ToastAndroid.TOP,
    );
  }, [intl, server.host]);
  const promptRef = useRef(prompt);

  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);

  useEffect(() => {
    const owner = ownerRef.current;
    const listener = Navigation.events().registerComponentListener(
      {
        componentDidAppear() {
          if (owner.focused) {
            return;
          }
          owner.focused = true;
          if (owner.suppressNextAppearance) {
            owner.suppressNextAppearance = false;
            owner.suppressCurrentFocus = true;
            return;
          }
          owner.suppressCurrentFocus = false;
          promptRef.current();
        },
        componentDidDisappear() {
          owner.focused = false;
          owner.suppressCurrentFocus = false;
        },
      },
      componentId,
    );
    return () => {
      owner.focused = false;
      listener.remove();
    };
  }, [componentId]);

  useEffect(() => {
    const owner = ownerRef.current;
    if (server.host) {
      owner.suppressCurrentFocus = false;
      owner.suppressNextAppearance = false;
    } else {
      prompt();
    }
  }, [prompt, server.host]);

  useEffect(
    () => {
      const owner = ownerRef.current;
      return () => {
        owner.mounted = false;
        owner.promptActive = false;
        if (activePromptOwner === owner.token) {
          activePromptOwner = undefined;
        }
      };
    },
    [],
  );
};
