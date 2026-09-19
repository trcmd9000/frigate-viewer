import React from 'react';
import {act, cleanup, fireEvent, render} from '@testing-library/react-native';
import {Platform} from 'react-native';
import {configureStore} from '@reduxjs/toolkit';
import {Provider} from 'react-redux';
import {Navigation} from 'react-native-navigation';
import {CameraEvents} from '../../../views/camera-events/CameraEvents';
import type {ICameraEventsProps} from '../../../views/camera-events/CameraEvents';
import type {ICameraEvent} from '../../../views/camera-events/CameraEvent';
import {
  eventsStore, selectServerScopeGeneration, setFiltersCameras, setFiltersLabels,
  setFiltersZones, setFiltersRetained,
} from '../../../store/events';
import {
  initialSettings, saveSettings, setActiveServerProfileId, settingsStore,
} from '../../../store/settings';
import type {Server} from '../../../store/settings';
import {createServerScopeReducer} from '../../../store/serverScope';
import {SecureLogger} from '../../../helpers/secureLogger';
import {useEventsFilters} from '../../../views/events-filters/eventsFiltersHelpers';
import {useNoServer} from '../../../views/settings/useNoServer';

const mockGet = jest.fn();
const mockSetComponentId = jest.fn();
const mockTileMount = jest.fn();
const mockTileUnmount = jest.fn();
let mockOrientation: 'portrait' | 'landscape' = 'portrait';
const mockHandleSecondaryButton = jest.fn().mockResolvedValue(true);
let mockNavigationButtonListener:
  | ((event: {componentId: string; buttonId: string}) => void)
  | undefined;
