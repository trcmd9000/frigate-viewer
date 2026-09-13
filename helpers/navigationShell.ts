import {Navigation} from 'react-native-navigation';
import type {LayoutRoot} from 'react-native-navigation';

export const ROOT_TABS_ID = 'RootTabs';

const TAB_ICON_SIZE = 24;

export const PRIMARY_DESTINATIONS = [
  {
    key: 'cameras',
    label: 'Cameras',
    icon: require('../assets/navigation/cameras.png'),
    componentName: 'CamerasList',
    stackId: 'CamerasStack',
  },
  {
    key: 'events',
    label: 'Events',
    icon: require('../assets/navigation/events.png'),
    componentName: 'CameraEvents',
    stackId: 'EventsStack',
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: require('../assets/navigation/settings.png'),
    componentName: 'Settings',
    stackId: 'SettingsStack',
  },
] as const;

export type PrimaryDestinationKey = (typeof PRIMARY_DESTINATIONS)[number]['key'];
export type PrimaryDestinationLabels = Record<
  PrimaryDestinationKey,
  string
>;

export const primaryDestinationIndex = (
  key: PrimaryDestinationKey,
): number => PRIMARY_DESTINATIONS.findIndex(destination => destination.key === key);

export const updatePrimaryDestinationLabels = (
  labels: PrimaryDestinationLabels,
): Promise<unknown[]> =>
  Promise.all(
    PRIMARY_DESTINATIONS.map(destination =>
      Promise.resolve(
        Navigation.mergeOptions(destination.stackId, {
          bottomTab: {text: labels[destination.key]},
        }),
      ),
    ),
  );

export const createRootLayout = (): LayoutRoot => ({
  root: {
    bottomTabs: {
      id: ROOT_TABS_ID,
      children: PRIMARY_DESTINATIONS.map(destination => ({
        stack: {
          id: destination.stackId,
          children: [
            {
              component: {
                name: destination.componentName,
              },
            },
          ],
          options: {
            bottomTab: {
              text: destination.label,
              icon: destination.icon,
              iconWidth: TAB_ICON_SIZE,
              iconHeight: TAB_ICON_SIZE,
              testID: `destination-${destination.key}`,
            },
          },
        },
      })),
      options: {
        bottomTabs: {
          currentTabIndex: 0,
          animate: false,
          visible: true,
          drawBehind: false,
          titleDisplayMode: 'alwaysShow',
        },
        hardwareBackButton: {
          popStackOnPress: true,
          bottomTabsOnPress: 'previous',
        },
      },
    },
  },
});

export const selectPrimaryDestination = (
  key: PrimaryDestinationKey,
): Promise<unknown> =>
  // A single native bottom-tabs selection is the source of truth. Each stack
  // remains mounted, so returning to a destination restores its state.
  Promise.resolve(
    Navigation.mergeOptions(ROOT_TABS_ID, {
      bottomTabs: {currentTabIndex: primaryDestinationIndex(key)},
    }),
  );

let settingsModalNavigationInFlight = false;

/**
 * Settings is presented as a modal from every entry point. Keeping the
 * transition guard here prevents a fast repeated tap from creating two
 * Settings modals.
 */
export const presentSettingsModal = (): Promise<unknown> => {
  if (settingsModalNavigationInFlight) {
    return Promise.resolve();
  }

  settingsModalNavigationInFlight = true;
  try {
    return Promise.resolve(
      Navigation.showModal({
        stack: {
          children: [
            {
              component: {
                name: 'Settings',
              },
            },
          ],
        },
      }),
    ).finally(() => {
      settingsModalNavigationInFlight = false;
    });
  } catch (error) {
    settingsModalNavigationInFlight = false;
    return Promise.reject(error);
  }
};
