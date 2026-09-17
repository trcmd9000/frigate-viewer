import React from 'react';
import {act, fireEvent, render} from '@testing-library/react-native';
import {Logs} from '../../../views/logs/Logs';

const mockGet = jest.fn();
const mockMergeOptions = jest.fn();
let mockServer = {profileId: 'a', host: 'frigate.test'};

jest.mock('../../../helpers/rest', () => ({
  useRest: () => ({get: mockGet}),
}));
jest.mock('../../../store/store', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
jest.mock('../../../store/settings', () => ({
  selectServer: () => mockServer,
}));
jest.mock('../../../views/menu/menuHelpers', () => ({
  useMenu: jest.fn(),
  menuButton: {},
}));
jest.mock('../../../helpers/buttonts', () => ({
  refreshButton: (onPress: () => void) => ({onPress}),
}));
jest.mock('../../../helpers/colors', () => ({
  useTheme: () => ({background: '#fff', text: '#000', link: '#00f'}),
  useStyles: (factory: (value: unknown) => unknown) =>
    factory({theme: {background: '#fff', text: '#000', link: '#00f'}}),
}));
jest.mock('../../../helpers/errorHandler', () => ({
  handleError: async (error: Error) => error,
  getUserFriendlyMessage: (error: Error) => error.message,
}));
jest.mock('../../../components/RetryState', () => ({
  RetryState: () => null,
}));
jest.mock('react-intl', () => ({
  defineMessages: (value: unknown) => value,
  useIntl: () => ({
    formatMessage: ({defaultMessage, id}: {defaultMessage?: string; id: string}) =>
      defaultMessage || id,
  }),
}));
jest.mock('react-native-navigation', () => ({
  Navigation: {mergeOptions: (...args: unknown[]) => mockMergeOptions(...args)},
}));
jest.mock('react-native-ui-lib', () => {
  const ReactModule = require('react') as typeof React;
  const {View} = require('react-native') as typeof import('react-native');
  const TabController = ({children}: {children?: React.ReactNode}) =>
    ReactModule.createElement(View, null, children);
  TabController.TabBar = () => null;
  TabController.TabPage = ({children}: {children?: React.ReactNode}) =>
    ReactModule.createElement(View, null, children);
  return {
    LoaderScreen: () => ReactModule.createElement(View, {testID: 'loader'}),
    TabController,
  };
});
jest.mock('../../../views/logs/LogPreview', () => ({
  LogPreview: ({
    log,
    loading,
    error,
    onLoadOlder,
  }: {
    log: {name: string; data: string[]};
    loading: boolean;
    error?: string;
    onLoadOlder: () => void;
  }) => {
    const {Pressable, Text, View} =
      require('react-native') as typeof import('react-native');
    return (
      <View testID={`preview-${log.name}`}>
        <Text testID={`data-${log.name}`}>{log.data.join('|')}</Text>
        <Text testID={`error-${log.name}`}>{error || ''}</Text>
        {!loading && (
          <Pressable testID={`older-${log.name}`} onPress={onLoadOlder} />
        )}
      </View>
    );
  },
}));

const deferred = () => {
  let resolve!: (value: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {promise, resolve, reject};
};
const page = (prefix: string) =>
  Array.from({length: 500}, (_, index) => `${prefix}-${index}`).join('\n') +
  '\n';

describe('Logs request ownership and paging', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockServer = {profileId: 'a', host: 'frigate.test'};
  });

  afterEach(() => jest.useRealTimers());

  const startRequests = () => {
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  };

  it('uses start=-500 and retains successful services on partial failure', async () => {
    const requests = [deferred(), deferred(), deferred()];
    mockGet.mockImplementation(() => requests[mockGet.mock.calls.length - 1].promise);
    const view = render(<Logs componentId="logs" componentName="Logs" />);
    startRequests();

    expect(mockGet).toHaveBeenCalledTimes(3);
    expect(mockGet.mock.calls.map(call => call[2])).toEqual([
      {json: false, queryParams: {start: '-500'}},
      {json: false, queryParams: {start: '-500'}},
      {json: false, queryParams: {start: '-500'}},
    ]);

    await act(async () => {
      requests[0].resolve('old\nnew\n\n');
      requests[1].reject(new Error('go2rtc unavailable'));
      requests[2].resolve('nginx\n');
      await Promise.allSettled(requests.map(request => request.promise));
      await Promise.resolve();
    });

    expect(view.getByTestId('data-frigate').props.children).toBe('new|old');
    expect(view.getByTestId('data-nginx').props.children).toBe('nginx');
    expect(view.getByTestId('error-go2rtc').props.children).toBe(
      'go2rtc unavailable',
    );
  });

  it('loads non-overlapping older ranges and prevents duplicate requests', async () => {
    mockGet.mockResolvedValueOnce(page('current'));
    mockGet.mockResolvedValueOnce('go\n');
    mockGet.mockResolvedValueOnce('proxy\n');
    const view = render(<Logs componentId="logs" componentName="Logs" />);
    startRequests();
    await act(async () => Promise.resolve());

    const firstOlder = deferred();
    mockGet.mockReturnValueOnce(firstOlder.promise);
    act(() => {
      fireEvent.press(view.getByTestId('older-frigate'));
      fireEvent.press(view.getByTestId('older-frigate'));
    });
    expect(mockGet).toHaveBeenCalledTimes(4);
    expect(mockGet.mock.calls[3][2].queryParams).toEqual({
      start: '-1000',
      end: '-500',
    });

    await act(async () => {
      firstOlder.resolve(page('older'));
      await firstOlder.promise;
      await Promise.resolve();
    });
    mockGet.mockResolvedValueOnce('oldest\n');
    await act(async () => {
      fireEvent.press(view.getByTestId('older-frigate'));
      await Promise.resolve();
    });
    expect(mockGet.mock.calls[4][2].queryParams).toEqual({
      start: '-1500',
      end: '-1000',
    });
  });

  it('ignores stale responses after a refresh takes ownership', async () => {
    const initial = [deferred(), deferred(), deferred()];
    mockGet.mockImplementation(() => initial[mockGet.mock.calls.length - 1].promise);
    const view = render(<Logs componentId="logs" componentName="Logs" />);
    startRequests();

    const replacement = [deferred(), deferred(), deferred()];
    mockGet.mockImplementation(
      () => replacement[mockGet.mock.calls.length - 4].promise,
    );
    const options = mockMergeOptions.mock.calls.at(-1)[1];
    act(() => options.topBar.rightButtons[0].onPress());

    await act(async () => {
      replacement.forEach((request, index) => request.resolve(`fresh-${index}\n`));
      await Promise.all(replacement.map(request => request.promise));
    });
    await act(async () => initial[0].resolve('stale\n'));

    expect(view.getByTestId('data-frigate').props.children).toBe('fresh-0');
  });
});
