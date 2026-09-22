import {
  clearLegacyPersistedCredential,
  credentialsPersistenceTransform,
  getLegacyPersistedCredentials,
  getLegacyPersistedCredentialsForIdentity,
  getLegacyPersistedCredentialsForProfile,
  stripCredentialsFromPersistence,
} from '../../helpers/settingsPersistence';
import {
  emptyServer,
  initialSettings,
  ISettings,
  settingsMigrations,
} from '../../store/settings';

describe('settings persistence', () => {
  it('strips server credentials before redux-persist writes settings', () => {
    const state: ISettings = {
      ...initialSettings,
      servers: [
        {
          ...emptyServer(),
          mtlsEnabled: true,
          protocol: 'https',
          host: 'example.com',
          port: 443,
          credentials: {username: 'user', password: 'secret'},
          clientCertConfig: {
            alias: 'selected',
            serverCertificatePinRequired: false,
          },
        },
      ],
    };

    const persisted = credentialsPersistenceTransform.in(state, 'v1', state);

    const serialized = JSON.stringify(persisted);
    expect(JSON.parse(serialized).servers[0].credentials).toEqual({
      username: '',
      password: '',
    });
    expect(JSON.parse(serialized)).not.toHaveProperty('v1');
    expect(JSON.parse(serialized).servers[0].clientCertConfig).toEqual({
      alias: 'selected',
    });
    expect(state.servers[0].credentials).toEqual({
      username: 'user',
      password: 'secret',
    });

    credentialsPersistenceTransform.out(state, 'v1', state);
    expect(getLegacyPersistedCredentials()).toEqual([
      {
        identity: JSON.stringify({
          endpoint: encodeURIComponent('https://example.com:443'),
          clientCertAlias: encodeURIComponent('selected'),
        }),
        credentials: {username: 'user', password: 'secret'},
      },
    ]);
    clearLegacyPersistedCredential(
      JSON.stringify({
        endpoint: encodeURIComponent('https://example.com:443'),
        clientCertAlias: encodeURIComponent('selected'),
      }),
    );
  });

  it('scrubs legacy credentials during rehydration', () => {
    const state: ISettings = {
      ...initialSettings,
      servers: [
        {
          ...emptyServer(),
          credentials: {username: 'legacy-user', password: 'legacy-secret'},
        },
      ],
    };

    const rehydrated = credentialsPersistenceTransform.out(state, 'v1', state);

    expect(rehydrated.servers[0].credentials).toEqual({
      username: '',
      password: '',
    });
    clearLegacyPersistedCredential(
      JSON.stringify({
        endpoint: encodeURIComponent('https://example.com:5000'),
        clientCertAlias: '',
      }),
    );
  });

  it('keeps legacy credential migration metadata isolated by profile ID', () => {
    const firstProfile = {
      ...emptyServer(),
      profileId: 'profile-first',
      host: 'same.example.test',
      credentials: {username: 'first-user', password: 'first-secret'},
    };
    const secondProfile = {
      ...firstProfile,
      profileId: 'profile-second',
      credentials: {username: 'second-user', password: 'second-secret'},
    };

    credentialsPersistenceTransform.out(
      {
        ...initialSettings,
        servers: [firstProfile, secondProfile],
      },
      'v1',
      initialSettings,
    );

    expect(getLegacyPersistedCredentialsForProfile('profile-first')).toEqual({
      username: 'first-user',
      password: 'first-secret',
    });

    expect(getLegacyPersistedCredentialsForProfile('profile-second')).toEqual({
      username: 'second-user',
      password: 'second-secret',
    });

    clearLegacyPersistedCredential(
      JSON.stringify({
        endpoint: encodeURIComponent('https://same.example.test:5000'),
        clientCertAlias: '',
      }),
      'profile-first',
    );
    clearLegacyPersistedCredential(
      JSON.stringify({
        endpoint: encodeURIComponent('https://same.example.test:5000'),
        clientCertAlias: '',
      }),
      'profile-second',
    );
  });

  it('consumes duplicate unprofiled legacy credentials one at a time', () => {
    const identity = JSON.stringify({
      endpoint: encodeURIComponent('https://same.example.test:5000'),
      clientCertAlias: '',
    });
    const firstUnprofiledServer = {
      ...emptyServer(),
      profileId: undefined,
      host: 'same.example.test',
      credentials: {username: 'first-user', password: 'first-secret'},
    };
    const secondUnprofiledServer = {
      ...firstUnprofiledServer,
      credentials: {username: 'second-user', password: 'second-secret'},
    };

    credentialsPersistenceTransform.out(
      {
        ...initialSettings,
        servers: [firstUnprofiledServer, secondUnprofiledServer],
      },
      'v1',
      initialSettings,
    );

    expect(getLegacyPersistedCredentialsForIdentity(identity)).toHaveLength(2);
    clearLegacyPersistedCredential(identity);
    expect(getLegacyPersistedCredentialsForIdentity(identity)).toEqual([
      {
        profileId: undefined,
        credentials: {
          username: 'second-user',
          password: 'second-secret',
        },
      },
    ]);
    clearLegacyPersistedCredential(identity);
  });

  it('does not persist stale certificate config when mTLS is disabled', () => {
    const state: ISettings = {
      ...initialSettings,
      servers: [
        {
          ...emptyServer(),
          mtlsEnabled: false,
          clientCertConfig: {alias: 'stale-certificate'},
        },
      ],
    };

    const persisted = credentialsPersistenceTransform.in(state, 'v1', state);

    expect(persisted.servers[0].mtlsEnabled).toBe(false);
    expect(persisted.servers[0].clientCertConfig).toBeUndefined();
  });

  it('removes the legacy top-level certificate password cache', () => {
    const legacyState = {
      ...initialSettings,
      clientCertPasswordCache: {
        'https://example.com:443:certificate': 'legacy-secret',
      },
    } as ISettings & {
      clientCertPasswordCache: Record<string, string>;
    };

    const migrated = settingsMigrations(legacyState);
    const persisted = credentialsPersistenceTransform.in(
      legacyState,
      'v1',
      legacyState,
    );

    expect(migrated).not.toHaveProperty('clientCertPasswordCache');
    expect(persisted).not.toHaveProperty('clientCertPasswordCache');
    expect(JSON.stringify(persisted)).not.toContain('legacy-secret');
  });

  it('normalizes the persisted active profile and removes retired camera fields', () => {
    const persisted = stripCredentialsFromPersistence({
      ...initialSettings,
      activeServerProfileId: 'profile-missing',
      cameras: {
        ...initialSettings.cameras,
        liveView: true,
        actionWhenPressed: 'events',
      },
      servers: [
        {...emptyServer(), profileId: 'profile-first'},
        {...emptyServer(), profileId: 'profile-second'},
      ],
    });

    expect(persisted.activeServerProfileId).toBe('profile-first');
    expect(persisted.cameras).not.toHaveProperty('liveView');
    expect(persisted.cameras).not.toHaveProperty('actionWhenPressed');
    expect(persisted.servers).toHaveLength(2);
  });
});