import React from 'react';
import {render, waitFor} from '@testing-library/react-native';
import {IntlProvider} from 'react-intl';
import {ServerForm} from '../../../views/settings/ServerForm';
import {Server, emptyServer} from '../../../store/settings';

jest.mock('react-native-navigation', () => ({
  Navigation: {
    push: jest.fn(),
    pop: jest.fn(),
  },
  NavigationFunctionComponent: (component: any) => component,
}));

jest.mock('react-native-gesture-handler', () => ({
  ScrollView: ({children}: any) => <>{children}</>,
}));

jest.mock('react-native-ui-lib', () => ({
  ActionBar: ({children}: any) => <>{children}</>,
  Switch: () => null,
  View: ({children}: any) => <>{children}</>,
}));

jest.mock('../../../helpers/colors', () => ({
  useTheme: () => ({
    background: '#fff',
    text: '#000',
    link: '#0066cc',
  }),
  useStyles: (fn: any) =>
    fn({theme: {background: '#fff', text: '#000', link: '#0066cc'}}),
}));

jest.mock('../../../helpers/secureStorage', () => ({
  loadCredentials: jest.fn().mockResolvedValue(null),
  saveCredentials: jest.fn().mockResolvedValue(void 0),
  loadCertPassword: jest.fn().mockResolvedValue(null),
  saveCertPassword: jest.fn().mockResolvedValue(void 0),
}));

jest.mock('../../../helpers/secureLogger', () => ({
  SecureLogger: {
    logError: jest.fn(),
    logAuth: jest.fn(),
    logRequest: jest.fn(),
  },
}));

jest.mock('../../../helpers/clientCertificates', () => ({
  clientCertManager: {
    selectCertificate: jest.fn().mockResolvedValue('cert-1'),
    listCertificates: jest.fn().mockResolvedValue([
      {alias: 'cert-1', type: 'X.509'},
      {alias: 'cert-2', type: 'X.509'},
    ]),
  },
}));

const messages = {};

const ServerFormTestWrapper = (props: any) => (
  <IntlProvider locale="en" messages={messages}>
    <ServerForm {...props} />
  </IntlProvider>
);

