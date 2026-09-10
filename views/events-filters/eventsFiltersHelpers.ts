import {useEffect} from 'react';
import {Navigation, OptionsTopBarButton} from 'react-native-navigation';
import {
  currentServerScopeGeneration,
  isCurrentServerScope,
  useServerScopeOwner,
} from '../../helpers/serverScopeScreen';
import {SecureLogger} from '../../helpers/secureLogger';

export const useEventsFilters = (
  componentId: string,
  cameraNames?: string[],
) => {
  const {generation, isCurrentScope} = useServerScopeOwner();
  useEffect(() => {
    if (!isCurrentScope()) {
      return;
    }
    Navigation.updateProps('EventsFilters', {
      viewedCameraNames: cameraNames,
      ownerScopeGeneration: generation,
    });
  }, [cameraNames, generation, isCurrentScope]);

  // Filters are presented as a modal so the root shell can stay a single
  // bottom-tabs navigation tree.
  void componentId;
};

export const filterButton = (count?: number): OptionsTopBarButton => {
  const ownerScopeGeneration = currentServerScopeGeneration();
  return {
    id: 'filter',
    component: {
      id: 'FilterButton',
      name: 'TopBarButton',
      passProps: {
        icon: 'filter',
        count,
        onPress: () => {
          if (!isCurrentServerScope(ownerScopeGeneration)) {
            return;
          }
          void Promise.resolve()
            .then(() => {
              if (!isCurrentServerScope(ownerScopeGeneration)) {
                return;
              }
              return Navigation.showModal({
                component: {
                  name: 'EventsFilters',
                  passProps: {ownerScopeGeneration},
                },
              });
            })
            .catch(() => {
              SecureLogger.logError(
                new Error('Filter navigation failed'),
                'navigation.events-filters',
              );
            });
        },
      },
    },
  };
};