jest.mock('../../../store/store', () => {
  const redux = require('react-redux') as typeof import('react-redux');
  return {useAppDispatch: redux.useDispatch, useAppSelector: redux.useSelector};
});
jest.mock('../../../helpers/rest', () => ({useRest: () => ({get: mockGet})}));
jest.mock('../../../helpers/secureLogger', () => ({SecureLogger: {logError: jest.fn()}}));
jest.mock('react-native-navigation', () => ({Navigation: {
  mergeOptions: jest.fn(), updateProps: jest.fn(), showModal: jest.fn(),
  events: () => ({
    registerComponentListener: () => ({remove: jest.fn()}),
    registerNavigationButtonPressedListener: (
      listener: (event: {componentId: string; buttonId: string}) => void,
    ) => {
      mockNavigationButtonListener = listener;
      return {remove: jest.fn()};
    },
  }),
}}));
jest.mock('react-intl', () => ({
  useIntl: () => ({formatMessage: ({id}: {id: string}) => id}),
  defineMessages: (messages: unknown) => messages,
}));
jest.mock('../../../views/settings/useNoServer', () => ({useNoServer: jest.fn()}));
jest.mock('../../../views/menu/menuHelpers', () => ({useMenu: jest.fn(), menuButton: {}}));
jest.mock('../../../helpers/secondaryNavigation', () => ({
  SECONDARY_ROOT_COMPONENT_ID: 'SecondaryStackRoot',
  createSecondaryStackDismissButton: (text: string) => ({
    id: 'dismissSecondaryStack',
    text,
  }),
  handleSecondaryStackNavigationButton: (event: unknown) =>
    mockHandleSecondaryButton(event),
}));
jest.mock('../../../views/events-filters/eventsFiltersHelpers', () => ({
  useEventsFilters: jest.fn(), filterButton: () => ({}),
}));
jest.mock('../../../views/events-filters/ActiveFilters', () => ({ActiveFilters: () => null}));
jest.mock('../../../components/Background', () => ({
  Background: ({children}: {children: React.ReactNode}) => <>{children}</>,
}));
jest.mock('../../../components/Refresh', () => ({Refresh: () => null}));
jest.mock('../../../components/RetryState', () => ({
  RetryState: ({testID, message}: {testID: string; message: string}) => {
    const {Text} = require('react-native') as typeof import('react-native');
    return <Text testID={testID}>{message}</Text>;
  },
}));
jest.mock('../../../helpers/screen', () => ({
  useOrientation: () => ({orientation: mockOrientation, setComponentId: mockSetComponentId}),
}));
jest.mock('../../../helpers/designTokens', () => ({useDesignTokens: () => ({
  colors: {surfaceElevated: '#eee', mediaBackground: '#000', outline: '#ccc'},
  spacing: {sm: 8, md: 12, lg: 16}, geometry: {cardRadius: 16, mediaAspectRatio: 16 / 9},
})}));
jest.mock('../../../views/camera-events/CameraEvent', () => ({
  CameraEvent: (props: ICameraEvent & {
    onEventPress: (event: ICameraEvent) => void;
    onRetainedChange: (eventId: string, retained: boolean) => void;
    onShare: (event: ICameraEvent) => void;
    mediaEnabled: boolean;
  }) => {
    const {useEffect} = require('react') as typeof React;
    const {Pressable, Text, View} = require('react-native') as typeof import('react-native');
    useEffect(() => {
      mockTileMount(props.id);
      return () => { mockTileUnmount(props.id); };
    }, [props.id]);
    return <View>
      <Pressable testID={`clip-${props.id}`} onPress={() => props.onEventPress(props)} />
      <Pressable
        testID={`unretain-${props.id}`}
        onPress={() => props.onRetainedChange(props.id, false)}
      />
      <Pressable testID={`share-${props.id}`} onPress={() => props.onShare(props)} />
      <Text testID={`media-${props.id}`}>{String(props.mediaEnabled)}</Text>
    </View>;
  },
}));
jest.mock('../../../views/camera-events/Share', () => ({
  Share: ({event}: {event?: ICameraEvent}) => {
    const {View} = require('react-native') as typeof import('react-native');
    return event ? <View testID={`shared-${event.id}`} /> : null;
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
    ...initialSettings, servers: configured ? [profileA, profileB] : [],
    activeServerProfileId: configured ? profileA.profileId : undefined,
  }));
  return store;
};
const event = (id = 'shared', start = 1000): ICameraEvent => ({
  id, camera: 'shared-camera', thumbnail: '', start_time: start, end_time: start + 1,
  zones: [], area: null, box: null, has_clip: true, has_snapshot: true,
  label: 'person', sub_label: null, plus_id: null, data: {top_score: 1},
  false_positive: null, ratio: null, region: null, retain_indefinitely: false,
});
const page = () => Array.from({length: 100}, (_, index) => event(`event-${index}`, 1000 - index));
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};
let requests: ReturnType<typeof deferred<ICameraEvent[]>>[];
let frames: Array<(time: number) => void>;
const settle = async (callback: () => void) => {
  await act(async () => { callback(); });
};
const mount = (store: ReturnType<typeof makeStore>, props: ICameraEventsProps = {}) => render(
  <Provider store={store}>
    <CameraEvents componentId="events" componentName="CameraEvents" {...props} />
  </Provider>,
);
type Screen = ReturnType<typeof mount>;
const list = (view: Screen) => view.getByTestId('camera-events-list');
const refresh = (view: Screen) => act(() => list(view).props.refreshControl.props.onRefresh());
const loadMore = (view: Screen) => act(() => list(view).props.onEndReached());

