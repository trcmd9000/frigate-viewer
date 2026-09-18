import {MessageDescriptor} from 'react-intl';
import {makeMessages} from '../../helpers/locale';

export const messages = makeMessages('menu', {
  title: 'More',
  'button.label': 'More',
  'button.refresh': 'Refresh',
  'button.filter': 'Filter',
  'items.label': 'Secondary navigation',
  'close.label': 'Close menu',
  'close.hint': 'Dismisses the secondary navigation',
  'section.app': 'App',
  'section.saved': 'Saved',
  'section.diagnostics': 'Diagnostics',
  'section.support': 'Support',
  'item.camerasList.label': 'List of cameras',
  'item.cameraEvents.label': 'All events',
  'item.retained.label': 'Retained',
  'item.storage.label': 'Storage',
  'item.system.label': 'System',
  'item.logs.label': 'Logs',
  'item.settings.label': 'Settings',
  'item.author.label': 'About',
});

export type MessageKey = typeof messages extends Record<
  infer R,
  MessageDescriptor
>
  ? R
  : never;
