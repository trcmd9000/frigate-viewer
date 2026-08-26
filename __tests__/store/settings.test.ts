import {settingsStore, setServerClientCertConfig} from '../../store/settings';
import {ISettings} from '../../store/settings';

describe('Settings Store Reducer', () => {
  let initialState: any;

  beforeEach(() => {
    initialState = settingsStore.getInitialState();
  });

  describe('saveSettings action', () => {
    it('should save complete settings', () => {
      const newSettings: ISettings = {
        ...initialState.v1,
        servers: [
          {
            protocol: 'https',
            host: 'example.com',
            port: 5000,
            path: '',
            auth: 'none',
            credentials: {username: '', password: ''},
          },
        ],
      };

      const newState = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings(newSettings),
      );

      expect(newState.v1.servers).toHaveLength(1);
      expect(newState.v1.servers[0].host).toBe('example.com');
    });

    it('should preserve other settings when saving', () => {
      const settingsWithConfig: ISettings = {
        ...initialState.v1,
        app: {
          ...initialState.v1.app,
          colorScheme: 'dark',
        },
        servers: [
          {
            protocol: 'https',
            host: 'example.com',
            port: 5000,
            path: '',
            auth: 'none',
            credentials: {username: '', password: ''},
          },
        ],
      };

      const newState = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings(settingsWithConfig),
      );

      expect(newState.v1.app.colorScheme).toBe('dark');
      expect(newState.v1.servers).toHaveLength(1);
    });

    it('should handle multiple servers', () => {
      const settingsWithServers: ISettings = {
        ...initialState.v1,
        servers: [
          {
            protocol: 'https',
            host: 'example1.com',
            port: 5000,
            path: '',
            auth: 'none',
            credentials: {username: '', password: ''},
          },
          {
            protocol: 'https',
            host: 'example2.com',
            port: 5000,
            path: '',
            auth: 'basic',
            credentials: {username: 'user', password: 'pass'},
          },
        ],
      };

      const newState = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings(settingsWithServers),
      );

      expect(newState.v1.servers).toHaveLength(2);
      expect(newState.v1.servers[0].host).toBe('example1.com');
      expect(newState.v1.servers[1].host).toBe('example2.com');
      expect(newState.v1.servers[1].auth).toBe('basic');
    });
  });

  describe('Server Management Actions', () => {
    it('should add a new server', () => {
      const newSettings: ISettings = {
        ...initialState.v1,
        servers: [
          {
            protocol: 'https',
            host: 'new-server.com',
            port: 5000,
            path: '',
            auth: 'none',
            credentials: {username: '', password: ''},
          },
        ],
      };

      const newState = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings(newSettings),
      );

      expect(newState.v1.servers).toContainEqual(
        expect.objectContaining({host: 'new-server.com'}),
      );
    });

    it('should update existing server', () => {
      const stateWithServer = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings({
          ...initialState.v1,
          servers: [
            {
              protocol: 'https',
              host: 'example.com',
              port: 5000,
              path: '',
              auth: 'none',
              credentials: {username: '', password: ''},
            },
          ],
        }),
      );

      const updatedSettings: ISettings = {
        ...stateWithServer.v1,
        servers: [
          {
            ...stateWithServer.v1.servers[0],
            host: 'updated.com',
          },
        ],
      };

      const updatedState = settingsStore.reducer(
        stateWithServer,
        settingsStore.actions.saveSettings(updatedSettings),
      );

      expect(updatedState.v1.servers[0].host).toBe('updated.com');
    });

    it('should handle empty servers list', () => {
      const settingsEmpty: ISettings = {
        ...initialState.v1,
        servers: [],
      };

      const newState = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings(settingsEmpty),
      );

      expect(newState.v1.servers).toHaveLength(0);
    });
  });

  describe('Client Cert Config Updates', () => {
    it('should set client cert config for a server', () => {
      const stateWithServer = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings({
          ...initialState.v1,
          servers: [
            {
              protocol: 'https',
              host: 'example.com',
              port: 5000,
              path: '',
              auth: 'none',
              credentials: {username: '', password: ''},
            },
          ],
        }),
      );

      const certConfig = {
        alias: 'my-cert',
        password: 'cert-password',
        allowSelfSignedServer: false,
      };

      const newState = settingsStore.reducer(
        stateWithServer,
        setServerClientCertConfig({
          serverIndex: 0,
          clientCertConfig: certConfig,
        }),
      );

      expect(newState.v1.servers[0].clientCertConfig).toEqual(certConfig);
    });

    it('should update allowSelfSignedServer flag', () => {
      const stateWithServer = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings({
          ...initialState.v1,
          servers: [
            {
              protocol: 'https',
              host: 'example.com',
              port: 5000,
              path: '',
              auth: 'none',
              credentials: {username: '', password: ''},
              clientCertConfig: {alias: 'cert-1'},
            },
          ],
        }),
      );

      const updatedConfig = {
        alias: 'cert-1',
        allowSelfSignedServer: true,
      };

      const newState = settingsStore.reducer(
        stateWithServer,
        setServerClientCertConfig({
          serverIndex: 0,
          clientCertConfig: updatedConfig,
        }),
      );

      expect(
        newState.v1.servers[0].clientCertConfig?.allowSelfSignedServer,
      ).toBe(true);
    });

    it('should clear client cert config when undefined', () => {
      const stateWithCert = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings({
          ...initialState.v1,
          servers: [
            {
              protocol: 'https',
              host: 'example.com',
              port: 5000,
              path: '',
              auth: 'none',
              credentials: {username: '', password: ''},
              clientCertConfig: {alias: 'my-cert'},
            },
          ],
        }),
      );

      const newState = settingsStore.reducer(
        stateWithCert,
        setServerClientCertConfig({
          serverIndex: 0,
          clientCertConfig: undefined,
        }),
      );

      expect(newState.v1.servers[0].clientCertConfig).toBeUndefined();
    });

    it('should handle certificate config with only alias', () => {
      const stateWithServer = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings({
          ...initialState.v1,
          servers: [
            {
              protocol: 'https',
              host: 'example.com',
              port: 5000,
              path: '',
              auth: 'none',
              credentials: {username: '', password: ''},
            },
          ],
        }),
      );

      const certConfig = {
        alias: 'my-cert',
      };

      const newState = settingsStore.reducer(
        stateWithServer,
        setServerClientCertConfig({
          serverIndex: 0,
          clientCertConfig: certConfig,
        }),
      );

      expect(newState.v1.servers[0].clientCertConfig?.alias).toBe('my-cert');
      expect(newState.v1.servers[0].clientCertConfig?.password).toBeUndefined();
    });

    it('should not modify state for invalid server index', () => {
      const newState = settingsStore.reducer(
        initialState,
        setServerClientCertConfig({
          serverIndex: 999,
          clientCertConfig: {alias: 'some-cert'},
        }),
      );

      expect(newState).toEqual(initialState);
    });

    it('should update cert config for specific server in multi-server setup', () => {
      const stateWithServers = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings({
          ...initialState.v1,
          servers: [
            {
              protocol: 'https',
              host: 'server1.com',
              port: 5000,
              path: '',
              auth: 'none',
              credentials: {username: '', password: ''},
            },
            {
              protocol: 'https',
              host: 'server2.com',
              port: 5000,
              path: '',
              auth: 'none',
              credentials: {username: '', password: ''},
            },
          ],
        }),
      );

      const newState = settingsStore.reducer(
        stateWithServers,
        setServerClientCertConfig({
          serverIndex: 1,
          clientCertConfig: {alias: 'cert-for-server2'},
        }),
      );

      expect(newState.v1.servers[0].clientCertConfig).toBeUndefined();
      expect(newState.v1.servers[1].clientCertConfig?.alias).toBe(
        'cert-for-server2',
      );
    });
  });

  describe('Credentials Handling', () => {
    it('should handle basic auth credentials', () => {
      const settingsWithCreds: ISettings = {
        ...initialState.v1,
        servers: [
          {
            protocol: 'https',
            host: 'example.com',
            port: 5000,
            path: '',
            auth: 'basic',
            credentials: {username: 'user@example.com', password: 'secret'},
          },
        ],
      };

      const newState = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings(settingsWithCreds),
      );

      expect(newState.v1.servers[0].credentials.username).toBe(
        'user@example.com',
      );
      // Note: Password should not be retrieved from state in real app
      expect(newState.v1.servers[0].credentials.password).toBeDefined();
    });

    it('should handle frigate auth without credentials', () => {
      const settingsWithFrigateAuth: ISettings = {
        ...initialState.v1,
        servers: [
          {
            protocol: 'https',
            host: 'example.com',
            port: 5000,
            path: '',
            auth: 'frigate',
            credentials: {username: '', password: ''},
          },
        ],
      };

      const newState = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings(settingsWithFrigateAuth),
      );

      expect(newState.v1.servers[0].auth).toBe('frigate');
      expect(newState.v1.servers[0].credentials.username).toBe('');
    });

    it('should handle no auth configuration', () => {
      const settingsNoAuth: ISettings = {
        ...initialState.v1,
        servers: [
          {
            protocol: 'https',
            host: 'example.com',
            port: 5000,
            path: '',
            auth: 'none',
            credentials: {username: '', password: ''},
          },
        ],
      };

      const newState = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings(settingsNoAuth),
      );

      expect(newState.v1.servers[0].auth).toBe('none');
      expect(newState.v1.servers[0].credentials).toEqual({
        username: '',
        password: '',
      });
    });

    it('should preserve credentials when updating other server properties', () => {
      const stateWithCreds = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings({
          ...initialState.v1,
          servers: [
            {
              protocol: 'https',
              host: 'example.com',
              port: 5000,
              path: '',
              auth: 'basic',
              credentials: {username: 'user', password: 'pass'},
            },
          ],
        }),
      );

      const updatedSettings: ISettings = {
        ...stateWithCreds.v1,
        servers: [
          {
            ...stateWithCreds.v1.servers[0],
            host: 'new-host.com',
          },
        ],
      };

      const newState = settingsStore.reducer(
        stateWithCreds,
        settingsStore.actions.saveSettings(updatedSettings),
      );

      expect(newState.v1.servers[0].credentials.username).toBe('user');
    });
  });

  describe('Migrations', () => {
    it('should handle legacy settings without clientCertConfig', () => {
      const legacySettings: ISettings = {
        ...initialState.v1,
        servers: [
          {
            protocol: 'https',
            host: 'example.com',
            port: 5000,
            path: '',
            auth: 'basic',
            credentials: {username: 'user', password: 'pass'},
          },
        ],
      };

      const newState = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings(legacySettings),
      );

      expect(newState.v1.servers[0].clientCertConfig).toBeUndefined();
    });

    it('should preserve all server properties during migration', () => {
      const complexSettings: ISettings = {
        ...initialState.v1,
        servers: [
          {
            protocol: 'https',
            host: 'example.com',
            port: 8443,
            path: '/frigate',
            auth: 'basic',
            credentials: {username: 'admin', password: 'secret'},
            clientCertConfig: {
              alias: 'production-cert',
              password: 'cert-pass',
              allowSelfSignedServer: true,
            },
          },
        ],
        app: {
          colorScheme: 'dark',
          sendCrashReports: false,
        },
      };

      const newState = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings(complexSettings),
      );

      const server = newState.v1.servers[0];
      expect(server.protocol).toBe('https');
      expect(server.host).toBe('example.com');
      expect(server.port).toBe(8443);
      expect(server.path).toBe('/frigate');
      expect(server.auth).toBe('basic');
      expect(server.credentials.username).toBe('admin');
      expect(server.clientCertConfig?.alias).toBe('production-cert');
      expect(newState.v1.app.colorScheme).toBe('dark');
    });
  });

  describe('Initial State', () => {
    it('should provide valid initial state', () => {
      expect(initialState).toBeDefined();
      expect(initialState.v1).toBeDefined();
      expect(Array.isArray(initialState.v1.servers)).toBe(true);
      expect(initialState.v1.app).toBeDefined();
      expect(initialState.v1.locale).toBeDefined();
      expect(initialState.v1.cameras).toBeDefined();
      expect(initialState.v1.events).toBeDefined();
    });
  });
});
