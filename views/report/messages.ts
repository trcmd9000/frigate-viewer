import {MessageDescriptor} from 'react-intl';
import {makeMessages} from '../../helpers/locale';

export const messages = makeMessages('report', {
  'topBar.title': 'Report problem',
  'introduction.info':
    'Describe the problem below. The app will open a new issue on GitHub; no diagnostics or credentials are uploaded automatically.',
  'issue.header': 'Issue',
  'issue.description.label': 'Describe the problem',
  'action.send': 'Open GitHub',
  'toast.error': 'GitHub could not be opened',
});

export type MessageKey = typeof messages extends Record<
  infer R,
  MessageDescriptor
>
  ? R
  : never;
