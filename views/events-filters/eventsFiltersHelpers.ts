import {useEffect} from 'react';
import {Navigation, OptionsTopBarButton} from 'react-native-navigation';

export const useEventsFilters = (
  componentId: string,
  cameraNames?: string[],
) => {
  useEffect(() => {
    Navigation.updateProps('EventsFilters', {
      viewedCameraNames: cameraNames,
    });
  }, [cameraNames]);

  // Filters are presented as a modal so the root shell can stay a single
  // bottom-tabs navigation tree.
  void componentId;
};

export const filterButton: (count?: number) => OptionsTopBarButton = count => ({
  id: 'filter',
  component: {
    id: 'FilterButton',
    name: 'TopBarButton',
    passProps: {
      icon: 'filter',
      count,
      onPress: () => {
        void Navigation.showModal({
          component: {
            name: 'EventsFilters',
          },
        });
      },
    },
  },
});
