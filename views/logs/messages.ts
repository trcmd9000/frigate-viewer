import {makeMessages} from '../../helpers/locale';

export const messages = makeMessages('logs', {
  'topBar.title': 'Logs',
  noLogs: 'No logs',
  error: 'Unable to load logs. Check your connection and try again.',
  retry: 'Retry loading logs',
});