describe('CameraEvents server-scope requests', () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as {OS: string}).OS = originalPlatform;
    mockOrientation = 'portrait';
    mockNavigationButtonListener = undefined;
    requests = [];
    frames = [];
    mockGet.mockImplementation(() => {
      const request = deferred<ICameraEvent[]>();
      requests.push(request);
      return request.promise;
    });
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => {
      frames.push(callback);
      return frames.length;
    });
  });
  afterEach(() => { cleanup(); jest.restoreAllMocks(); });

  it.each([
    ['portrait', true, true],
    ['landscape', false, true],
  ] as const)(
    'seeds %s media chrome before the clip first frame',
    async (orientation, statusBarVisible, statusBarDrawBehind) => {
      (Platform as {OS: string}).OS = 'android';
      mockOrientation = orientation;
      const view = mount(makeStore());
      const modal = deferred<string>();
      jest.mocked(Navigation.showModal).mockReturnValue(modal.promise);
      await settle(() => requests[0].resolve([event()]));
      fireEvent.press(view.getByTestId('clip-shared'));
      act(() => { frames[0](0); });

      expect(Navigation.showModal).toHaveBeenCalledWith(expect.objectContaining({
        component: expect.objectContaining({
          options: expect.objectContaining({
            layout: expect.objectContaining({
              fitSystemWindows: false,
            }),
            statusBar: expect.objectContaining({
              visible: statusBarVisible,
              drawBehind: statusBarDrawBehind,
            }),
            navigationBar: {visible: false, backgroundColor: '#000000'},
          }),
        }),
      }));
      modal.resolve('clip-modal');
      view.unmount();
    },
  );

  it('keeps the Events-tab Burger but gives retained secondary roots Back', () => {
    const primary = mount(makeStore());
    expect(useNoServer).toHaveBeenCalledWith('events');
    expect((Navigation.mergeOptions as jest.Mock).mock.calls.at(-1)[1].topBar)
      .toMatchObject({leftButtons: [{}]});
    expect(mockNavigationButtonListener).toBeUndefined();
    primary.unmount();

    render(
      <Provider store={makeStore()}>
        <CameraEvents
          componentId="SecondaryStackRoot"
          componentName="CameraEvents"
          retained
        />
      </Provider>,
    );
    expect((Navigation.mergeOptions as jest.Mock).mock.calls.at(-1)[1].topBar)
      .toMatchObject({
        title: {text: 'cameraEvents.topBar.retained.title'},
        leftButtons: [{id: 'dismissSecondaryStack', text: 'cameraEvents.topBar.back'}],
        rightButtons: [{}],
      });
    const buttonEvent = {
      componentId: 'SecondaryStackRoot',
      buttonId: 'dismissSecondaryStack',
    };
    act(() => mockNavigationButtonListener?.(buttonEvent));
    expect(mockHandleSecondaryButton).toHaveBeenCalledWith(buttonEvent);
  });

  it('drops rows and sharing on A-B-A, remounts identical IDs and fetches first pages on the same host', async () => {
    const store = makeStore();
    const firstGeneration = selectServerScopeGeneration(store.getState());
    const view = mount(store);
    await settle(() => requests[0].resolve(page()));
    fireEvent.press(view.getByTestId('share-event-0'));
    expect(view.getByTestId('shared-event-0')).toBeTruthy();
    loadMore(view); // Pending A pagination.
    act(() => { store.dispatch(setActiveServerProfileId(profileB.profileId)); });
    expect(list(view).props.data).toEqual([]);
    expect(view.queryByTestId('clip-event-0')).toBeNull();
    expect(view.queryByTestId('shared-event-0')).toBeNull();
    expect(mockTileUnmount).toHaveBeenCalledWith('event-0');
    expect(mockGet.mock.calls[2][0]).toMatchObject({profileId: profileB.profileId, host: profileA.host});
    expect(mockGet.mock.calls[2][2].queryParams.before).toBeUndefined();
    await settle(() => requests[2].resolve(page()));
    expect(mockTileMount.mock.calls.filter(([id]) => id === 'event-0')).toHaveLength(2);
    loadMore(view); // Pending B pagination.
    act(() => { store.dispatch(setActiveServerProfileId(profileA.profileId)); });
    expect(selectServerScopeGeneration(store.getState())).toBe(firstGeneration + 2);
    expect(list(view).props.data).toEqual([]);
    await settle(() => {
      requests[1].resolve([event('old-a')]);
      requests[3].resolve([event('old-b')]);
    });
    expect(list(view).props.data).toEqual([]);
    expect(list(view).props.refreshControl.props.refreshing).toBe(true);
    expect(mockGet.mock.calls[4][2].queryParams.before).toBeUndefined();
    await settle(() => requests[4].resolve([event('fresh-a')]));
    expect(list(view).props.data.map((item: ICameraEvent) => item.id)).toEqual(['fresh-a']);
  });

  it('removes an unretained event from the saved-events view', async () => {
    const view = mount(makeStore(), {retained: true});
    await settle(() =>
      requests[0].resolve([
        {...event('saved-event'), retain_indefinitely: true},
      ]),
    );

    fireEvent.press(view.getByTestId('unretain-saved-event'));

    expect(list(view).props.data).toEqual([]);
  });

  it('keeps B empty on failure and resets every filter before requesting B', async () => {
    const store = makeStore();
    act(() => {
      store.dispatch(setFiltersCameras(['shared-camera']));
      store.dispatch(setFiltersLabels(['person']));
      store.dispatch(setFiltersZones(['yard']));
      store.dispatch(setFiltersRetained(true));
    });
    const view = mount(store);
    await settle(() => requests[0].resolve([event('a')]));
    refresh(view); // Old A refresh remains pending.
    act(() => { store.dispatch(setActiveServerProfileId(profileB.profileId)); });
    expect(list(view).props.data).toEqual([]);
    expect(mockGet.mock.calls[2][2].queryParams).toEqual({
      favorites: '0', limit: '100', include_thumbnails: '0',
    });
    expect(store.getState().events.filters).toEqual({cameras: [], labels: [], zones: [], retained: false});
    await settle(() => requests[2].reject(new Error('B offline')));
    await settle(() => requests[1].reject(new Error('stale A failure')));
    expect(SecureLogger.logError).toHaveBeenCalledTimes(1);
    expect(list(view).props.data).toEqual([]);
    expect(view.getByTestId('camera-events-retry').props.children).toBe('cameraEvents.error');
    expect(list(view).props.refreshControl.props.refreshing).toBe(false);
  });

  it('preserves pull/filter refresh and pagination ownership when an old finally arrives during a newer page', async () => {
    const store = makeStore();
    const view = mount(store);
    await settle(() => requests[0].resolve(page()));
    loadMore(view); // request 1 owns pagination.
    refresh(view); // request 2 invalidates request 1 immediately.
    expect(list(view).props.data).toHaveLength(100); // Same-scope refresh preserves rows.
    expect(mockGet.mock.calls[2][2].queryParams.before).toBeUndefined();
    await settle(() => requests[2].resolve(page()));
    loadMore(view); // request 3 owns pagination now.
    await settle(() => requests[1].reject(new Error('obsolete page')));
    expect(SecureLogger.logError).not.toHaveBeenCalled();
    loadMore(view);
    expect(mockGet).toHaveBeenCalledTimes(4); // Old finally did not unlock request 3.
    await settle(() => requests[3].resolve([event('event-0'), event('new-page')]));
    expect(list(view).props.data).toHaveLength(101); // Deduplication is preserved.
    act(() => { store.dispatch(setFiltersLabels(['car'])); });
    expect(mockGet.mock.calls[4][2].queryParams).toMatchObject({labels: 'car'});
    expect(mockGet.mock.calls[4][2].queryParams.before).toBeUndefined();
    expect(list(view).props.refreshControl.props.refreshing).toBe(true);
    await settle(() => requests[4].resolve(page()));
    loadMore(view); // Filter refresh resets endReached.
    expect(mockGet).toHaveBeenCalledTimes(6);
    expect(mockGet.mock.calls[5][2].queryParams.before).toBe('901');
  });

  it('invalidates refresh success, catch and finally within the same scope', async () => {
    const view = mount(makeStore());
    refresh(view);
    await settle(() => requests[0].resolve([event('old-success')]));
    expect(list(view).props.data).toEqual([]);
    expect(list(view).props.refreshControl.props.refreshing).toBe(true);
    refresh(view);
    await settle(() => requests[1].reject(new Error('old-refresh-error')));
    expect(SecureLogger.logError).not.toHaveBeenCalled();
    expect(list(view).props.refreshControl.props.refreshing).toBe(true);
    await settle(() => requests[2].resolve([event('latest')]));
    expect(list(view).props.data).toEqual([event('latest')]);
  });

  it.each(['success', 'error'] as const)('checks live Redux before stale refresh %s, without a React notification', async outcome => {
    const store = makeStore();
    const subscribe = store.subscribe;
    let notify = true;
    jest.spyOn(store, 'subscribe').mockImplementation(listener => subscribe(() => {
      if (notify) { listener(); }
    }));
    const view = mount(store);
    notify = false;
    act(() => { store.dispatch(setActiveServerProfileId(profileB.profileId)); });
    await settle(() => {
      if (outcome === 'success') { requests[0].resolve([event('stale')]); }
      else { requests[0].reject(new Error('stale')); }
    });
    expect(list(view).props.data).toEqual([]);
    expect(list(view).props.refreshControl.props.refreshing).toBe(true);
    expect(SecureLogger.logError).not.toHaveBeenCalled();
    expect(mockGet).toHaveBeenCalledTimes(1); // No stale setState triggered a render/new fetch.
  });

  it.each(['success', 'error'] as const)('checks live Redux before stale pagination %s without a React notification', async outcome => {
    const store = makeStore();
    const subscribe = store.subscribe;
    let notify = true;
    jest.spyOn(store, 'subscribe').mockImplementation(listener => subscribe(() => {
      if (notify) { listener(); }
    }));
    const view = mount(store);
    await settle(() => requests[0].resolve(page()));
    loadMore(view);
    notify = false;
    act(() => { store.dispatch(setActiveServerProfileId(profileB.profileId)); });
    await settle(() => {
      if (outcome === 'success') { requests[1].resolve([event('stale-page')]); }
      else { requests[1].reject(new Error('stale-page')); }
    });
    expect(list(view).props.data).toEqual(page());
    expect(SecureLogger.logError).not.toHaveBeenCalled();
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('does not mount content for an owner mismatch, including return to the same profile', () => {
    const store = makeStore();
    const owner = selectServerScopeGeneration(store.getState());
    const mismatch = mount(store, {ownerScopeGeneration: owner - 1});
    expect(mismatch.queryByTestId('camera-events-list')).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
    expect(useEventsFilters).not.toHaveBeenCalled();
    mismatch.unmount();
    const view = mount(store, {ownerScopeGeneration: owner, cameraNames: ['shared-camera']});
    expect(mockGet).toHaveBeenCalledTimes(1);
    act(() => { store.dispatch(setActiveServerProfileId(profileB.profileId)); });
    expect(view.queryByTestId('camera-events-list')).toBeNull();
    act(() => { store.dispatch(setActiveServerProfileId(profileA.profileId)); });
    expect(view.queryByTestId('camera-events-list')).toBeNull();
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('cancels queued clip navigation after a scope switch before React is notified', async () => {
    const store = makeStore();
    const subscribe = store.subscribe;
    let notify = true;
    jest.spyOn(store, 'subscribe').mockImplementation(listener => subscribe(() => {
      if (notify) { listener(); }
    }));
    const view = mount(store);
    await settle(() => requests[0].resolve([event()]));
    fireEvent.press(view.getByTestId('clip-shared'));
    notify = false;
    act(() => { store.dispatch(setActiveServerProfileId(profileB.profileId)); });
    act(() => { frames[0](0); });
    expect(Navigation.showModal).not.toHaveBeenCalled();
  });

  it.each(['success', 'error'] as const)('passes captured clip ownership and ignores late %s before React updates', async outcome => {
    const store = makeStore();
    const owner = selectServerScopeGeneration(store.getState());
    const subscribe = store.subscribe;
    let notify = true;
    jest.spyOn(store, 'subscribe').mockImplementation(listener => subscribe(() => {
      if (notify) { listener(); }
    }));
    const modal = deferred<string>();
    jest.mocked(Navigation.showModal).mockReturnValue(modal.promise);
    const view = mount(store);
    await settle(() => requests[0].resolve([event()]));
    fireEvent.press(view.getByTestId('clip-shared'));
    fireEvent.press(view.getByTestId('clip-shared'));
    expect(frames).toHaveLength(1);
    act(() => { frames[0](0); });
    expect(Navigation.showModal).toHaveBeenCalledWith(expect.objectContaining({
      component: expect.objectContaining({passProps: expect.objectContaining({ownerScopeGeneration: owner})}),
    }));
    expect(view.getByTestId('media-shared').props.children).toBe('false');
    notify = false;
    act(() => { store.dispatch(setActiveServerProfileId(profileB.profileId)); });
    await settle(() => {
      if (outcome === 'success') { modal.resolve('clip-modal'); }
      else { modal.reject(new Error('late navigation failure')); }
    });
    expect(mockSetComponentId).not.toHaveBeenCalled();
    expect(SecureLogger.logError).not.toHaveBeenCalled();
    expect(view.getByTestId('media-shared').props.children).toBe('false');
  });

  it('does not request with no server, initially or after removing configured servers', async () => {
    const empty = mount(makeStore(false));
    refresh(empty);
    loadMore(empty);
    expect(mockGet).not.toHaveBeenCalled();
    expect(list(empty).props.refreshControl.props.refreshing).toBe(false);
    empty.unmount();
    const store = makeStore();
    const view = mount(store);
    act(() => { store.dispatch(saveSettings({...initialSettings, servers: []})); });
    await settle(() => requests[0].resolve([event('late-a')]));
    refresh(view);
    loadMore(view);
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(list(view).props.data).toEqual([]);
    expect(list(view).props.refreshControl.props.refreshing).toBe(false);
  });
});