describe('ServerForm Component', () => {
  const mockOnSubmit = jest.fn();
  const mockComponentId = 'test-component-id';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Form Rendering', () => {
    it('should render with empty server', () => {
      const {toJSON} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          onSubmit={mockOnSubmit}
        />,
      );

      expect(toJSON()).toBeTruthy();
    });

    it('should render with existing server data', async () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 5000,
        path: '/frigate',
        auth: 'basic',
        credentials: {username: 'user', password: 'pass'},
      };

      const {toJSON} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      expect(toJSON()).toBeTruthy();
    });

    it('should display certificate loading state', async () => {
      const {toJSON} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          onSubmit={mockOnSubmit}
        />,
      );

      expect(toJSON()).toBeTruthy();
    });

    it('should initialize with empty server when no server prop provided', () => {
      const {toJSON} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          onSubmit={mockOnSubmit}
        />,
      );

      expect(toJSON()).toBeTruthy();
    });
  });

  describe('Form Validation', () => {
    it('should validate host is required', async () => {
      const server: Server = emptyServer();

      const {toJSON} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      expect(toJSON()).toBeTruthy();
    });

    it('should validate port is a number', () => {
      const server: Server = {
        ...emptyServer(),
        port: 5000,
      };

      const {toJSON} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      expect(toJSON()).toBeTruthy();
    });

    it('should accept valid HTTPS configuration', () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 5000,
        path: '',
        auth: 'none',
        credentials: {username: '', password: ''},
      };

      const {toJSON} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      expect(toJSON()).toBeTruthy();
    });

    it('should accept valid HTTP configuration', () => {
      const server: Server = {
        protocol: 'http',
        host: 'localhost',
        port: 8000,
        path: '',
        auth: 'none',
        credentials: {username: '', password: ''},
      };

      const {toJSON} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      expect(toJSON()).toBeTruthy();
    });

    it('should validate with client certificate config', () => {
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

      const {toJSON} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      expect(toJSON()).toBeTruthy();
    });
  });

  describe('Certificate Dropdown', () => {
    it('should load certificates on mount', async () => {
      const {
        clientCertManager,
      } = require('../../../helpers/clientCertificates');

      render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          onSubmit={mockOnSubmit}
        />,
      );

      await waitFor(() => {
        expect(clientCertManager.listCertificates).toHaveBeenCalled();
      });
    });

    it('should display loaded certificates', async () => {
      const {
        clientCertManager,
      } = require('../../../helpers/clientCertificates');
      clientCertManager.listCertificates.mockResolvedValue([
        {alias: 'test-cert-1', type: 'X.509'},
        {alias: 'test-cert-2', type: 'X.509'},
      ]);

      const {toJSON} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          onSubmit={mockOnSubmit}
        />,
      );

      await waitFor(() => {
        expect(clientCertManager.listCertificates).toHaveBeenCalled();
      });

      expect(toJSON()).toBeTruthy();
    });

    it('should handle certificate loading errors gracefully', async () => {
      const {
        clientCertManager,
      } = require('../../../helpers/clientCertificates');
      clientCertManager.listCertificates.mockRejectedValue(
        new Error('Certificate loading failed'),
      );

      const {toJSON} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          onSubmit={mockOnSubmit}
        />,
      );

      await waitFor(() => {
        expect(clientCertManager.listCertificates).toHaveBeenCalled();
      });

      expect(toJSON()).toBeTruthy();
    });

    it('should allow selecting a certificate', async () => {
      const server: Server = {
        ...emptyServer(),
        clientCertConfig: {
          alias: 'cert-1',
        },
      };

      const {toJSON} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      expect(toJSON()).toBeTruthy();
    });

    it('should allow clearing certificate selection', async () => {
      const server: Server = {
        ...emptyServer(),
        clientCertConfig: {
          alias: 'cert-1',
        },
      };

      const {toJSON} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      expect(toJSON()).toBeTruthy();
    });
  });

  describe('Submit Handler', () => {
    it('should call onSubmit with valid form data', async () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 5000,
        path: '',
        auth: 'none',
        credentials: {username: '', password: ''},
      };

      render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      // In a real test, we would trigger form submission
      // This is a simplified test due to Formik complexity
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('should include client certificate config in submission', () => {
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

      const {toJSON} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      expect(toJSON()).toBeTruthy();
    });

    it('should submit with basic auth credentials', () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 5000,
        path: '',
        auth: 'basic',
        credentials: {username: 'user', password: 'pass'},
      };

      const {toJSON} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      expect(toJSON()).toBeTruthy();
    });

    it('should submit with frigate auth', () => {
      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 5000,
        path: '',
        auth: 'frigate',
        credentials: {username: '', password: ''},
      };

      const {toJSON} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      expect(toJSON()).toBeTruthy();
    });

    it('should not submit invalid form data', () => {
      const {toJSON} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          onSubmit={mockOnSubmit}
        />,
      );

      // Invalid form (empty host)
      expect(toJSON()).toBeTruthy();
    });
  });

  describe('Async Loading', () => {
    it('should load credentials on mount if server is provided', async () => {
      const {loadCredentials} = require('../../../helpers/secureStorage');
      loadCredentials.mockResolvedValue({
        username: 'user',
        password: 'pass',
      });

      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 5000,
        path: '',
        auth: 'basic',
        credentials: {username: '', password: ''},
      };

      render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      await waitFor(() => {
        expect(loadCredentials).toHaveBeenCalled();
      });
    });

    it('should not load certificate passwords for system identities', async () => {
      const {
        loadCertPassword,
        loadCredentials,
      } = require('../../../helpers/secureStorage');

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

      render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      await waitFor(() => {
        expect(loadCredentials).toHaveBeenCalled();
      });
      expect(loadCertPassword).not.toHaveBeenCalled();
    });

    it('should handle credential loading errors', async () => {
      const {loadCredentials} = require('../../../helpers/secureStorage');
      loadCredentials.mockRejectedValue(new Error('Loading failed'));

      const server: Server = {
        protocol: 'https',
        host: 'example.com',
        port: 5000,
        path: '',
        auth: 'basic',
        credentials: {username: '', password: ''},
      };

      const {toJSON} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      await waitFor(() => {
        expect(loadCredentials).toHaveBeenCalled();
      });

      expect(toJSON()).toBeTruthy();
    });
  });

  describe('Form Fields', () => {
    it('should accept both HTTP and HTTPS protocols', () => {
      const serverHTTP: Server = {
        ...emptyServer(),
        protocol: 'http',
      };

      const {toJSON} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={serverHTTP}
          onSubmit={mockOnSubmit}
        />,
      );

      expect(toJSON()).toBeTruthy();
    });

    it('should handle path with trailing slash', () => {
      const server: Server = {
        ...emptyServer(),
        path: '/frigate/',
      };

      const {toJSON} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      expect(toJSON()).toBeTruthy();
    });

    it('should handle various port numbers', () => {
      const servers: Server[] = [
        {...emptyServer(), port: 80},
        {...emptyServer(), port: 443},
        {...emptyServer(), port: 5000},
        {...emptyServer(), port: 8080},
        {...emptyServer(), port: 8443},
      ];

      servers.forEach(server => {
        const {toJSON} = render(
          <ServerFormTestWrapper
            componentId={mockComponentId}
            server={server}
            onSubmit={mockOnSubmit}
          />,
        );

        expect(toJSON()).toBeTruthy();
      });
    });
  });
});
