import {configureStore} from '@reduxjs/toolkit';
import {persistReducer, REHYDRATE} from 'redux-persist';
import {
  eventsStore,
  initialState as initialEventsState,
  selectServerScopeGeneration,
  setAvailableCameras,
  setAvailableForScope,
  setAvailableLabels,
  setAvailableZones,
  setFiltersCameras,
  setFiltersLabels,
  setFiltersRetained,
  setFiltersZones,
} from '../../store/events';
import {
  initialSettings,
  removeServerProfile,
  saveSettings,
  setActiveServerProfile,
  setActiveServerProfileId,
  setCameraPreviewHeight,
  setEventSnapshotHeight,
  setServerClientCertConfig,
  settingsStore,
} from '../../store/settings';
import type {ISettings, Server, State as SettingsState} from '../../store/settings';
import {createServerScopeReducer} from '../../store/serverScope';

// Explicit synthetic profiles avoid profile generation and real infrastructure.
const profileA = {
  profileId: 'test-profile-a',
  protocol: 'https',
  host: 'scope.example.test',
  port: 443,
  path: '/frigate',
  auth: 'basic',
  credentials: {username: 'synthetic-user', password: 'synthetic-password'},
  mtlsEnabled: true,
  clientCertConfig: {alias: 'test-identity-a', allowSelfSignedServer: false},
  localRoutingEnabled: true,
  localEndpoint: {
    protocol: 'https',
    host: 'local.example.test',
    port: 443,
    basePath: '/local',
  },
  localTls: {
    mtlsEnabled: true,
    allowSelfSignedServer: false,
    clientCertConfig: {alias: 'test-local-identity-a'},
  },
  rtsp: {enabled: true, port: 8554, allowInsecureCredentials: false},
} satisfies Server;
// Same endpoint, auth and credentials: only the logical profile differs.
const profileB: Server = {...profileA, profileId: 'test-profile-b'};
const settings: ISettings = {
  ...initialSettings,
  servers: [profileA, profileB],
  activeServerProfileId: profileA.profileId,
};
const catalog = {
  cameras: ['test-camera'],
  labels: ['test-label'],
  zones: ['test-zone'],
};

const makeStore = (initial?: ISettings) => {
  const store = configureStore({
    reducer: createServerScopeReducer(settingsStore.reducer, eventsStore.reducer),
  });
  if (initial) {
    store.dispatch(saveSettings(initial));
  }
  return store;
};

const populate = (store: ReturnType<typeof makeStore>) => {
  store.dispatch(
    setAvailableForScope({
      generation: selectServerScopeGeneration(store.getState()),
      available: catalog,
    }),
  );
  store.dispatch(setFiltersCameras(catalog.cameras));
  store.dispatch(setFiltersLabels(catalog.labels));
  store.dispatch(setFiltersZones(catalog.zones));
  store.dispatch(setFiltersRetained(true));
};

const expectReset = (store: ReturnType<typeof makeStore>, generation: number) => {
  expect(store.getState().events).toEqual({
    ...initialEventsState,
    scopeGeneration: generation,
  });
};

const editProfile = (
  store: ReturnType<typeof makeStore>,
  profileId: string,
  edit: (server: Server) => Server,
) => {
  const current = store.getState().settings.v1;
  store.dispatch(
    saveSettings({
      ...current,
      servers: current.servers.map(server =>
        server.profileId === profileId ? edit(server) : server,
      ),
    }),
  );
};

