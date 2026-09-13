import React from 'react';
import {render} from '@testing-library/react-native';
import {IntlProvider} from 'react-intl';
import {initialSettings} from '../../../store/settings';
import {Settings} from '../../../views/settings/Settings';
import {useAppDispatch, useAppSelector} from '../../../store/store';
import de from '../../../i18n/de';

jest.mock('react-native-navigation', () => ({
  Navigation: {
    dismissModal: jest.fn(),
    showModal: jest.fn().mockResolvedValue(undefined),
    mergeOptions: jest.fn(),
  },
}));

jest.mock('../../../store/store', () => ({
  useAppDispatch: jest.fn(),
  useAppSelector: jest.fn(),
}));

jest.mock('react-native-gesture-handler', () => ({
  ScrollView: ({children}: {children: React.ReactNode}) => <>{children}</>,
}));

jest.mock('react-native-ui-lib', () => {
  const {Pressable, Text, View} = require('react-native');
  return {
    ActionBar: ({actions}: {actions: Array<{label: string; onPress: () => void}>}) => (
      <View>
        {actions.map(action => (
          <Pressable
            key={action.label}
            testID={`settings-action-${action.label}`}
            onPress={action.onPress}
          >
            <Text>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    ),
    Button: Object.assign(
      ({label, onPress}: {label: string; onPress: () => void}) => (
        <Pressable onPress={onPress}>
          <Text>{label}</Text>
        </Pressable>
      ),
      {sizes: {xSmall: 'xSmall'}},
    ),
    Switch: () => null,
    View: ({children}: {children: React.ReactNode}) => <>{children}</>,
  };
});

jest.mock('formik', () => ({
  Formik: ({
    children,
    initialValues,
    onSubmit,
    innerRef,
  }: {
    children: (props: any) => React.ReactNode;
    initialValues: typeof initialSettings;
    onSubmit: (values: typeof initialSettings) => void;
    innerRef: {current: unknown};
  }) => {
    innerRef.current = {
      values: initialValues,
      handleSubmit: () => onSubmit(initialValues),
      setFieldValue: jest.fn(),
    };
    return children({
      values: initialValues,
      handleBlur: jest.fn(),
      handleChange: () => jest.fn(),
      setFieldValue: jest.fn(),
      errors: {},
      touched: {},
    });
  },
}));

jest.mock('../../../helpers/colors', () => ({
  useTheme: () => ({background: '#fff', text: '#000', link: '#06c', border: '#ddd'}),
  useStyles: (fn: (value: {theme: Record<string, string>}) => unknown) =>
    fn({theme: {background: '#fff', text: '#000', link: '#06c', border: '#ddd'}}),
}));

jest.mock('../../../helpers/secureLogger', () => ({
  SecureLogger: {
    logError: jest.fn(),
    logRequest: jest.fn(),
  },
}));

jest.mock('../../../components/forms/Dropdown', () => {
  const {Text, View} = require('react-native');
  return {
    Dropdown: ({
      options = [],
      value,
      accessibilityLabel,
    }: {
      options?: Array<{value: unknown; label?: string}>;
      value: unknown;
      accessibilityLabel?: string;
    }) => {
      const selected = options.find(option => Object.is(option.value, value));
      return (
        <View accessibilityLabel={accessibilityLabel}>
          <Text>{selected?.label || String(value)}</Text>
        </View>
      );
    },
  };
});
jest.mock('../../../components/forms/Input', () => ({Input: () => null}));
jest.mock('../../../components/forms/Label', () => ({
  Label: ({children}: {children: React.ReactNode}) => <>{children}</>,
}));
jest.mock('../../../components/forms/Section', () => ({
  Section: ({children}: {children: React.ReactNode}) => <>{children}</>,
}));
jest.mock('../../../views/settings/ServerItem', () => ({ServerItem: () => null}));
jest.mock('../../../components/primitives', () => {
  const {Text} = require('react-native');
  return {
    Card: ({children}: {children: React.ReactNode}) => <>{children}</>,
    SectionHeader: ({
      children,
      testID,
    }: {
      children: React.ReactNode;
      testID?: string;
    }) => (
      <Text testID={testID} accessibilityRole="header">
        {children}
      </Text>
    ),
    StatusChip: () => null,
  };
});
jest.mock('../../../views/menu/Menu', () => ({
  authorMenuItem: {id: 'author'},
  logsMenuItem: {id: 'logs'},
  navigateToMenuItem: () => jest.fn(),
  reportProblemMenuItem: {id: 'report'},
  storageMenuItem: {id: 'storage'},
  systemMenuItem: {id: 'system'},
}));
jest.mock('@ant-design/icons-react-native', () => ({
  IconOutline: () => null,
}));

describe('Settings modal navigation', () => {
  const renderSettings = (
    locale: string,
    messages: Record<string, string>,
  ) =>
    render(
      <IntlProvider locale={locale} messages={messages} onError={() => undefined}>
        <Settings componentId="settings" componentName="Settings" />
      </IntlProvider>,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    (useAppDispatch as jest.Mock).mockReturnValue(jest.fn());
    (useAppSelector as jest.Mock).mockReturnValue(initialSettings);
  });

  it('offers add server and demo actions when no profiles exist', () => {
    const {getByTestId} = renderSettings('en', {});

    expect(getByTestId('settings-try-demo')).toBeTruthy();
  });

  it('does not render a global save or cancel action', () => {
    const {queryByTestId} = renderSettings('en', {});

    expect(queryByTestId('settings-action-settings.action.cancel')).toBeNull();
    expect(queryByTestId('settings-action-settings.action.save')).toBeNull();
  });

  it('renders German headings and TalkBack labels without IDs or English fallback', () => {
    const {getByText, getByLabelText, queryByText} = renderSettings(
      'de',
      de,
    );

    const {Navigation} = require('react-native-navigation');
    expect(Navigation.mergeOptions).toHaveBeenCalledWith(
      'settings',
      expect.objectContaining({
        topBar: {title: {text: 'Einstellungen'}},
      }),
    );
    expect(getByText('Darstellung')).toBeTruthy();
    expect(getByLabelText('Datumsformat')).toBeTruthy();
    expect(getByText('Relative Zeit (z. B. vor 5 Minuten)')).toBeTruthy();
    expect(getByLabelText('Farbschema')).toBeTruthy();
    expect(getByLabelText('Bildaktualisierungsintervall')).toBeTruthy();
    expect(queryByText('Anwendung')).toBeNull();
    expect(getByText('Kameraübersicht')).toBeTruthy();
    expect(getByText('Ereignisse')).toBeTruthy();
    expect(getByText('10 Sekunden')).toBeTruthy();
    expect(queryByText('Settings')).toBeNull();
    expect(queryByText('settings.topBar.title')).toBeNull();
    expect(
      queryByText('{seconds, plural, one {# Sekunde} other {# Sekunden}}'),
    ).toBeNull();
  });

  it('falls back to English defaults without exposing message IDs', () => {
    const {getByText, getByLabelText, queryByText} = renderSettings(
      'fr',
      {},
    );

    const {Navigation} = require('react-native-navigation');
    expect(Navigation.mergeOptions).toHaveBeenCalledWith(
      'settings',
      expect.objectContaining({
        topBar: {title: {text: 'Settings'}},
      }),
    );
    expect(getByText('Appearance')).toBeTruthy();
    expect(getByLabelText('Date format')).toBeTruthy();
    expect(getByText('Relative time')).toBeTruthy();
    expect(getByLabelText('Color scheme')).toBeTruthy();
    expect(getByLabelText('Image refresh interval')).toBeTruthy();
    expect(getByText('Camera overview')).toBeTruthy();
    expect(getByText('Events')).toBeTruthy();
    expect(getByText('10 seconds')).toBeTruthy();
    expect(queryByText('settings.topBar.title')).toBeNull();
    expect(
      queryByText('{seconds, plural, one {# second} other {# seconds}}'),
    ).toBeNull();
  });

  it('labels a persisted nonstandard refresh interval instead of showing a raw value', () => {
    (useAppSelector as jest.Mock).mockReturnValue({
      ...initialSettings,
      cameras: {...initialSettings.cameras, refreshFrequency: 7},
    });

    const {getByText} = renderSettings('en', {});

    expect(getByText('7 seconds')).toBeTruthy();
  });

  it.each([
    [1, '1 Sekunde'],
    [5, '5 Sekunden'],
  ])(
    'formats German refresh interval %s without a plural template',
    (value, label) => {
      (useAppSelector as jest.Mock).mockReturnValue({
        ...initialSettings,
        cameras: {...initialSettings.cameras, refreshFrequency: value},
      });

      const {getByText, queryByText} = renderSettings('de', de);

      expect(getByText(label)).toBeTruthy();
      expect(
        queryByText('{seconds, plural, one {# Sekunde} other {# Sekunden}}'),
      ).toBeNull();
    },
  );

  it('formats the singular English refresh interval', () => {
    (useAppSelector as jest.Mock).mockReturnValue({
      ...initialSettings,
      cameras: {...initialSettings.cameras, refreshFrequency: 1},
    });

    const {getByText, queryByText} = renderSettings('en', {});

    expect(getByText('1 second')).toBeTruthy();
    expect(
      queryByText('{seconds, plural, one {# second} other {# seconds}}'),
    ).toBeNull();
  });
});
