import {useEffect} from 'react';
import {
  Navigation,
  OptionsTopBarButton,
} from 'react-native-navigation';
import type {OptionsModalPresentationStyle} from 'react-native-navigation';
import {SecureLogger} from '../../helpers/secureLogger';

export type MenuId =
  | 'camerasList'
  | 'cameraEvents'
  | 'retained'
  | 'storage'
  | 'system'
  | 'logs'
  | 'settings'
  | 'author'
  | 'report';

export const useSelectedMenuItem = (current?: MenuId) => {
  useEffect(() => {
    Navigation.updateProps('Menu', {
      current,
    });
  }, [current]);
};

export const useMenu = (_componentId: string, current?: MenuId) => {
  SecureLogger.logRequest('GET', `/view/${current || 'unknown'}`);
  useSelectedMenuItem(current);
};

let pendingSecondaryMenu = false;

export const openSecondaryMenu = () => {
  if (pendingSecondaryMenu) {
    return;
  }
  pendingSecondaryMenu = true;
  try {
    void Promise.resolve(
      Navigation.showModal({
        component: {
          name: 'Menu',
          options: {
            // A transparent native modal lets the component provide a compact
            // bottom sheet and keeps outside-tap dismissal consistent on both
            // platforms.
            modalPresentationStyle:
              'overFullScreen' as OptionsModalPresentationStyle,
            modal: {
              swipeToDismiss: true,
            },
            layout: {
              backgroundColor: 'transparent',
              componentBackgroundColor: 'transparent',
            },
          },
        },
      }),
    )
      .finally(() => {
        pendingSecondaryMenu = false;
      })
      .catch(error => {
        SecureLogger.logError(error as Error, 'navigation.show-secondary-menu');
      });
  } catch (error) {
    pendingSecondaryMenu = false;
    SecureLogger.logError(error as Error, 'navigation.show-secondary-menu');
  }
};

export const menuButton: OptionsTopBarButton = {
  id: 'menu',
  component: {
    name: 'TopBarButton',
    passProps: {
      icon: 'menu',
      onPress: openSecondaryMenu,
    },
  },
};
