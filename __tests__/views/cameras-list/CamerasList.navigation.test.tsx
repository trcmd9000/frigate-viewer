import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {Navigation} from 'react-native-navigation';
import {CamerasList} from '../../../views/cameras-list/CamerasList';
import {useNoServer} from '../../../views/settings/useNoServer';

const state = {
  server: {host: ''},
  cameras: [] as string[],
  columns: 2,
  locale: 'de_DE',
};

const mockGet = jest.fn();
const mockDispatch = jest.fn();
const mockStore = {getState: () => ({events: {scopeGeneration: 0}})};
const mockPresentSecondaryStack = jest.fn();

jest.mock('react-redux', () => ({
  useStore: () => mockStore,
}));

jest.mock('react-native-navigation', () => ({
  Navigation: {
    showModal: jest.fn(),
    mergeOptions: jest.fn(),
    events: () => ({
      registerComponentListener: () => ({remove: jest.fn()}),
    }),
  },
}));

jest.mock('../../../helpers/secondaryNavigation', () => ({
  presentSecondaryStack: (options: unknown) =>
    mockPresentSecondaryStack(options),
}));

jest.mock('react-intl', () => ({
  useIntl: () => ({
    formatMessage: ({id}: {id: string}) => {
      const messages = (
        state.locale === 'en_US'
          ? require('../../../i18n/en')
          : require('../../../i18n/de')
      ).default as Record<string, string>;
      return messages[id] || id;
    },
  }),
  defineMessages: (messages: unknown) => messages,
}));

jest.mock('../../../helpers/rest', () => ({
  useRest: () => ({get: mockGet}),
}));

jest.mock('../../../helpers/errorHandler', () => ({
  handleError: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../store/events', () => ({
  selectAvailableCameras: 'cameras',
  selectAvailableLabels: 'labels',
  selectAvailableZones: 'zones',
  selectServerScopeGeneration: () => 0,
  setAvailableForScope: jest.fn(),
}));

jest.mock('../../../store/settings', () => ({
  selectServer: 'server',
  selectCamerasNumColumns: 'columns',
  selectLocaleRegion: 'locale',
}));

jest.mock('../../../store/store', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: string | (() => number)) =>
    typeof selector === 'function'
      ? selector()
      : state[selector as 'server' | 'cameras' | 'columns' | 'locale'],
}));

jest.mock('../../../views/menu/menuHelpers', () => ({
  useMenu: jest.fn(),
  menuButton: {},
}));

jest.mock('../../../views/settings/useNoServer', () => ({
  useNoServer: jest.fn(),
}));

jest.mock('../../../components/Background', () => ({
  Background: ({children}: {children: React.ReactNode}) => <>{children}</>,
}));

jest.mock('../../../components/Refresh', () => ({
  Refresh: () => null,
}));

jest.mock('../../../components/RetryState', () => ({
  RetryState: ({onRetry, testID}: {onRetry: () => void; testID?: string}) => {
    const ReactRuntime = require('react') as typeof React;
    const {Pressable} =
      require('react-native') as typeof import('react-native');
    return ReactRuntime.createElement(Pressable, {testID, onPress: onRetry});
  },
}));

jest.mock('../../../components/primitives', () => ({
  InlineState: ({action}: {action: React.ReactNode}) => <>{action}</>,
  StatusChip: () => null,
}));

jest.mock('../../../helpers/designTokens', () => ({
  useDesignTokens: () => ({
    colors: {
      accent: '#145dcc',
      mediaBackground: '#eee',
      surfaceElevated: '#ddd',
    },
  }),
}));

jest.mock('../../../views/cameras-list/CameraTile', () => ({
  CameraTile: jest.fn(() => null),
}));

