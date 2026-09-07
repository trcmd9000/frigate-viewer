import {makeMessages} from '../../helpers/locale';

export const messages = makeMessages('cameraEvents', {
  'topBar.general.title': 'Events',
  'topBar.retained.title': 'Retained',
  'topBar.specificCamera.title': 'Events of {cameraName}',
  noEvents: 'No events',
  noFilteredEvents: 'No events match these filters.',
  noServer: 'Add a server to see events.',
  loading: 'Loading events',
  'labels.inProgressLabel': 'In progress',
  'action.delete': 'Delete',
  'action.retain': 'Retain',
  'action.unretain': 'Unretain',
  'action.share': 'Share',
  'action.open': 'Opens the event clip',
  'share.snapshot.label': 'Snapshot',
  'share.clip.label': 'Clip',
  'toast.noClip': 'This event has no clip.',
  error: 'Unable to load events. Check your connection and try again.',
  retry: 'Retry loading events',
  loadMoreError: 'More events could not be loaded.',
});
