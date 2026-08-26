import {settingsStore, setServerClientCertConfig} from '../../store/settings';

describe('ClientCertConfig Redux', () => {
  describe('setServerClientCertConfig action', () => {
    it('should set client cert config for a server', () => {
      const initialState = settingsStore.getInitialState();

      // Add a server to the state first
      const stateWithServer = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings({
          ...initialState.v1,
          servers: [
            {
              protocol: 'https',
              host: 'localhost',
              port: 5000,
              path: '',
              auth: 'none',
              credentials: {username: '', password: ''},
            },
          ],
        }),
      );

      const certConfig = {
        alias: 'my-client-cert',
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

      // State should have been updated
      expect(newState).toBeDefined();
      expect(newState.v1.servers[0].clientCertConfig).toEqual(certConfig);
    });

    it('should set allowSelfSignedServer to true when configured', () => {
      const initialState = settingsStore.getInitialState();

      const stateWithServer = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings({
          ...initialState.v1,
          servers: [
            {
              protocol: 'https',
              host: 'localhost',
              port: 5000,
              path: '',
              auth: 'none',
              credentials: {username: '', password: ''},
            },
          ],
        }),
      );

      const certConfig = {
        alias: 'my-client-cert',
        allowSelfSignedServer: true,
      };

      const newState = settingsStore.reducer(
        stateWithServer,
        setServerClientCertConfig({
          serverIndex: 0,
          clientCertConfig: certConfig,
        }),
      );

      expect(
        newState.v1.servers[0].clientCertConfig?.allowSelfSignedServer,
      ).toBe(true);
    });

    it('should clear client cert config when undefined', () => {
      const initialState = settingsStore.getInitialState();

      // Add a server with cert config
      const stateWithServer = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings({
          ...initialState.v1,
          servers: [
            {
              protocol: 'https',
              host: 'localhost',
              port: 5000,
              path: '',
              auth: 'none',
              credentials: {username: '', password: ''},
              clientCertConfig: {alias: 'some-cert'},
            },
          ],
        }),
      );

      const newState = settingsStore.reducer(
        stateWithServer,
        setServerClientCertConfig({
          serverIndex: 0,
          clientCertConfig: undefined,
        }),
      );

      expect(newState).toBeDefined();
      expect(newState.v1.servers[0].clientCertConfig).toBeUndefined();
    });

    it('should not modify state if server index is invalid', () => {
      const initialState = settingsStore.getInitialState();

      const newState = settingsStore.reducer(
        initialState,
        setServerClientCertConfig({
          serverIndex: 999,
          clientCertConfig: {
            alias: 'some-cert',
          },
        }),
      );

      // State should remain unchanged since server doesn't exist
      expect(newState).toEqual(initialState);
    });

    it('should update cert config for second server in multi-server setup', () => {
      const initialState = settingsStore.getInitialState();

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

    it('should preserve existing cert config when updating password only', () => {
      const initialState = settingsStore.getInitialState();

      const stateWithCert = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings({
          ...initialState.v1,
          servers: [
            {
              protocol: 'https',
              host: 'localhost',
              port: 5000,
              path: '',
              auth: 'none',
              credentials: {username: '', password: ''},
              clientCertConfig: {
                alias: 'my-cert',
                allowSelfSignedServer: true,
              },
            },
          ],
        }),
      );

      const updatedConfig = {
        alias: 'my-cert',
        password: 'new-password',
        allowSelfSignedServer: true,
      };

      const newState = settingsStore.reducer(
        stateWithCert,
        setServerClientCertConfig({
          serverIndex: 0,
          clientCertConfig: updatedConfig,
        }),
      );

      expect(newState.v1.servers[0].clientCertConfig?.alias).toBe('my-cert');
      expect(newState.v1.servers[0].clientCertConfig?.password).toBe(
        'new-password',
      );
      expect(newState.v1.servers[0].clientCertConfig?.allowSelfSignedServer).toBe(
        true,
      );
    });

    it('should handle switching between certificates', () => {
      const initialState = settingsStore.getInitialState();

      const stateWithCert = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings({
          ...initialState.v1,
          servers: [
            {
              protocol: 'https',
              host: 'localhost',
              port: 5000,
              path: '',
              auth: 'none',
              credentials: {username: '', password: ''},
              clientCertConfig: {alias: 'cert-1'},
            },
          ],
        }),
      );

      const newState = settingsStore.reducer(
        stateWithCert,
        setServerClientCertConfig({
          serverIndex: 0,
          clientCertConfig: {alias: 'cert-2'},
        }),
      );

      expect(newState.v1.servers[0].clientCertConfig?.alias).toBe('cert-2');
    });

    it('should handle negative index gracefully', () => {
      const initialState = settingsStore.getInitialState();

      const newState = settingsStore.reducer(
        initialState,
        setServerClientCertConfig({
          serverIndex: -1,
          clientCertConfig: {alias: 'cert'},
        }),
      );

      expect(newState).toEqual(initialState);
    });
  });

  describe('Multiple certificate configurations', () => {
    it('should independently configure different certificates for multiple servers', () => {
      const initialState = settingsStore.getInitialState();

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
            {
              protocol: 'https',
              host: 'server3.com',
              port: 5000,
              path: '',
              auth: 'none',
              credentials: {username: '', password: ''},
            },
          ],
        }),
      );

      let state = stateWithServers;
      state = settingsStore.reducer(
        state,
        setServerClientCertConfig({
          serverIndex: 0,
          clientCertConfig: {
            alias: 'cert-1',
            allowSelfSignedServer: false,
          },
        }),
      );

      state = settingsStore.reducer(
        state,
        setServerClientCertConfig({
          serverIndex: 1,
          clientCertConfig: {
            alias: 'cert-2',
            allowSelfSignedServer: true,
          },
        }),
      );

      state = settingsStore.reducer(
        state,
        setServerClientCertConfig({
          serverIndex: 2,
          clientCertConfig: {
            alias: 'cert-3',
            password: 'secret',
          },
        }),
      );

      expect(state.v1.servers[0].clientCertConfig?.alias).toBe('cert-1');
      expect(state.v1.servers[0].clientCertConfig?.allowSelfSignedServer).toBe(
        false,
      );
      expect(state.v1.servers[1].clientCertConfig?.alias).toBe('cert-2');
      expect(state.v1.servers[1].clientCertConfig?.allowSelfSignedServer).toBe(
        true,
      );
      expect(state.v1.servers[2].clientCertConfig?.alias).toBe('cert-3');
      expect(state.v1.servers[2].clientCertConfig?.password).toBe('secret');
    });

    it('should clear specific certificate without affecting others', () => {
      const initialState = settingsStore.getInitialState();

      const stateWithCerts = settingsStore.reducer(
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
              clientCertConfig: {alias: 'cert-1'},
            },
            {
              protocol: 'https',
              host: 'server2.com',
              port: 5000,
              path: '',
              auth: 'none',
              credentials: {username: '', password: ''},
              clientCertConfig: {alias: 'cert-2'},
            },
          ],
        }),
      );

      const newState = settingsStore.reducer(
        stateWithCerts,
        setServerClientCertConfig({
          serverIndex: 0,
          clientCertConfig: undefined,
        }),
      );

      expect(newState.v1.servers[0].clientCertConfig).toBeUndefined();
      expect(newState.v1.servers[1].clientCertConfig?.alias).toBe('cert-2');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty alias', () => {
      const initialState = settingsStore.getInitialState();

      const stateWithServer = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings({
          ...initialState.v1,
          servers: [
            {
              protocol: 'https',
              host: 'localhost',
              port: 5000,
              path: '',
              auth: 'none',
              credentials: {username: '', password: ''},
            },
          ],
        }),
      );

      const certConfig = {
        alias: '',
      };

      const newState = settingsStore.reducer(
        stateWithServer,
        setServerClientCertConfig({
          serverIndex: 0,
          clientCertConfig: certConfig,
        }),
      );

      expect(newState.v1.servers[0].clientCertConfig?.alias).toBe('');
    });

    it('should handle certificate alias with special characters', () => {
      const initialState = settingsStore.getInitialState();

      const stateWithServer = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings({
          ...initialState.v1,
          servers: [
            {
              protocol: 'https',
              host: 'localhost',
              port: 5000,
              path: '',
              auth: 'none',
              credentials: {username: '', password: ''},
            },
          ],
        }),
      );

      const certConfig = {
        alias: 'my-cert/2024@prod#test',
      };

      const newState = settingsStore.reducer(
        stateWithServer,
        setServerClientCertConfig({
          serverIndex: 0,
          clientCertConfig: certConfig,
        }),
      );

      expect(newState.v1.servers[0].clientCertConfig?.alias).toBe(
        'my-cert/2024@prod#test',
      );
    });

    it('should handle allowSelfSignedServer false explicitly', () => {
      const initialState = settingsStore.getInitialState();

      const stateWithServer = settingsStore.reducer(
        initialState,
        settingsStore.actions.saveSettings({
          ...initialState.v1,
          servers: [
            {
              protocol: 'https',
              host: 'localhost',
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
        allowSelfSignedServer: false,
      };

      const newState = settingsStore.reducer(
        stateWithServer,
        setServerClientCertConfig({
          serverIndex: 0,
          clientCertConfig: certConfig,
        }),
      );

      expect(newState.v1.servers[0].clientCertConfig?.allowSelfSignedServer).toBe(
        false,
      );
    });
  });
});