describe('server scope root coordinator', () => {
  it('initializes at zero and preserves state references on unknown actions', () => {
    const store = makeStore();
    const before = store.getState();
    expect(selectServerScopeGeneration(before)).toBe(0);
    store.dispatch({type: 'test/no-op'});
    expect(store.getState()).toBe(before);
    store.dispatch(setActiveServerProfileId(undefined));
    expect(store.getState()).toBe(before);
    store.dispatch(saveSettings(initialSettings));
    expect(store.getState().events).toBe(before.events);
  });

  it('resets none -> A -> B -> A atomically with a new generation each time', () => {
    const store = makeStore();
    populate(store);
    store.dispatch(saveSettings(settings));
    expectReset(store, 1);
    populate(store);
    const oldState = store.getState();
    const observed: ReturnType<typeof store.getState>[] = [];
    const unsubscribe = store.subscribe(() => observed.push(store.getState()));

    store.dispatch(setActiveServerProfileId(profileB.profileId));
    expect(observed).toHaveLength(1);
    expect(observed[0].settings.v1.activeServerProfileId).toBe(profileB.profileId);
    expect(observed[0].events).toEqual({...initialEventsState, scopeGeneration: 2});
    expect(oldState.events.available).toEqual(catalog);
    expect(oldState.events.filters.retained).toBe(true);
    unsubscribe();

    populate(store);
    store.dispatch(setActiveServerProfile(profileA.profileId));
    expectReset(store, 3);
    expect(store.getState().settings.v1.servers).toEqual(oldState.settings.v1.servers);
  });

  it('rejects stale and future catalogs, including the previous A generation', () => {
    const store = makeStore(settings);
    const firstA = selectServerScopeGeneration(store.getState());
    store.dispatch(setActiveServerProfileId(profileB.profileId));
    const b = selectServerScopeGeneration(store.getState());
    store.dispatch(setActiveServerProfileId(profileA.profileId));
    const secondA = selectServerScopeGeneration(store.getState());
    populate(store);
    const before = store.getState();
    for (const generation of [0, firstA, b, secondA + 1]) {
      store.dispatch(setAvailableForScope({generation, available: {
        cameras: ['stale-camera'], labels: [], zones: [],
      }}));
      expect(store.getState()).toBe(before);
    }
    const available = {cameras: [], labels: ['new-label'], zones: ['new-zone']};
    const observed: ReturnType<typeof store.getState>[] = [];
    const unsubscribe = store.subscribe(() => observed.push(store.getState()));
    store.dispatch(setAvailableForScope({generation: secondA, available}));
    unsubscribe();
    expect(observed).toHaveLength(1);
    expect(observed[0].events.available).toEqual(available);
    expect(store.getState().events.filters).toBe(before.events.filters);
    expect(selectServerScopeGeneration(store.getState())).toBe(secondA);
  });

  it('keeps all legacy catalog and filter setters compatible', () => {
    const store = makeStore();
    store.dispatch(setAvailableCameras(catalog.cameras));
    store.dispatch(setAvailableLabels(catalog.labels));
    store.dispatch(setAvailableZones(catalog.zones));
    store.dispatch(setFiltersCameras(catalog.cameras));
    store.dispatch(setFiltersLabels(catalog.labels));
    store.dispatch(setFiltersZones(catalog.zones));
    store.dispatch(setFiltersRetained(true));
    expect(store.getState().events).toEqual({
      scopeGeneration: 0,
      available: catalog,
      filters: {...catalog, retained: true},
    });
    store.dispatch(setFiltersRetained(false));
    expect(store.getState().events.filters.retained).toBe(false);
    expect(selectServerScopeGeneration(store.getState())).toBe(0);
  });

  const changes: Array<[string, (server: Server) => Server]> = [
    ['remote protocol', server => ({...server, protocol: 'http'})],
    ['remote host', server => ({...server, host: 'changed.example.test'})],
    ['remote port', server => ({...server, port: 8443})],
    ['remote path', server => ({...server, path: '/changed'})],
    ['auth mode', server => ({...server, auth: 'frigate'})],
    ['basic username', server => ({
      ...server,
      credentials: {...server.credentials, username: 'synthetic-new-user'},
    })],
    ['basic password', server => ({
      ...server,
      credentials: {...server.credentials, password: 'synthetic-new-password'},
    })],
    ['remote mTLS toggle', server => ({...server, mtlsEnabled: false})],
    ['remote certificate alias', server => ({
      ...server, clientCertConfig: {alias: 'test-identity-b'},
    })],
    ['remote TLS trust', server => ({
      ...server,
      clientCertConfig: {...profileA.clientCertConfig, allowSelfSignedServer: true},
    })],
    ['local routing toggle', server => ({...server, localRoutingEnabled: false})],
    ['local protocol', server => ({
      ...server, localEndpoint: {...profileA.localEndpoint, protocol: 'http'},
    })],
    ['local host', server => ({
      ...server,
      localEndpoint: {...profileA.localEndpoint, host: 'changed-local.example.test'},
    })],
    ['local port', server => ({
      ...server, localEndpoint: {...profileA.localEndpoint, port: 8443},
    })],
    ['local path', server => ({
      ...server, localEndpoint: {...profileA.localEndpoint, basePath: '/changed'},
    })],
    ['local mTLS toggle', server => ({
      ...server, localTls: {...server.localTls, mtlsEnabled: false},
    })],
    ['local certificate alias', server => ({
      ...server,
      localTls: {...server.localTls, clientCertConfig: {alias: 'test-local-identity-b'}},
    })],
    ['local TLS trust', server => ({
      ...server, localTls: {...server.localTls, allowSelfSignedServer: true},
    })],
    ['local nested TLS trust', server => ({
      ...server,
      localTls: {
        ...server.localTls,
        clientCertConfig: {
          ...profileA.localTls.clientCertConfig, allowSelfSignedServer: true,
        },
      },
    })],
    ['RTSP toggle', server => ({
      ...server, rtsp: {...profileA.rtsp, enabled: false},
    })],
    ['RTSP port', server => ({
      ...server, rtsp: {...profileA.rtsp, port: 9554},
    })],
    ['RTSP credential consent', server => ({
      ...server, rtsp: {...profileA.rtsp, allowInsecureCredentials: true},
    })],
  ];

  it.each(changes)('resets on active %s changes through saveSettings', (_name, edit) => {
    const store = makeStore(settings);
    populate(store);
    const generation = selectServerScopeGeneration(store.getState());
    editProfile(store, profileA.profileId, edit);
    expectReset(store, generation + 1);
  });

  it.each(changes)('does not reset on inactive %s changes', (_name, edit) => {
    const store = makeStore(settings);
    populate(store);
    const before = store.getState().events;
    editProfile(store, 'test-profile-b', edit);
    expect(store.getState().events).toBe(before);
  });

  it.each(['frigate', 'none'] as const)('also scopes credential changes with %s auth', auth => {
    const store = makeStore({...settings, servers: [{...profileA, auth}]});
    populate(store);
    const generation = selectServerScopeGeneration(store.getState());
    editProfile(store, profileA.profileId, server => ({
      ...server,
      credentials: {...server.credentials, password: 'synthetic-hydrated-password'},
    }));
    expectReset(store, generation + 1);
  });

  it.each([true, false])('resets on remote HTTP consent changing from %s', consent => {
    const store = makeStore({
      ...settings,
      servers: [{...profileA, protocol: 'http', allowInsecureRemoteHttp: consent}],
    });
    populate(store);
    const generation = selectServerScopeGeneration(store.getState());
    editProfile(store, profileA.profileId, server => ({
      ...server, allowInsecureRemoteHttp: !consent,
    }));
    expect(store.getState().settings.v1.servers[0].allowInsecureRemoteHttp).toBe(!consent);
    expectReset(store, generation + 1);
  });

  it('handles direct active certificate updates, same config, removal and inactive edits', () => {
    const store = makeStore(settings);
    populate(store);
    const before = store.getState().events;
    const clientCertConfig = {alias: 'test-rotated-identity', allowSelfSignedServer: true};
    store.dispatch(setServerClientCertConfig({serverIndex: 1, clientCertConfig}));
    store.dispatch(setServerClientCertConfig({serverIndex: 99, clientCertConfig}));
    expect(store.getState().events).toBe(before);
    store.dispatch(setServerClientCertConfig({serverIndex: 0, clientCertConfig}));
    expectReset(store, before.scopeGeneration + 1);
    populate(store);
    const after = store.getState().events;
    store.dispatch(setServerClientCertConfig({serverIndex: 0, clientCertConfig: {...clientCertConfig}}));
    expect(store.getState().events).toBe(after);
    store.dispatch(setServerClientCertConfig({serverIndex: 0, clientCertConfig: undefined}));
    expectReset(store, after.scopeGeneration + 1);
  });

  it('resets on active removal with fallback and on removal of the last profile', () => {
    const store = makeStore(settings);
    populate(store);
    store.dispatch(removeServerProfile(profileA.profileId));
    expect(store.getState().settings.v1.activeServerProfileId).toBe(profileB.profileId);
    expectReset(store, 2);
    populate(store);
    store.dispatch(removeServerProfile('test-profile-b'));
    expect(store.getState().settings.v1.activeServerProfileId).toBeUndefined();
    expectReset(store, 3);
    store.dispatch(removeServerProfile('test-profile-b'));
    expectReset(store, 3);
  });

  it('resets when saveSettings removes all servers', () => {
    const store = makeStore(settings);
    populate(store);
    store.dispatch(saveSettings({...settings, servers: []}));
    expectReset(store, 2);
  });

  it('preserves data on same choice, fallback to the same choice, and inactive removal', () => {
    const store = makeStore(settings);
    populate(store);
    const before = store.getState().events;
    store.dispatch(setActiveServerProfileId(profileA.profileId));
    store.dispatch(setActiveServerProfile(profileA.profileId));
    store.dispatch(setActiveServerProfileId('missing-profile'));
    store.dispatch(setActiveServerProfileId(undefined));
    store.dispatch(removeServerProfile('missing-profile'));
    store.dispatch(removeServerProfile('test-profile-b'));
    expect(store.getState().events).toBe(before);
  });

  it('resets when an invalid selection actually falls back from B to A', () => {
    const store = makeStore({...settings, activeServerProfileId: profileB.profileId});
    populate(store);
    store.dispatch(setActiveServerProfileId('missing-profile'));
    expect(store.getState().settings.v1.activeServerProfileId).toBe(profileA.profileId);
    expectReset(store, 2);
  });

  it('preserves data for UI-only edits, reordered profiles and equal rebuilt settings', () => {
    const store = makeStore(settings);
    populate(store);
    const before = store.getState().events;
    store.dispatch(setCameraPreviewHeight(333));
    store.dispatch(setEventSnapshotHeight(444));
    const current = store.getState().settings.v1;
    store.dispatch(saveSettings({
      ...current,
      servers: [...current.servers].reverse(),
      app: {...current.app, colorScheme: 'dark'},
      locale: {...current.locale, region: 'en_US', datesDisplay: 'numeric'},
      events: {...current.events, numColumns: 2, photoPreference: 'thumbnail'},
      cameras: {...current.cameras, refreshFrequency: 20, numColumns: 2},
    }));
    store.dispatch(saveSettings(JSON.parse(JSON.stringify(store.getState().settings.v1))));
    expect(store.getState().events).toBe(before);
  });

  it('uses canonical server identity rather than raw endpoint spelling', () => {
    const store = makeStore(settings);
    populate(store);
    const before = store.getState().events;
    editProfile(store, profileA.profileId, server => ({
      ...server, host: ' SCOPE.EXAMPLE.TEST ', path: '//frigate/',
    }));
    expect(store.getState().events).toBe(before);
  });
});

