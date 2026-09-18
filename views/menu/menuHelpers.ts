import {useEffect} from 'react';
import {
  Navigation,
  OptionsTopBarButton,
} from 'react-native-navigation';
import {SecureLogger} from '../../helpers/secureLogger';

export type MenuId =
  | 'camerasList'
  | 'cameraEvents'
  | 'retained'
  | 'storage'
  | 'system'
  | 'logs'
  | 'settings'
  | 'author';

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
      Navigation.showOverlay({
        component: {
          name: 'Menu',
          options: {
            overlay: {
              interceptTouchOutside: true,
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
