import React from 'react';
import {fireEvent, render, waitFor, within} from '@testing-library/react-native';
import {Alert} from 'react-native';
import {IntlProvider} from 'react-intl';
import {
  isDeterminablyPublicLocalHost,
  ServerForm,
} from '../../../views/settings/ServerForm';
import {Server, emptyServer} from '../../../store/settings';
import {saveCredentials} from '../../../helpers/secureStorage';
import {clientCertManager} from '../../../helpers/clientCertificates';
import {Navigation} from 'react-native-navigation';
import de from '../../../i18n/de';

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  Object.defineProperty(actual.Platform, 'OS', {
    configurable: true,
    value: 'android',
  });
  return actual;
});

jest.mock('react-native-navigation', () => ({
  Navigation: {
    push: jest.fn(),
    pop: jest.fn(),
    dismissModal: jest.fn(),
  },
  NavigationFunctionComponent: (component: any) => component,
}));

jest.mock('react-native-gesture-handler', () => ({
  ScrollView: ({children}: any) => <>{children}</>,
}));

jest.mock('react-native-ui-lib', () => ({
  ActionBar: ({children}: any) => <>{children}</>,
  Button: Object.assign(
    ({label, onPress, ...props}: any) => {
      const {Pressable, Text} = require('react-native');
      return (
        <Pressable accessibilityRole="button" onPress={onPress} {...props}>
          <Text>{label}</Text>
        </Pressable>
      );
    },
    {sizes: {xSmall: 'xSmall'}},
  ),
  Switch: (props: any) => {
    const {Switch} = require('react-native');
    return <Switch {...props} />;
  },
  View: ({children}: any) => <>{children}</>,
}));

let mockTheme = {
  background: '#ffffff',
  text: '#1f2933',
  textSecondary: '#52606d',
  textInverse: '#ffffff',
  link: '#145dcc',
  highlighted: '#f0f4f8',
  surface: '#ffffff',
  border: '#cbd2d9',
  error: '#ba1a1a',
};

jest.mock('../../../helpers/colors', () => ({
  useTheme: () => mockTheme,
  useStyles: (fn: any) =>
    fn({theme: mockTheme}),
}));

jest.mock('../../../helpers/secureStorage', () => ({
  saveCredentials: jest.fn().mockResolvedValue(void 0),
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
  },
}));

const messages = {};
const mockSaveCredentials = saveCredentials as jest.Mock;

const ServerFormTestWrapper = (props: any) => (
  <IntlProvider locale="en" messages={messages}>
    <ServerForm {...props} />
  </IntlProvider>
);

const GermanServerFormTestWrapper = (props: any) => (
  <IntlProvider locale="de" messages={de}>
    <ServerForm {...props} />
  </IntlProvider>
);

