import {
  emptyServer,
  initialSettings,
  settingsMigrations,
} from '../../store/settings';
import {
  assertRemoteHttpConsent,
  normalizeRemoteHttpConsent,
  RemoteHttpConsentError,
} from '../../helpers/remoteHttpPolicy';
import {stripCredentialsFromPersistence} from '../../helpers/settingsPersistence';

describe('remote HTTP policy', () => {
  it('defaults migrated profiles to denied, including legacy HTTP profiles', () => {
    const server = {...emptyServer(), protocol: 'http' as const};
    const migrated = settingsMigrations({
      ...initialSettings,
      servers: [server],
    });

    expect(migrated.servers[0].allowInsecureRemoteHttp).toBe(false);
  });

  it('preserves an explicit consent for the same authority', () => {
    const server = {
      ...emptyServer(),
      protocol: 'http' as const,
      host: 'example.test',
      allowInsecureRemoteHttp: true,
    };

    expect(
      normalizeRemoteHttpConsent(server, server).allowInsecureRemoteHttp,
    ).toBe(true);
  });

  it('does not discard an explicit consent during migration', () => {
    const server = {
      ...emptyServer(),
      protocol: 'http' as const,
      host: 'example.test',
      allowInsecureRemoteHttp: true,
    };

    const migrated = settingsMigrations({...initialSettings, servers: [server]});
    expect(migrated.servers[0].allowInsecureRemoteHttp).toBe(true);
  });

  it('persists consent without persisting credentials', () => {
    const server = {
      ...emptyServer(),
      protocol: 'http' as const,
      host: 'example.test',
      allowInsecureRemoteHttp: true,
      auth: 'basic' as const,
      credentials: {username: 'viewer', password: 'secret'},
    };

    const persisted = stripCredentialsFromPersistence({
      ...initialSettings,
      servers: [server],
    });

    expect(persisted.servers[0].allowInsecureRemoteHttp).toBe(true);
    expect(persisted.servers[0].credentials).toEqual({
      username: '',
      password: '',
    });
  });

  it('invalidates consent when the authority changes', () => {
    const previous = {
      ...emptyServer(),
      protocol: 'http' as const,
      host: 'old.example.test',
      allowInsecureRemoteHttp: true,
    };
    const next = {...previous, host: 'new.example.test'};

    expect(
      normalizeRemoteHttpConsent(next, previous).allowInsecureRemoteHttp,
    ).toBe(false);
  });

  it('invalidates consent across an HTTPS to HTTP downgrade', () => {
    const previous = {
      ...emptyServer(),
      protocol: 'https' as const,
      host: 'example.test',
      port: 443,
      allowInsecureRemoteHttp: true,
    };
    const next = {
      ...previous,
      protocol: 'http' as const,
      port: 80,
    };

    expect(
      normalizeRemoteHttpConsent(next, previous).allowInsecureRemoteHttp,
    ).toBe(false);
  });

  it('fails closed without consent', () => {
    expect(() =>
      assertRemoteHttpConsent({
        protocol: 'http',
        allowInsecureRemoteHttp: false,
      }),
    ).toThrow(RemoteHttpConsentError);
    expect(() =>
      assertRemoteHttpConsent({
        protocol: 'http',
        allowInsecureRemoteHttp: true,
      }),
    ).not.toThrow();
  });
});
