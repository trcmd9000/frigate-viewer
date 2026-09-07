import {makeMessages} from '../../helpers/locale';

export const messages = makeMessages('camerasList', {
  'topBar.title': 'List of cameras',
  noCameras: 'No cameras',
  emptyDescription: 'Add or configure a server to discover cameras.',
  configure: 'Configure server',
  refresh: 'Refresh',
  lastUpdate: 'Last update {time}',
  waiting: 'Waiting for the first snapshot',
  loadingSnapshot: 'Loading camera snapshot',
  snapshotUnavailable: 'Snapshot unavailable',
  snapshot: 'Snapshot',
  open: 'Open camera',
  snapshotAccessibility: '{camera} snapshot',
  stateAccessibility: '{camera} state: {state}',
  cardAccessibility: '{camera}, {state}. {action}',
  'tab.cameras': 'Cameras',
  'tab.events': 'Events',
  'tab.settings': 'Settings',
  error:
    'Unable to load cameras. Check your connection and try again.',
  retry: 'Retry loading cameras',
});