describe('CamerasList Settings navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    state.server = {host: ''};
    state.cameras = [];
    state.columns = 2;
    state.locale = 'de_DE';
    mockGet.mockReset();
    mockDispatch.mockReset();
  });

  it.each([
    ['de_DE', 'Kameraübersicht'],
    ['en_US', 'Camera overview'],
  ])('uses the overview heading for %s', async (locale, title) => {
    state.locale = locale;
    render(<CamerasList componentId="cameras" componentName="CamerasList" />);
    expect(useNoServer).toHaveBeenCalledWith('cameras');
    await waitFor(() =>
      expect(Navigation.mergeOptions).toHaveBeenCalledWith(
        'cameras',
        expect.objectContaining({
          topBar: expect.objectContaining({title: {text: title}}),
        }),
      ),
    );
  });

  it('passes each item index and resolved column count to camera tiles', () => {
    state.cameras = ['front', 'back'];
    const {CameraTile} = jest.requireMock(
      '../../../views/cameras-list/CameraTile',
    ) as {CameraTile: jest.Mock};

    render(<CamerasList componentId="cameras" componentName="CamerasList" />);

    expect(CameraTile).toHaveBeenCalledWith(
      expect.objectContaining({
        cameraName: 'front',
        index: 0,
        layoutColumns: 2,
      }),
      {},
    );
    expect(CameraTile).toHaveBeenCalledWith(
      expect.objectContaining({
        cameraName: 'back',
        index: 1,
        layoutColumns: 2,
      }),
      {},
    );
  });

  it('opens no-server Configure in the guarded secondary stack', async () => {
    mockPresentSecondaryStack.mockResolvedValue('SecondaryStackRoot');

    const {getByTestId} = render(
      <CamerasList componentId="cameras" componentName="CamerasList" />,
    );
    const configure = await waitFor(() =>
      getByTestId('cameras-list-configure'),
    );

    fireEvent.press(configure);
    fireEvent.press(configure);

    expect(mockPresentSecondaryStack).toHaveBeenCalledTimes(2);
    expect(mockPresentSecondaryStack).toHaveBeenCalledWith({
      componentName: 'Settings',
    });
  });

  it('updates native bottom-tab labels from the active app locale', async () => {
    const {Navigation: mockedNavigation} = jest.requireMock(
      'react-native-navigation',
    ) as {Navigation: typeof Navigation};

    render(<CamerasList componentId="cameras" componentName="CamerasList" />);

    await waitFor(() => {
      expect(mockedNavigation.mergeOptions).toHaveBeenCalledWith(
        'CamerasStack',
        {bottomTab: {text: 'Kamera'}},
      );
      expect(mockedNavigation.mergeOptions).toHaveBeenCalledWith(
        'EventsStack',
        {bottomTab: {text: 'Ereignisse'}},
      );
      expect(mockedNavigation.mergeOptions).not.toHaveBeenCalledWith(
        'SettingsStack',
        expect.anything(),
      );
    });
  });

  it('wires pull-to-refresh and exposes a localized accessibility action', async () => {
    state.server = {host: 'frigate.example'};
    mockGet.mockResolvedValue({
      cameras: {},
      objects: {track: []},
    });

    const view = render(
      <CamerasList componentId="cameras" componentName="CamerasList" />,
    );
    const list = view.getByTestId('cameras-list');

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
    expect(list.props.refreshControl.props.onRefresh).toBeInstanceOf(Function);
    expect(list.props.accessibilityActions).toEqual([
      {name: 'activate', label: 'Aktualisieren'},
    ]);
    expect(view.queryByTestId('cameras-list-refresh')).toBeNull();
    expect(view.queryByText('Aktualisieren')).toBeNull();

    act(() => {
      list.props.refreshControl.props.onRefresh();
      list.props.onAccessibilityAction({
        nativeEvent: {actionName: 'activate'},
      });
    });
    expect(mockGet).toHaveBeenCalledTimes(3);
  });

  it('keeps the explicit retry action when refresh fails', async () => {
    state.server = {host: 'frigate.example'};
    state.cameras = ['front-door'];
    mockGet.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
      cameras: {},
      objects: {track: []},
    });

    const view = render(
      <CamerasList componentId="cameras" componentName="CamerasList" />,
    );
    const retry = await waitFor(() => view.getByTestId('cameras-list-retry'));

    fireEvent.press(retry);
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });
});
