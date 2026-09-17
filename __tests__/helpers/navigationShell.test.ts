import {Navigation} from 'react-native-navigation';
import {
  createRootLayout,
  presentSettingsModal,
  PRIMARY_DESTINATIONS,
  primaryDestinationIndex,
  selectPrimaryDestination,
  updatePrimaryDestinationLabels,
} from '../../helpers/navigationShell';

jest.mock('react-native-navigation', () => ({
  Navigation: {
    mergeOptions: jest.fn(),
  },
}));

const mockPresentSecondaryStack = jest.fn();
jest.mock('../../helpers/secondaryNavigation', () => ({
  presentSecondaryStack: (options: unknown) =>
    mockPresentSecondaryStack(options),
}));

describe('media-first navigation shell', () => {
  it('starts with Cameras and exposes only the two primary destinations', () => {
    const layout = createRootLayout();
    const tabs = layout.root.bottomTabs!;

    expect(PRIMARY_DESTINATIONS.map(destination => destination.key)).toEqual([
      'cameras',
      'events',
    ]);
    expect(tabs.options?.bottomTabs?.currentTabIndex).toBe(0);
    expect(tabs.children).toHaveLength(2);
    expect(tabs.children?.map(child => child.stack?.id)).toEqual([
      'CamerasStack',
      'EventsStack',
    ]);
    expect(PRIMARY_DESTINATIONS.map(destination => destination.icon)).toEqual([
      expect.anything(),
      expect.anything(),
    ]);
    expect(
      tabs.children?.map(child => child.stack?.options?.bottomTab),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          icon: PRIMARY_DESTINATIONS[0].icon,
          iconWidth: 24,
          iconHeight: 24,
          testID: 'destination-cameras',
        }),
        expect.objectContaining({
          icon: PRIMARY_DESTINATIONS[1].icon,
          iconWidth: 24,
          iconHeight: 24,
          testID: 'destination-events',
        }),
      ]),
    );
    expect(tabs.children?.[0].stack?.options?.bottomTab).not.toHaveProperty(
      'selectedTextColor',
    );
  });

  it('keeps a stack per destination so Android Back restores its prior state', () => {
    const layout = createRootLayout();
    const tabs = layout.root.bottomTabs!;

    expect(
      tabs.children?.every(child => child.stack?.children?.length === 1),
    ).toBe(true);
    expect(tabs.options?.bottomTabs?.animate).toBe(false);
    expect(tabs.options?.hardwareBackButton).toEqual({
      popStackOnPress: true,
      bottomTabsOnPress: 'previous',
    });
    expect(tabs.options?.bottomTabs?.titleDisplayMode).toBe('alwaysShow');
  });

  it('selects a destination through native tabs without parallel React state', async () => {
    await selectPrimaryDestination('events');
    expect(primaryDestinationIndex('events')).toBe(1);
    expect(Navigation.mergeOptions).toHaveBeenCalledWith('RootTabs', {
      bottomTabs: {currentTabIndex: 1},
    });
  });

  it('updates tab labels in place without rebuilding the selected stacks', async () => {
    await updatePrimaryDestinationLabels({
      cameras: 'Kamera',
      events: 'Ereignisse',
    });

    expect(Navigation.mergeOptions).toHaveBeenCalledWith('CamerasStack', {
      bottomTab: {text: 'Kamera'},
    });
    expect(Navigation.mergeOptions).toHaveBeenCalledWith('EventsStack', {
      bottomTab: {text: 'Ereignisse'},
    });
    expect(Navigation.mergeOptions).not.toHaveBeenCalledWith(
      'SettingsStack',
      expect.anything(),
    );
  });

  it('presents Settings in the guarded secondary stack', async () => {
    mockPresentSecondaryStack.mockResolvedValue('SecondaryStackRoot');

    await expect(presentSettingsModal()).resolves.toBe('SecondaryStackRoot');

    expect(mockPresentSecondaryStack).toHaveBeenCalledWith({
      componentName: 'Settings',
    });
  });
});
