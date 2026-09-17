import React from 'react';
import {render} from '@testing-library/react-native';
import {LogPreview} from '../../../views/logs/LogPreview';
import de from '../../../i18n/de';
import en from '../../../i18n/en';

jest.mock('react-native-gesture-handler', () => ({
  FlatList: require('react-native').FlatList,
}));
jest.mock('react-native-ui-lib', () => ({
  Text: require('react-native').Text,
}));
jest.mock('../../../helpers/colors', () => ({
  useStyles: (factory: (value: unknown) => unknown) =>
    factory({theme: {background: '#fff', text: '#000', link: '#00f'}}),
}));
jest.mock('react-intl', () => ({
  defineMessages: (value: unknown) => value,
  useIntl: () => ({
    formatMessage: ({defaultMessage, id}: {defaultMessage?: string; id: string}) =>
      defaultMessage || id,
  }),
}));

it('keeps the log list strictly virtualized with stable batch settings', () => {
  const view = render(
    <LogPreview
      log={{name: 'frigate', data: ['new', 'old']}}
      onLoadOlder={jest.fn()}
    />,
  );
  const list = view.getByTestId('logs-list-frigate');

  expect(list.props.initialNumToRender).toBe(12);
  expect(list.props.maxToRenderPerBatch).toBe(12);
  expect(list.props.windowSize).toBe(5);
  expect(list.props.updateCellsBatchingPeriod).toBe(50);
  expect(list.props.inverted).toBe(true);
});

it('provides English and German messages for every paging state', () => {
  const expected = {
    'logs.loadOlder': ['Load older', 'Ältere laden'],
    'logs.loadingOlder': [
      'Loading older logs',
      'Ältere Protokolle werden geladen',
    ],
    'logs.loadOlderError': [
      'Older logs could not be loaded.',
      'Ältere Protokolle konnten nicht geladen werden.',
    ],
    'logs.endOfLogs': ['No older logs', 'Keine älteren Protokolle'],
  } as const;

  Object.entries(expected).forEach(([key, [english, german]]) => {
    expect(en[key as keyof typeof en]).toBe(english);
    expect(de[key as keyof typeof de]).toBe(german);
  });
});