describe('persisted settings scope coordination', () => {
  it('handles real REHYDRATE reconciliation, credential hydration, and no-op hydration', () => {
    const storage = {
      getItem: jest.fn().mockResolvedValue(null),
      setItem: jest.fn().mockResolvedValue(undefined),
      removeItem: jest.fn().mockResolvedValue(undefined),
    };
    const reducer = createServerScopeReducer(
      persistReducer<SettingsState>({key: 'settings', storage}, settingsStore.reducer),
      eventsStore.reducer,
    );
    const initial = reducer(undefined, {type: 'test/init'});
    const store = configureStore({
      reducer,
      preloadedState: {
        ...initial,
        settings: {...initial.settings, _persist: {version: -1, rehydrated: false}},
      },
    });
    const rehydrate = (v1: ISettings, key = 'settings') =>
      store.dispatch({type: REHYDRATE, key, payload: {v1}});
    const withoutCredentials = {
      ...settings,
      servers: settings.servers.map(server => ({
        ...server, credentials: {username: '', password: ''},
      })),
    };
    populate(store);
    rehydrate(withoutCredentials);
    expectReset(store, 1);
    expect(store.getState().settings._persist.rehydrated).toBe(true);
    populate(store);
    const before = store.getState().events;
    rehydrate(JSON.parse(JSON.stringify(withoutCredentials)));
    rehydrate({...withoutCredentials, activeServerProfileId: profileB.profileId}, 'other-key');
    expect(store.getState().events).toBe(before);

    // Mirrors secure storage installing credentials after disk rehydration.
    store.dispatch(saveSettings(settings));
    expectReset(store, 2);
    populate(store);
    rehydrate({...settings, activeServerProfileId: profileB.profileId});
    expectReset(store, 3);
    populate(store);
    rehydrate({...settings, servers: []});
    expectReset(store, 4);
    expect(store.getState().events).not.toHaveProperty('_persist');
    expect(store.getState().settings).not.toHaveProperty('scopeGeneration');
    expect(store.getState().settings.v1).not.toHaveProperty('scopeGeneration');
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(selectServerScopeGeneration(makeStore().getState())).toBe(0);
  });
});
