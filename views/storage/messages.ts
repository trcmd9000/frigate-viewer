import {makeMessages} from '../../helpers/locale';

export const messages = makeMessages('storage', {
  'topBar.title': 'Storage',
  'topBar.back': 'Back',
  error:
    'Unable to load storage information. Check your connection and try again.',
  retry: 'Retry loading storage',
  'location.header': 'Location',
  'location.recordings': 'Clips & Recordings',
  'location.cache': 'Cache',
  'location.shm': 'Shared memory',
  'used.header': 'Used',
  'total.header': 'Total',
  'camera.header': 'Camera',
  'bandwidth.header': 'Bandwidth',
});
