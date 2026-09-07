import {Navigation} from 'react-native-navigation';
import {Appearance} from 'react-native';
import {gestureHandlerRootHOC} from 'react-native-gesture-handler';
import {TopBarButton} from './components/icons/TopBarButton';
import {Author} from './views/author/Author';
import {Report} from './views/report/Report';
import {CameraEventClip} from './views/camera-event-clip/CameraEventClip';
import {CameraPreview} from './views/camera-preview/CameraPreview';
import {CameraEvents} from './views/camera-events/CameraEvents';
import {CamerasList} from './views/cameras-list/CamerasList';
import {EventsFilters} from './views/events-filters/EventsFilters';
import {Menu} from './views/menu/Menu';
import {Settings} from './views/settings/Settings';
import {withRedux} from './helpers/redux';
import {withNavigationTheme} from './helpers/navigationTheme';
import {withTranslations} from './helpers/locale';
import {Logs} from './views/logs/Logs';
import {Storage} from './views/storage/Storage';
import {System} from './views/system/System';
import {ServerForm} from './views/settings/ServerForm';
import {cleanupMediaCache} from './helpers/mediaDownload';
import {SecureLogger} from './helpers/secureLogger';
import {createRootLayout} from './helpers/navigationShell';
import {
  darkTheme,
  lightTheme,
  navigationThemeOptions,
} from './helpers/colors';

const registerComponent = (name, component, decorators = []) => {
  Navigation.registerComponent(
    name,
    () =>
      decorators.reduce(
        (decoratedComponent, decorator) => decorator(decoratedComponent),
        component,
      ),
    () => component,
  );
};

// withRedux is last so the navigation theme bridge is rendered inside Redux.
const viewDecorators = [
  gestureHandlerRootHOC,
  withTranslations,
  withNavigationTheme,
  withRedux,
];

registerComponent('CamerasList', CamerasList, viewDecorators);
registerComponent('CameraEvents', CameraEvents, viewDecorators);
registerComponent('CameraEventClip', CameraEventClip, viewDecorators);
registerComponent('CameraPreview', CameraPreview, viewDecorators);
registerComponent('Storage', Storage, viewDecorators);
registerComponent('System', System, viewDecorators);
registerComponent('Logs', Logs, viewDecorators);
registerComponent('Settings', Settings, viewDecorators);
registerComponent('ServerForm', ServerForm, viewDecorators);
registerComponent('Author', Author, viewDecorators);
registerComponent('Report', Report, viewDecorators);

registerComponent('Menu', Menu, [
  gestureHandlerRootHOC,
  withTranslations,
  withRedux,
]);
registerComponent('EventsFilters', EventsFilters, [
  withTranslations,
  withNavigationTheme,
  withRedux,
]);
registerComponent('TopBarButton', TopBarButton, [withTranslations, withRedux]);

Navigation.events().registerAppLaunchedListener(() => {
  void cleanupMediaCache().catch(error => {
    SecureLogger.logError(
      error instanceof Error
        ? error
        : new Error('Media cache cleanup failed'),
      'media-cache-cleanup',
    );
  });
  Navigation.setRoot(createRootLayout());
});

const initialDarkMode = Appearance.getColorScheme() === 'dark';
Navigation.setDefaultOptions(
  navigationThemeOptions(
    initialDarkMode ? darkTheme : lightTheme,
    initialDarkMode ? 'dark' : 'light',
  ),
);
