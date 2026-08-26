import {Buffer} from 'buffer';
import {
  buildServerUrl,
  buildServerApiUrl,
  authorizationHeader,
} from '../../helpers/rest';
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
          password: 'cert-password',
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
      expect(server.clientCertConfig?.password).toBeUndefined();
      expect(server.clientCertConfig?.allowSelfSignedServer).toBeUndefined();
    });
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
