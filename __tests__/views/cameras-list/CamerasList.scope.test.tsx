import React from 'react';
import {act, cleanup, render} from '@testing-library/react-native';
import {configureStore} from '@reduxjs/toolkit';
import {Provider} from 'react-redux';
import {CamerasList} from '../../../views/cameras-list/CamerasList';
import {eventsStore, selectServerScopeGeneration} from '../../../store/events';
import {
  initialSettings, saveSettings, setActiveServerProfileId, settingsStore,
} from '../../../store/settings';
import type {Server} from '../../../store/settings';
import {createServerScopeReducer} from '../../../store/serverScope';
import {handleError} from '../../../helpers/errorHandler';
import type {AppError} from '../../../helpers/errorHandler';

const mockGet = jest.fn();
const mockTileMount = jest.fn();
const mockTileUnmount = jest.fn();
const handledError: AppError = {code: 'TEST', message: 'Handled test error', severity: 'error'};

jest.mock('../../../store/store', () => {
  const redux = require('react-redux') as typeof import('react-redux');
  return {useAppDispatch: redux.useDispatch, useAppSelector: redux.useSelector};
});
jest.mock('../../../helpers/rest', () => ({useRest: () => ({get: mockGet})}));
jest.mock('../../../helpers/errorHandler', () => ({handleError: jest.fn()}));
jest.mock('../../../helpers/navigationShell', () => ({
  presentSettingsModal: jest.fn().mockResolvedValue(undefined),
  updatePrimaryDestinationLabels: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('react-native-navigation', () => ({Navigation: {
  mergeOptions: jest.fn(),
  events: () => ({registerComponentListener: () => ({remove: jest.fn()})}),
}}));
jest.mock('react-intl', () => ({
  useIntl: () => ({formatMessage: ({id}: {id: string}) => id}),
  defineMessages: (messages: unknown) => messages,
}));
jest.mock('../../../views/settings/useNoServer', () => ({useNoServer: jest.fn()}));
jest.mock('../../../views/menu/menuHelpers', () => ({useMenu: jest.fn(), menuButton: {}}));
jest.mock('../../../components/Background', () => ({
  Background: ({children}: {children: React.ReactNode}) => <>{children}</>,
}));
jest.mock('../../../components/Refresh', () => ({Refresh: () => null}));
jest.mock('../../../components/RetryState', () => ({RetryState: () => null}));
jest.mock('../../../components/primitives', () => ({
  InlineState: ({testID}: {testID: string}) => {
    const {View} = require('react-native') as typeof import('react-native');
    return <View testID={testID} />;
  },
}));
jest.mock('../../../helpers/designTokens', () => ({useDesignTokens: () => ({
  colors: {accent: '#145dcc', mediaBackground: '#eee', surfaceElevated: '#ddd'},
})}));
jest.mock('../../../views/cameras-list/CameraTile', () => ({
  CameraTile: ({cameraName}: {cameraName: string}) => {
    const {useEffect} = require('react') as typeof React;
    const {View} = require('react-native') as typeof import('react-native');
    useEffect(() => {
      mockTileMount(cameraName);
      return () => { mockTileUnmount(cameraName); };
    }, [cameraName]);
    return <View testID={`tile-${cameraName}`} />;
  },
}));

const profileA: Server = {
  profileId: 'scope-a', protocol: 'https', host: 'scope.example.test', port: 443,
  path: '', auth: 'none', credentials: {username: '', password: ''},
};
const profileB: Server = {...profileA, profileId: 'scope-b'};
const makeStore = (configured = true) => {
  const store = configureStore({
    reducer: createServerScopeReducer(settingsStore.reducer, eventsStore.reducer),
  });
  store.dispatch(saveSettings({
    ...initialSettings,
    servers: configured ? [profileA, profileB] : [],
    activeServerProfileId: configured ? profileA.profileId : undefined,
  }));
  return store;
};
const config = (label: string) => ({
  cameras: {shared: {zones: {yard: {}}}}, objects: {track: [label]},
});
const deferred = () => {
  let resolve!: (value: ReturnType<typeof config>) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ReturnType<typeof config>>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {promise, resolve, reject};
};
let requests: ReturnType<typeof deferred>[];
const startRequests = () => act(() => { jest.advanceTimersByTime(0); });
const settle = async (callback: () => void) => {
  await act(async () => { callback(); });
};
const mount = (store: ReturnType<typeof makeStore>) => render(
  <Provider store={store}>
    <CamerasList componentId="cameras" componentName="CamerasList" />
  </Provider>,
);

describe('CamerasList server-scope requests', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    requests = [];
    mockGet.mockImplementation(() => {
      const request = deferred();
      requests.push(request);
      return request.promise;
    });
    jest.mocked(handleError).mockResolvedValue(handledError);
  });
  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('removes tiles before fetching B and rejects old A/B responses after A-B-A on the same host', async () => {
    const store = makeStore();
    const firstGeneration = selectServerScopeGeneration(store.getState());
    const view = mount(store);
    startRequests();
    const observed: unknown[] = [];
    const unsubscribe = store.subscribe(() => observed.push(store.getState().events.available));
    await settle(() => requests[0].resolve(config('first-a')));
    expect(observed).toEqual([{cameras: ['shared'], labels: ['first-a'], zones: ['yard']}]);
    unsubscribe();
    expect(view.getByTestId('tile-shared')).toBeTruthy();
    act(() => view.getByTestId('cameras-list').props.refreshControl.props.onRefresh());

    act(() => { store.dispatch(setActiveServerProfileId(profileB.profileId)); });
    expect(view.queryByTestId('tile-shared')).toBeNull();
    expect(mockTileUnmount).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledTimes(2); // B's scheduled fetch has not run.
    startRequests();
    expect(mockGet.mock.calls[2][0]).toMatchObject({profileId: profileB.profileId, host: profileA.host});
    await settle(() => requests[2].resolve(config('b')));
    expect(view.getByTestId('tile-shared')).toBeTruthy();
    expect(mockTileMount).toHaveBeenCalledTimes(2); // Identical name, new tile instance.
    act(() => view.getByTestId('cameras-list').props.refreshControl.props.onRefresh());

    act(() => { store.dispatch(setActiveServerProfileId(profileA.profileId)); });
    expect(view.queryByTestId('tile-shared')).toBeNull();
    expect(selectServerScopeGeneration(store.getState())).toBe(firstGeneration + 2);
    startRequests();
    await settle(() => {
      requests[1].resolve(config('stale-a'));
      requests[3].resolve(config('stale-b'));
    });
    expect(store.getState().events.available.cameras).toEqual([]);
    expect(view.getByTestId('cameras-list').props.refreshControl.props.refreshing).toBe(true);
    await settle(() => requests[4].resolve(config('fresh-a')));
    expect(store.getState().events.available.labels).toEqual(['fresh-a']);
    expect(mockTileMount).toHaveBeenCalledTimes(3);
  });

  it('shows B failure without resurrecting A, and never requests with no server', async () => {
    const store = makeStore();
    const view = mount(store);
    startRequests();
    await settle(() => requests[0].resolve(config('a')));
    act(() => view.getByTestId('cameras-list').props.refreshControl.props.onRefresh());
    act(() => { store.dispatch(setActiveServerProfileId(profileB.profileId)); });
    startRequests();
    await settle(() => requests[2].reject(new Error('B offline')));
    expect(view.getByTestId('cameras-list-error')).toBeTruthy();
    await settle(() => requests[1].resolve(config('late-a')));
    expect(view.queryByTestId('tile-shared')).toBeNull();
    expect(store.getState().events.available.cameras).toEqual([]);
    act(() => { store.dispatch(saveSettings({...initialSettings, servers: []})); });
    startRequests();
    act(() => view.getByTestId('cameras-list').props.refreshControl.props.onRefresh());
    expect(mockGet).toHaveBeenCalledTimes(3);
    expect(view.getByTestId('cameras-list-empty')).toBeTruthy();
  });

  it('checks getState before logging even when React has not received the scope update', async () => {
    const store = makeStore();
    const subscribe = store.subscribe;
    let notify = true;
    jest.spyOn(store, 'subscribe').mockImplementation(listener => subscribe(() => {
      if (notify) { listener(); }
    }));
    const view = mount(store);
    startRequests();
    notify = false;
    act(() => { store.dispatch(setActiveServerProfileId(profileB.profileId)); });
    await settle(() => requests[0].reject(new Error('stale error before render')));
    expect(handleError).not.toHaveBeenCalled();
    expect(view.getByTestId('cameras-list').props.refreshControl.props.refreshing).toBe(true);
  });

  it('guards success before React renders and guards completion after asynchronous error handling', async () => {
    const store = makeStore();
    const dispatch = jest.spyOn(store, 'dispatch');
    const subscribe = store.subscribe;
    let notify = true;
    jest.spyOn(store, 'subscribe').mockImplementation(listener => subscribe(() => {
      if (notify) { listener(); }
    }));
    const view = mount(store);
    startRequests();
    let finishError!: () => void;
    jest.mocked(handleError).mockImplementation(() => new Promise<AppError>(resolve => {
      finishError = () => resolve(handledError);
    }));
    await settle(() => requests[0].reject(new Error('current error')));
    act(() => view.getByTestId('cameras-list').props.refreshControl.props.onRefresh());
    notify = false;
    act(() => { store.dispatch(setActiveServerProfileId(profileB.profileId)); });
    dispatch.mockClear();
    await settle(() => {
      requests[1].resolve(config('stale-a'));
      finishError();
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(view.getByTestId('cameras-list').props.refreshControl.props.refreshing).toBe(true);
    expect(view.queryByTestId('cameras-list-error')).toBeNull();
  });

  it('does not request on initial empty settings or manual refresh', () => {
    const view = mount(makeStore(false));
    startRequests();
    act(() => view.getByTestId('cameras-list').props.refreshControl.props.onRefresh());
    expect(mockGet).not.toHaveBeenCalled();
    expect(view.getByTestId('cameras-list-empty')).toBeTruthy();
  });
});