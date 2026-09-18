import {MessageDescriptor} from 'react-intl';
import {makeMessages} from '../../helpers/locale';

export const messages = makeMessages('report', {
  'topBar.title': 'Report problem',
  'topBar.back': 'Back',
  'introduction.info':
    'Describe the problem below. The app will open a prefilled new issue on GitHub in your browser; it does not upload diagnostics automatically. Review the issue before submitting. Do not include credentials, server URLs, logs, or other sensitive data.',
  'issue.header': 'Issue',
  'issue.description.label': 'Describe the problem',
  'action.send': 'Open GitHub',
  'toast.error':
    'GitHub could not be opened. Check your browser and try again.',
});

export type MessageKey = typeof messages extends Record<
  infer R,
  MessageDescriptor
>
  ? R
  : never;