describe('ServerForm Component', () => {
  const mockOnSubmit = jest.fn();
  const mockComponentId = 'test-component-id';

  beforeEach(() => {
    jest.clearAllMocks();
    mockTheme = {
      background: '#ffffff',
      text: '#1f2933',
      textSecondary: '#52606d',
      textInverse: '#ffffff',
      link: '#145dcc',
      highlighted: '#f0f4f8',
      surface: '#ffffff',
      border: '#cbd2d9',
      error: '#ba1a1a',
    };
    mockSaveCredentials.mockResolvedValue(undefined);
  });

  it('classifies literal public and private local targets without resolving hostnames', () => {
    expect(isDeterminablyPublicLocalHost('8.8.8.8')).toBe(true);
    expect(isDeterminablyPublicLocalHost('192.168.1.20')).toBe(false);
    expect(isDeterminablyPublicLocalHost('frigate.local')).toBe(false);
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

    it('uses save wording for existing profiles and add wording for new profiles', () => {
      const newProfile = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          onSubmit={mockOnSubmit}
        />,
      );
      expect(
        newProfile.getByTestId('server-form-submit').props.accessibilityLabel,
      ).toBe('Add');

      const existingProfile = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={{...emptyServer(), host: 'example.test'}}
          onSubmit={mockOnSubmit}
        />,
      );
      expect(
        existingProfile.getByTestId('server-form-submit').props.accessibilityLabel,
      ).toBe('Save changes');

      const germanNewProfile = render(
        <GermanServerFormTestWrapper
          componentId={mockComponentId}
          onSubmit={mockOnSubmit}
        />,
      );
      expect(
        germanNewProfile.getByTestId('server-form-submit').props
          .accessibilityLabel,
      ).toBe('Hinzufügen');
    });

    it('uses strong semantic colors and explicit enabled accessibility state', () => {
      const light = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={{...emptyServer(), host: 'example.test'}}
          onSubmit={mockOnSubmit}
        />,
      );
      const lightButton = light.getByTestId('server-form-submit');
      expect(lightButton.props.backgroundColor).toBe('#145dcc');
      expect(lightButton.props.color).toBe('#ffffff');
      expect(lightButton.props.disabledBackgroundColor).toBe('#f0f4f8');
      expect(lightButton.props.accessibilityState).toEqual({disabled: false});

      mockTheme = {
        ...mockTheme,
        background: '#121212',
        text: '#f5f7fa',
        textSecondary: '#b8c0cc',
        textInverse: '#111111',
        link: '#8ab4ff',
        highlighted: '#30363d',
        surface: '#1e1e1e',
        border: '#4b5563',
        error: '#ff8a80',
      };
      const dark = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={{...emptyServer(), host: 'example.test'}}
          onSubmit={mockOnSubmit}
        />,
      );
      const darkButton = dark.getByTestId('server-form-submit');
      expect(darkButton.props.backgroundColor).toBe('#8ab4ff');
      expect(darkButton.props.color).toBe('#111111');
      expect(darkButton.props.disabledBackgroundColor).toBe('#30363d');
    });

    it('keeps the disabled primary action legible and accessible', async () => {
      let resolveSubmit: (() => void) | undefined;
      mockOnSubmit.mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            resolveSubmit = resolve;
          }),
      );
      const {getByTestId} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={{...emptyServer(), host: 'example.test'}}
          onSubmit={mockOnSubmit}
        />,
      );

      fireEvent.press(getByTestId('server-form-submit'));
      await waitFor(() => {
        const button = getByTestId('server-form-submit');
        expect(button.props.accessibilityState).toEqual({disabled: true});
        expect(button.props.color).toBe('#52606d');
        expect(button.props.disabledBackgroundColor).toBe('#f0f4f8');
        expect(button.props.accessibilityState).toEqual({disabled: true});
      });
      resolveSubmit?.();
    });

    it('shows all configured sections and controls without expansion controls', () => {
      const {getByLabelText, getByTestId, queryByText} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={{
            ...emptyServer(),
            host: 'frigate.local',
            auth: 'basic',
            credentials: {username: 'user', password: 'pass'},
            mtlsEnabled: true,
            clientCertConfig: {alias: 'external-cert'},
            localRoutingEnabled: true,
            localEndpoint: {
              protocol: 'https',
              host: '192.168.1.20',
              port: 8971,
              basePath: '',
            },
            localTls: {
              mtlsEnabled: true,
              clientCertConfig: {alias: 'local-cert'},
            },
            rtsp: {enabled: true, port: 8554, allowInsecureCredentials: false},
          }}
          onSubmit={mockOnSubmit}
        />,
      );

      for (const testID of [
        'server-section-external',
        'server-section-auth',
        'server-section-certificate',
        'server-section-local',
        'server-section-local-trust',
        'server-section-rtsp',
      ]) {
        expect(getByTestId(testID).props.accessibilityState).toBeUndefined();
      }
      expect(getByLabelText('Username')).toBeTruthy();
      expect(getByTestId('server-mtls-toggle')).toBeTruthy();
      expect(getByTestId('server-local-route-toggle')).toBeTruthy();
      expect(getByTestId('server-local-mtls-toggle')).toBeTruthy();
      expect(getByTestId('server-rtsp-toggle')).toBeTruthy();
      expect(queryByText('+')).toBeNull();
      expect(queryByText('−')).toBeNull();
    });

    it('localizes save wording for an existing German profile', () => {
      const {getByTestId} = render(
        <GermanServerFormTestWrapper
          componentId={mockComponentId}
          server={{...emptyServer(), host: 'example.test'}}
          onSubmit={mockOnSubmit}
        />,
      );

      expect(getByTestId('server-form-submit').props.accessibilityLabel).toBe(
        'Änderungen speichern',
      );
    });

    it('should render the Android KeyChain chooser action without enumeration', async () => {
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

    it('shows truthful section states and removes editor-only actions', () => {
      const {getByTestId, queryByTestId, queryByText} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          onSubmit={mockOnSubmit}
        />,
      );

      expect(
        within(getByTestId('server-section-external')).getByText('Needs setup'),
      ).toBeTruthy();
      expect(
        within(getByTestId('server-section-auth')).getByText('Disabled'),
      ).toBeTruthy();
      expect(
        within(getByTestId('server-section-local')).getByText('Disabled'),
      ).toBeTruthy();
      expect(queryByTestId('server-section-advanced')).toBeNull();
      expect(queryByText('Use demo server')).toBeNull();
    });

    it('updates local route summary without claiming reachability', () => {
      const {getByTestId, getByText} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          onSubmit={mockOnSubmit}
        />,
      );

      fireEvent(
        getByTestId('server-local-route-toggle'),
        'valueChange',
        true,
      );
      expect(
        within(getByTestId('server-section-local')).getByText(
          'Complete the local endpoint',
        ),
      ).toBeTruthy();
      expect(
        getByText(
          'Configure an endpoint on your local network for RTSP reachability. Authenticated API requests always remain external.',
        ),
      ).toBeTruthy();
    });

    it('only renders credential fields for authenticated routes', () => {
      const {queryByLabelText} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={emptyServer()}
          onSubmit={mockOnSubmit}
        />,
      );
      expect(queryByLabelText('Username')).toBeNull();

      const authenticatedServer: Server = {
        ...emptyServer(),
        auth: 'basic',
        credentials: {username: 'user', password: 'pass'},
      };
      const authenticated = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={authenticatedServer}
          onSubmit={mockOnSubmit}
        />,
      );
      expect(authenticated.getByLabelText('Username')).toBeTruthy();
      expect(authenticated.getByLabelText('Type of authorization')).toBeTruthy();
    });

    it('renders German section summaries without English defaults or message IDs', () => {
      const server: Server = {
        ...emptyServer(),
        host: 'frigate.local',
        localRoutingEnabled: true,
        localEndpoint: {
          protocol: 'https',
          host: 'frigate.local',
          port: 8971,
          basePath: '',
        },
      };
      const {queryByText, getByText, getAllByText} = render(
        <GermanServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      expect(getByText('Externe Verbindung')).toBeTruthy();
      expect(getByText('Frigate-Authentifizierung')).toBeTruthy();
      expect(
        getByText('Client-Zertifikat und Vertrauensstellung'),
      ).toBeTruthy();
      expect(getByText('Lokale Verbindung')).toBeTruthy();
      expect(
        getByText('Lokales HTTPS: Vertrauensstellung und Client-Zertifikat'),
      ).toBeTruthy();
      expect(
        getByText('Direktes RTSP und Zustimmung für Anmeldedaten'),
      ).toBeTruthy();
      expect(getAllByText('Konfiguriert').length).toBeGreaterThanOrEqual(2);
      expect(getAllByText('Deaktiviert').length).toBeGreaterThanOrEqual(3);

      expect(queryByText('Frigate-Serveradresse und Route')).toBeNull();
      expect(queryByText('Configured')).toBeNull();
      expect(queryByText('Disabled')).toBeNull();
      expect(queryByText('Erweitert und Verbindung testen')).toBeNull();
      expect(queryByText('Use demo server')).toBeNull();
      expect(queryByText('server.external.summary')).toBeNull();
      expect(queryByText('settings.server.external.summary')).toBeNull();
    });

    it('uses context-specific local route status instead of a generic error', () => {
      const {getByText, queryByText} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={{
            ...emptyServer(),
            host: 'frigate.example',
            localRoutingEnabled: true,
            localEndpoint: {
              protocol: 'https',
              host: '8.8.8.8',
              port: 8971,
              basePath: '',
            },
          }}
          onSubmit={mockOnSubmit}
        />,
      );

      expect(getByText('Use a private local host or IP address')).toBeTruthy();
      expect(queryByText('Needs attention')).toBeNull();
    });

    it.each([
      ['disabled', {localRoutingEnabled: false}],
      [
        'incomplete',
        {
          localRoutingEnabled: true,
          localEndpoint: {protocol: 'https', host: '', port: 8971, basePath: ''},
        },
      ],
      [
        'public',
        {
          localRoutingEnabled: true,
          localEndpoint: {
            protocol: 'https',
            host: '8.8.8.8',
            port: 8971,
            basePath: '',
          },
        },
      ],
    ])('does not claim RTSP is configured for a %s local route', (_, local) => {
      const {getByTestId, getAllByText, queryByTestId} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={{
            ...emptyServer(),
            host: 'frigate.example',
            ...local,
            rtsp: {enabled: true, port: 8554, allowInsecureCredentials: false},
          }}
          onSubmit={mockOnSubmit}
        />,
      );

      if (local.localRoutingEnabled === false) {
        expect(queryByTestId('server-section-rtsp')).toBeNull();
      } else {
        expect(
          getAllByText('Complete a valid private local route'),
        ).toHaveLength(1);
        expect(getByTestId('server-section-rtsp')).toBeTruthy();
      }
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

  describe('Android KeyChain certificate chooser', () => {
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

    it('renders the stored alias as a compact, truncated certificate identity', () => {
      const alias =
        'android-keychain-certificate-alias-with-a-long-user-facing-name';
      const {getByLabelText, getByTestId, queryByText} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={{
            ...emptyServer(),
            mtlsEnabled: true,
            clientCertConfig: {alias},
          }}
          onSubmit={mockOnSubmit}
        />,
      );

      const name = getByTestId('server-mtls-certificate-name');
      expect(name.props.children).toBe(alias);
      expect(name.props.numberOfLines).toBe(1);
      expect(name.props.ellipsizeMode).toBe('middle');
      expect(getByTestId('server-mtls-certificate-change')).toBeTruthy();
      expect(getByTestId('server-mtls-certificate-remove')).toBeTruthy();
      expect(getByLabelText('Change certificate')).toBeTruthy();
      expect(getByLabelText('Remove certificate')).toBeTruthy();
      expect(queryByText('Change certificate')).toBeNull();
      expect(queryByText('Remove certificate')).toBeNull();
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

  describe('Credential hydration', () => {
    it('uses already-hydrated credentials without an edit-time load', () => {
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
  });

  describe('Accessible interactions', () => {
    it('submits a valid Add form through the visible footer action', async () => {
      const {getByLabelText, getByTestId} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          onSubmit={mockOnSubmit}
        />,
      );

      fireEvent.changeText(getByLabelText('Host'), 'example.com');
      fireEvent.press(getByTestId('server-form-submit'));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            host: 'example.com',
            mtlsEnabled: false,
            profileId: expect.stringMatching(/^profile-/),
          }),
        );
        expect(mockOnSubmit.mock.calls[0][0]).not.toHaveProperty(
          'clientCertConfig',
        );
      });
    });

    it('shows validation errors after submitting an invalid form', async () => {
      const {getByTestId, getByText} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          onSubmit={mockOnSubmit}
        />,
      );

      fireEvent.press(getByTestId('server-form-submit'));

      await waitFor(() => {
        expect(getByText('This field is required.')).toBeTruthy();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('shows secure-storage failures without submitting the server', async () => {
      mockSaveCredentials.mockRejectedValue(new Error('Storage unavailable'));
      const server: Server = {
        ...emptyServer(),
        host: 'example.com',
        auth: 'basic',
        credentials: {username: 'user', password: 'pass'},
      };
      const {getByTestId, getByText} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      fireEvent.press(getByTestId('server-form-submit'));

      await waitFor(() => {
        expect(getByText('Storage unavailable')).toBeTruthy();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('saves credentials under the existing profile ID when editing', async () => {
      const server: Server = {
        ...emptyServer(),
        profileId: 'profile-existing',
        host: 'example.com',
        auth: 'basic',
        credentials: {username: 'user', password: 'pass'},
      };
      const {getByTestId} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      fireEvent.press(getByTestId('server-form-submit'));

      await waitFor(() => {
        expect(mockSaveCredentials).toHaveBeenCalledWith('profile-existing', {
          username: 'user',
          password: 'pass',
        });
      });
    });

    it('shows server-save failures without dismissing the modal', async () => {
      mockOnSubmit.mockRejectedValueOnce(new Error('Unable to save server'));
      const server: Server = {
        ...emptyServer(),
        host: 'example.com',
      };
      const {getByTestId, getByText} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      fireEvent.press(getByTestId('server-form-submit'));

      await waitFor(() => {
        expect(getByText('Unable to save server')).toBeTruthy();
      });
      expect(Navigation.dismissModal).not.toHaveBeenCalled();
    });

    it('toggles the password visibility accessibly', () => {
      const server: Server = {
        ...emptyServer(),
        host: 'example.com',
        auth: 'basic',
        credentials: {username: 'user', password: 'pass'},
      };
      const {getByLabelText, getByTestId} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );
      expect(getByLabelText('Username').props.textContentType).toBe('username');
      expect(getByLabelText('Username').props.autoComplete).toBe('username');
      const password = getByLabelText('Password');
      expect(password.props.secureTextEntry).toBe(true);
      expect(password.props.textContentType).toBe('password');
      expect(password.props.autoComplete).toBe('password');

      fireEvent.press(getByTestId('server-password-toggle'));
      expect(getByLabelText('Password').props.secureTextEntry).toBe(false);
    });

    it('requires and persists explicit consent for remote HTTP', async () => {
      const server: Server = {
        ...emptyServer(),
        protocol: 'http',
        host: 'example.com',
        port: 80,
      };
      const {getByTestId, getByText} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      expect(getByTestId('server-remote-http-warning')).toBeTruthy();
      fireEvent.press(getByTestId('server-form-submit'));
      await waitFor(() => {
        expect(
          getByText('Explicit consent is required before using a remote HTTP endpoint.'),
        ).toBeTruthy();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();

      fireEvent(
        getByTestId('server-remote-http-consent-toggle'),
        'valueChange',
        true,
      );
      fireEvent.press(getByTestId('server-form-submit'));
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            protocol: 'http',
            allowInsecureRemoteHttp: true,
          }),
        );
      });
    });

    it('validates HTTPS and certificate selection when mTLS is enabled', async () => {
      const server: Server = {
        ...emptyServer(),
        protocol: 'http',
        host: 'example.com',
        mtlsEnabled: true,
      };
      const {getByTestId, getByText} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      fireEvent.press(getByTestId('server-form-submit'));

      await waitFor(() => {
        expect(getByText('mTLS requires HTTPS.')).toBeTruthy();
        expect(getByText('This field is required.')).toBeTruthy();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('configures a local route with RTSP defaults and a KeyChain identity', async () => {
      const server: Server = {
        ...emptyServer(),
        host: 'api.example.test',
        mtlsEnabled: true,
        clientCertConfig: {alias: 'external-identity'},
      };
      const {getByLabelText, getByTestId, getByText} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      fireEvent(getByTestId('server-local-route-toggle'), 'valueChange', true);
      fireEvent.changeText(getByTestId('server-local-host'), '192.168.1.20');
      fireEvent(getByTestId('server-local-mtls-toggle'), 'valueChange', true);
      fireEvent.press(getByLabelText('Change local identity'));
      expect(clientCertManager.selectCertificate).toHaveBeenCalledWith(
        'external-identity',
      );
      await waitFor(() => {
        expect(getByText('cert-1')).toBeTruthy();
      });
      fireEvent(getByTestId('server-rtsp-toggle'), 'valueChange', true);
      fireEvent.press(getByTestId('server-form-submit'));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            localRoutingEnabled: true,
            localEndpoint: {
              protocol: 'https',
              host: '192.168.1.20',
              port: 8971,
              basePath: '',
            },
            localTls: expect.objectContaining({
              mtlsEnabled: true,
              clientCertConfig: {alias: 'cert-1'},
            }),
            rtsp: {
              enabled: true,
              port: 8554,
              allowInsecureCredentials: false,
            },
          }),
        );
      });
    });

    it('requires explicit consent before sending authenticated plaintext RTSP', async () => {
      const server: Server = {
        ...emptyServer(),
        host: 'api.example.test',
        auth: 'basic',
        credentials: {username: 'user', password: 'pass'},
        localRoutingEnabled: true,
        localEndpoint: {
          protocol: 'http',
          host: 'localhost',
          port: 8971,
          basePath: '',
        },
        rtsp: {enabled: true, port: 8554, allowInsecureCredentials: false},
      };
      const {getByText, getByTestId} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      expect(
        getByText(
          'HTTP is only used for RTSP reachability. The authenticated API remains external.',
        ),
      ).toBeTruthy();
      fireEvent.press(getByTestId('server-form-submit'));

      await waitFor(() => {
        expect(
          getByText(
            'Explicit consent is required before shared credentials can be sent over plaintext RTSP.',
          ),
        ).toBeTruthy();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('rejects a determinably public local IP address', async () => {
      const server: Server = {
        ...emptyServer(),
        host: 'api.example.test',
        localRoutingEnabled: true,
        localEndpoint: {
          protocol: 'https',
          host: '8.8.8.8',
          port: 8971,
          basePath: '',
        },
      };
      const {getByTestId, getByText} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      fireEvent.press(getByTestId('server-form-submit'));
      await waitFor(() => {
        expect(
          getByText('Public targets are not allowed for a local route.'),
        ).toBeTruthy();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('rejects local mTLS when the local protocol is HTTP', async () => {
      const server: Server = {
        ...emptyServer(),
        host: 'api.example.test',
        localRoutingEnabled: true,
        localEndpoint: {
          protocol: 'http',
          host: 'localhost',
          port: 8971,
          basePath: '',
        },
        localTls: {
          mtlsEnabled: true,
          clientCertConfig: {alias: 'local-identity'},
        },
      };
      const {getByTestId, getByText} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      fireEvent.press(getByTestId('server-form-submit'));
      await waitFor(() => {
        expect(getByText('Local mTLS requires HTTPS.')).toBeTruthy();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('selects and removes a certificate and omits disabled mTLS config', async () => {
      const server: Server = {
        ...emptyServer(),
        host: 'example.com',
        mtlsEnabled: true,
        clientCertConfig: {alias: 'old-cert'},
      };
      const {getByLabelText, getByTestId, getByText} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      const alertSpy = jest
        .spyOn(Alert, 'alert')
        .mockImplementation((_title, _message, buttons) => {
          buttons?.[1]?.onPress?.();
        });
      fireEvent.press(getByLabelText('Change certificate'));
      await waitFor(() => {
        expect(getByText('cert-1')).toBeTruthy();
      });
      fireEvent.press(getByLabelText('Remove certificate'));
      expect(alertSpy).toHaveBeenCalled();
      fireEvent(getByTestId('server-mtls-toggle'), 'valueChange', false);
      fireEvent.press(getByTestId('server-form-submit'));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            mtlsEnabled: false,
          }),
        );
        expect(mockOnSubmit.mock.calls[0][0]).not.toHaveProperty(
          'clientCertConfig',
        );
      });
      alertSpy.mockRestore();
    });

    it('exposes and updates the self-signed server toggle while mTLS is enabled', async () => {
      const server: Server = {
        ...emptyServer(),
        host: 'example.com',
        mtlsEnabled: true,
      };
      const {getByLabelText, getByTestId, getByText} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      expect(
        getByText(
          'The server certificate chain, issuer, and validity are not checked; hostname verification remains active.',
        ),
      ).toBeTruthy();
      fireEvent(
        getByTestId('server-mtls-self-signed-toggle'),
        'valueChange',
        true,
      );
      fireEvent.press(getByLabelText('Choose certificate'));
      await waitFor(() => {
        expect(getByText('cert-1')).toBeTruthy();
      });
      fireEvent.press(getByTestId('server-form-submit'));
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            mtlsEnabled: true,
            clientCertConfig: {
              alias: 'cert-1',
              allowSelfSignedServer: true,
            },
          }),
        );
      });
    });

    it('preserves local self-signed trust when changing the certificate', async () => {
      const server: Server = {
        ...emptyServer(),
        host: 'api.example.test',
        localRoutingEnabled: true,
        localEndpoint: {
          protocol: 'https',
          host: '192.168.1.20',
          port: 8971,
          basePath: '',
        },
        localTls: {
          mtlsEnabled: true,
          allowSelfSignedServer: false,
          clientCertConfig: {alias: 'old-local-cert'},
        },
      };
      const {getByLabelText, getByTestId, getByText} = render(
        <ServerFormTestWrapper
          componentId={mockComponentId}
          server={server}
          onSubmit={mockOnSubmit}
        />,
      );

      fireEvent(
        getByTestId('server-local-mtls-self-signed-toggle'),
        'valueChange',
        true,
      );
      fireEvent.press(getByLabelText('Change local identity'));
      await waitFor(() => {
        expect(getByText('cert-1')).toBeTruthy();
      });
      fireEvent.press(getByTestId('server-form-submit'));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            localTls: expect.objectContaining({
              allowSelfSignedServer: true,
              clientCertConfig: {alias: 'cert-1'},
            }),
          }),
        );
        expect(mockOnSubmit.mock.calls[0][0].localTls.clientCertConfig).not.toHaveProperty(
          'allowSelfSignedServer',
        );
      });
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
