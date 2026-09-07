import {Buffer} from 'buffer';
import {
  buildServerUrl,
  buildServerApiUrl,
  authorizationHeader,
  executeServerRequest,
  useRest,
} from '../../helpers/rest';
import {httpClientWithCert} from '../../helpers/httpWithClientCert';
import {Server} from '../../store/settings';

jest.mock('@react-native-async-storage/async-storage');
jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn(),
  getGenericPassword: jest.fn(),
  resetGenericPassword: jest.fn(),
}));

jest.mock('react-intl', () => ({
  useIntl: () => ({
    formatMessage: jest.fn((message) => message.defaultMessage || 'Error'),
  }),
}));

jest.mock('../../helpers/secureLogger', () => ({
  SecureLogger: {
    logAuth: jest.fn(),
    logRequest: jest.fn(),
    logError: jest.fn(),
  },
}));

jest.mock('../../helpers/rest.messages', () => ({
  messages: {
    'error.unauthorized': {defaultMessage: 'Unauthorized'},
    'frigateAuth.wrongCredentials': {defaultMessage: 'Wrong credentials'},
  },
}));

jest.mock('../../helpers/httpWithClientCert', () => ({
  httpClientWithCert: {
    request: jest.fn(),
  },
}));

describe('REST API Helper', () => {
  const clientCertRequest = httpClientWithCert.request as jest.Mock;

  beforeEach(() => {
    clientCertRequest.mockReset();
    Reflect.deleteProperty(httpClientWithCert, 'scopeServerIdentity');
    Reflect.deleteProperty(httpClientWithCert, 'resolveServerRoute');
  });

  describe('buildServerUrl', () => {
    it('should build server URL with protocol, host, and port', () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 5000,
        path: '',
        auth: 'none',
        credentials: {username: '', password: ''},
      };

      const url = buildServerUrl(server);
      expect(url).toBe('https://example.com:5000/');
    });

    it('should build server URL with path', () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 5000,
        path: '/frigate/api',
        auth: 'none',
        credentials: {username: '', password: ''},
      };

      const url = buildServerUrl(server);
      expect(url).toBe('https://example.com:5000/frigate/api/');
    });

    it('should build server URL without port when port is undefined', () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 0,
        path: '',
        auth: 'none',
        credentials: {username: '', password: ''},
      };

      const url = buildServerUrl(server);
      expect(url).toContain('https://example.com');
    });

    it('should handle path with leading and trailing slashes', () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 5000,
        path: '/frigate/api/',
        auth: 'none',
        credentials: {username: '', password: ''},
      };

      const url = buildServerUrl(server);
      expect(url).toBe('https://example.com:5000/frigate/api/');
    });

    it('preserves encoded path spellings in actual request endpoints', () => {
      const encoded: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 5000,
        path: '/tenant%20/api',
        auth: 'none',
        credentials: {username: '', password: ''},
      };
      const literal = {...encoded, path: '/tenant/api'};

      expect(buildServerUrl(encoded)).not.toBe(buildServerUrl(literal));
    });

    it('should return undefined when protocol is missing', () => {
      const server: Server = {
        protocol: '' as 'https',
        host: 'example.com',
        port: 5000,
        path: '',
        auth: 'none',
        credentials: {username: '', password: ''},
      };

      const url = buildServerUrl(server);
      expect(url).toBeUndefined();
    });

    it('should return undefined when host is missing', () => {
      const server: Server = {
        protocol: 'https',
        host: '',
        port: 5000,
        path: '',
        auth: 'none',
        credentials: {username: '', password: ''},
      };

      const url = buildServerUrl(server);
      expect(url).toBeUndefined();
    });
  });

  describe('buildServerApiUrl', () => {
    it('should build API URL from server URL', () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 5000,
        path: '',
        auth: 'none',
        credentials: {username: '', password: ''},
      };

      const url = buildServerApiUrl(server);
      expect(url).toBe('https://example.com:5000/api');
    });

    it('should build API URL with custom path', () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 5000,
        path: '/frigate',
        auth: 'none',
        credentials: {username: '', password: ''},
      };

      const url = buildServerApiUrl(server);
      expect(url).toBe('https://example.com:5000/frigate/api');
    });

    it('should return undefined when server URL is undefined', () => {
      const server: Server = {
        protocol: '' as 'https',
        host: '',
        port: 5000,
        path: '',
        auth: 'none',
        credentials: {username: '', password: ''},
      };

      const url = buildServerApiUrl(server);
      expect(url).toBeUndefined();
    });
  });

  describe('authorizationHeader', () => {
    it('should return Basic auth header for basic auth', () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 5000,
        path: '',
        auth: 'basic',
        credentials: {username: 'user', password: 'pass'},
      };

      const header = authorizationHeader(server);
      const expectedAuth = Buffer.from('user:pass').toString('base64');
      expect(header.Authorization).toBe(`Basic ${expectedAuth}`);
    });

    it('should return empty object for frigate auth', () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 5000,
        path: '',
        auth: 'frigate',
        credentials: {username: '', password: ''},
      };

      const header = authorizationHeader(server);
      expect(header).toEqual({});
    });

    it('should return empty object for no auth', () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 5000,
        path: '',
        auth: 'none',
        credentials: {username: '', password: ''},
      };

      const header = authorizationHeader(server);
      expect(header).toEqual({});
    });

    it('should encode credentials with special characters correctly', () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 5000,
        path: '',
        auth: 'basic',
        credentials: {username: 'user@example.com', password: 'p@ss:word'},
      };

      const header = authorizationHeader(server);
      const expectedAuth = Buffer.from('user@example.com:p@ss:word').toString('base64');
      expect(header.Authorization).toBe(`Basic ${expectedAuth}`);
    });
  });

  describe('Client Certificate Integration', () => {
    it('scopes local requests by profile and credentials before native transport', async () => {
      const scopeServerIdentity = jest.fn(() => 'opaque-local-session');
      Object.assign(httpClientWithCert, {
        scopeServerIdentity,
        resolveServerRoute: jest.fn().mockResolvedValue({
          route: 'local',
          baseUrl: 'https://192.168.1.20:8971/',
          generation: 1,
        }),
      });
      clientCertRequest.mockResolvedValue({
        status: 200,
        headers: {},
        body: '{}',
        json: async () => ({}),
        text: async () => '{}',
      });
      const server: Server = {
        profileId: 'local-profile',
        protocol: 'https',
        host: 'remote.example',
        port: 443,
        path: '',
        auth: 'frigate',
        credentials: {username: 'viewer', password: 'secret'},
        localRoutingEnabled: true,
        localEndpoint: {
          protocol: 'https',
          host: '192.168.1.20',
          port: 8971,
          basePath: '',
        },
      };

      await executeServerRequest(
        server,
        'https://remote.example:443/api/config',
        {method: 'GET'},
      );

      expect(scopeServerIdentity).toHaveBeenCalledWith(
        expect.stringContaining('"profileId":"local-profile"'),
        'frigate',
        'viewer',
        'secret',
      );
      expect(clientCertRequest).toHaveBeenCalledWith(
        'https://192.168.1.20:8971/api/config',
        expect.objectContaining({
          clientCertServerIdentity: 'opaque-local-session',
        }),
      );
    });

    it('uses the client-certificate transport for Frigate login and retry', async () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 443,
        path: '',
        auth: 'frigate',
        credentials: {username: 'user', password: 'password'},
        clientCertConfig: {
          alias: 'my-cert',
        },
      };
      const response = (
        status: number,
        body: string,
        headers: Record<string, string> = {},
      ) => ({
        status,
        headers,
        body,
        json: async () => JSON.parse(body),
        text: async () => body,
      });
      clientCertRequest
        .mockResolvedValueOnce(response(401, 'Unauthorized'))
        .mockResolvedValueOnce(response(200, '{"success":true}'))
        .mockResolvedValueOnce(
          response(200, '{"mqtt":{"enabled":false}}', {
            'content-type': 'application/json',
          }),
        );

      const result = await useRest().get(server, 'config');

      expect(result).toEqual({mqtt: {enabled: false}});
      expect(clientCertRequest).toHaveBeenCalledTimes(3);
      expect(clientCertRequest).toHaveBeenNthCalledWith(
        2,
        'https://example.com:443/api/login',
        expect.objectContaining({
          method: 'POST',
          clientCertAlias: 'my-cert',
          clientCertServerIdentity: JSON.stringify({
            endpoint: encodeURIComponent('https://example.com:443'),
            clientCertAlias: encodeURIComponent('my-cert'),
          }),
        }),
      );
      expect(clientCertRequest).toHaveBeenNthCalledWith(
        3,
        'https://example.com:443/api/config',
        expect.objectContaining({
          method: 'GET',
          clientCertAlias: 'my-cert',
          clientCertServerIdentity: JSON.stringify({
            endpoint: encodeURIComponent('https://example.com:443'),
            clientCertAlias: encodeURIComponent('my-cert'),
          }),
        }),
      );
    });

    it('preserves an opaque whitespace-containing certificate alias', async () => {
      const alias = '  selected identity  ';
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 443,
        path: '/frigate',
        auth: 'none',
        credentials: {username: '', password: ''},
        clientCertConfig: {alias},
      };
      clientCertRequest.mockResolvedValue({
        status: 200,
        headers: {'content-type': 'application/json'},
        body: '{"ok":true}',
        json: async () => ({ok: true}),
        text: async () => '{"ok":true}',
      });

      await expect(useRest().get(server, 'config')).resolves.toEqual({
        ok: true,
      });
      expect(clientCertRequest).toHaveBeenCalledWith(
        'https://example.com:443/frigate/api/config',
        expect.objectContaining({
          clientCertAlias: alias,
          clientCertServerIdentity: JSON.stringify({
            endpoint: encodeURIComponent(
              'https://example.com:443/frigate',
            ),
            clientCertAlias: encodeURIComponent(alias),
          }),
        }),
      );
    });

    it('does not use a stale certificate when mTLS is disabled', async () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 443,
        path: '',
        auth: 'none',
        credentials: {username: '', password: ''},
        mtlsEnabled: false,
        clientCertConfig: {alias: 'stale-cert'},
      };
      clientCertRequest.mockResolvedValue({
        status: 200,
        headers: {'content-type': 'application/json'},
        body: '{"ok":true}',
        json: async () => ({ok: true}),
        text: async () => '{"ok":true}',
      });

      await expect(useRest().get(server, 'config')).resolves.toEqual({
        ok: true,
      });
      expect(clientCertRequest).toHaveBeenCalledWith(
        'https://example.com:443/api/config',
        expect.objectContaining({
          clientCertServerIdentity: JSON.stringify({
            endpoint: encodeURIComponent('https://example.com:443'),
            clientCertAlias: '',
          }),
        }),
      );
      expect(clientCertRequest.mock.calls[0][1]).not.toHaveProperty(
        'clientCertAlias',
      );
    });

    it('should support server with client certificate config', () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 5000,
        path: '',
        auth: 'none',
        credentials: {username: '', password: ''},
        clientCertConfig: {
          alias: 'my-cert',
          allowSelfSignedServer: true,
        },
      };

      expect(server.clientCertConfig?.alias).toBe('my-cert');
      expect(server.clientCertConfig?.allowSelfSignedServer).toBe(true);
    });

    it('should support server without client certificate config', () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 5000,
        path: '',
        auth: 'none',
        credentials: {username: '', password: ''},
      };

      expect(server.clientCertConfig).toBeUndefined();
    });

    it('should handle client cert with only alias', () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 5000,
        path: '',
        auth: 'none',
        credentials: {username: '', password: ''},
        clientCertConfig: {
          alias: 'my-cert',
        },
      };

      expect(server.clientCertConfig?.alias).toBeDefined();
      expect(server.clientCertConfig?.allowSelfSignedServer).toBeUndefined();
    });
  });

    it('does not replay a non-idempotent request after Frigate reauthentication', async () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 443,
        path: '',
        auth: 'frigate',
        credentials: {username: 'user', password: 'password'},
      };
      const response = (status: number, body: string) => ({
        status,
        headers: {},
        body,
        json: async () => JSON.parse(body),
        text: async () => body,
      });
      clientCertRequest
        .mockResolvedValueOnce(response(401, 'Unauthorized'))
        .mockResolvedValueOnce(response(200, '{"success":true}'));

      await expect(useRest().post(server, 'config')).rejects.toBeDefined();
      expect(clientCertRequest).toHaveBeenCalledTimes(2);
      expect(clientCertRequest.mock.calls[1][0]).toBe(
        'https://example.com:443/api/login',
      );
    });

  describe('Error Handling', () => {
    it('should handle missing server configuration', () => {
      const invalidServer: Partial<Server> = {
        protocol: 'https',
      };

      const url = buildServerUrl(invalidServer as Server);
      expect(url).toBeUndefined();
    });

    it('should handle multiple consecutive slashes in path', () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 5000,
        path: '/frigate///api///v1',
        auth: 'none',
        credentials: {username: '', password: ''},
      };

      const url = buildServerUrl(server);
      expect(url).toContain('frigate/api/v1');
    });
  });

  describe('Fallback when Certificate missing', () => {
    it('should work with basic auth when client cert is not configured', () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 5000,
        path: '',
        auth: 'basic',
        credentials: {username: 'user', password: 'pass'},
      };

      const header = authorizationHeader(server);
      expect(header.Authorization).toBeDefined();
      expect(server.clientCertConfig).toBeUndefined();
    });

    it('should build URL correctly when client cert is missing', () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 5000,
        path: '/api',
        auth: 'none',
        credentials: {username: '', password: ''},
      };

      const url = buildServerApiUrl(server);
      expect(url).toBe('https://example.com:5000/api/api');
      expect(server.clientCertConfig).toBeUndefined();
    });

    it('should handle mixed auth and cert configuration', () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 5000,
        path: '',
        auth: 'basic',
        credentials: {username: 'user', password: 'pass'},
        clientCertConfig: {
          alias: 'cert-alias',
          allowSelfSignedServer: false,
        },
      };

      const header = authorizationHeader(server);
      expect(header.Authorization).toBeDefined();
      expect(server.clientCertConfig).toBeDefined();
      expect(server.clientCertConfig?.alias).toBe('cert-alias');
    });
  });
});
