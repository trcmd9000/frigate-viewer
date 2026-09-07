import React from 'react';
import {act, fireEvent, render} from '@testing-library/react-native';
import {Navigation} from 'react-native-navigation';
import {Menu, secondaryMenuSections} from '../../../views/menu/Menu';
import {openSecondaryMenu} from '../../../views/menu/menuHelpers';

let mockLocale = 'en';
const germanMenuMessages: Record<string, string> = {
  'menu.title': 'Mehr',
  'menu.section.saved': 'Gespeichert',
  'menu.section.diagnostics': 'Diagnose',
  'menu.section.support': 'Support',
  'menu.item.retained.label': 'Gespeicherte Ereignisse',
};

jest.mock('react-intl', () => ({
  defineMessages: (messages: Record<string, unknown>) => messages,
  useIntl: () => ({
    formatMessage: (message: {id: string; defaultMessage: string}) =>
      mockLocale === 'de'
        ? germanMenuMessages[message.id] || message.defaultMessage
        : message.defaultMessage,
  }),
}));

jest.mock('../../../helpers/designTokens', () => ({
  useDesignTokens: () => ({
    colors: {
      surface: '#fff',
      surfaceElevated: '#f7f9fb',
      textPrimary: '#111',
      textSecondary: '#555',
      outline: '#ccc',
      divider: '#ddd',
      accentContainer: '#eef4ff',
      scrim: '#0008',
    },
    spacing: {xs: 4, sm: 8, md: 12, lg: 16},
    geometry: {
      cardRadius: 16,
      controlRadius: 12,
      pillRadius: 999,
      minimumTouchTarget: 48,
    },
    typography: {
      sectionTitle: {fontSize: 18, fontWeight: '700'},
      label: {fontSize: 13, fontWeight: '600'},
      body: {fontSize: 16, lineHeight: 24},
    },
  }),
}));

jest.mock('@ant-design/icons-react-native', () => ({
  IconOutline: () => null,
}));

jest.mock('react-native-gesture-handler', () => {
  const ReactNative = jest.requireActual('react-native');
  return {ScrollView: ReactNative.ScrollView};
});

jest.mock('../../../helpers/secureLogger', () => ({
  SecureLogger: {
    logError: jest.fn(),
  },
}));

jest.mock('react-native-navigation', () => ({
  Navigation: {
    dismissModal: jest.fn(() => Promise.resolve()),
    showModal: jest.fn(() => Promise.resolve()),
  },
}));

describe('secondary overflow menu', () => {
  beforeEach(() => {
    mockLocale = 'en';
    jest.clearAllMocks();
  });

  it('contains only reachable secondary destinations', () => {
    const ids = secondaryMenuSections.flatMap(section =>
      section.items.map(item => item.id),
    );

    expect(ids).toEqual([
      'retained',
      'storage',
      'system',
      'logs',
      'report',
      'author',
    ]);
    expect(ids).not.toEqual(
      expect.arrayContaining(['camerasList', 'cameraEvents', 'settings']),
    );
  });

  it('exposes selected rows and 48dp accessible controls', () => {
    const {getByRole, getByLabelText} = render(
      <Menu current="storage" componentId="menu" componentName="Menu" />,
    );

    const storage = getByRole('button', {name: 'Storage'});
    expect(storage.props.accessibilityState).toEqual({
      selected: true,
      disabled: undefined,
    });
    expect(storage.props.style[0].minHeight).toBeGreaterThanOrEqual(48);
    expect(getByLabelText('Close menu')).toBeTruthy();
  });

  it('renders German sheet copy instead of English headings or raw ids', () => {
    mockLocale = 'de';
    const {getByRole, getByText, queryByText} = render(
      <Menu componentId="menu" componentName="Menu" />,
    );

    expect(getByText('Mehr')).toBeTruthy();
    expect(getByText('Gespeichert')).toBeTruthy();
    expect(getByText('Diagnose')).toBeTruthy();
    expect(getByText('Support')).toBeTruthy();
    expect(getByRole('button', {name: 'Gespeicherte Ereignisse'})).toBeTruthy();
    expect(queryByText('More')).toBeNull();
    expect(queryByText('Saved')).toBeNull();
    expect(queryByText('Diagnostics')).toBeNull();
    expect(queryByText('menu.title')).toBeNull();
    expect(queryByText('menu.section.saved')).toBeNull();
  });

  it('dismisses on outside tap and navigates secondary rows once', async () => {
    const {getByRole, getByTestId} = render(
      <Menu componentId="menu" componentName="Menu" />,
    );

    await act(async () => {
      fireEvent.press(
        getByTestId('secondary-menu-scrim', {includeHiddenElements: true}),
      );
    });
    expect(Navigation.dismissModal).toHaveBeenCalledWith('menu');

    await act(async () => {
      fireEvent.press(getByRole('button', {name: 'System'}));
    });
    expect(Navigation.showModal).toHaveBeenCalledWith({
      component: {name: 'System', passProps: undefined},
    });
  });

  it('guards repeated overflow taps while the modal is presenting', () => {
    openSecondaryMenu();
    openSecondaryMenu();

    expect(Navigation.showModal).toHaveBeenCalledTimes(1);
    expect(Navigation.showModal).toHaveBeenCalledWith({
      component: {
        name: 'Menu',
        options: expect.objectContaining({
          modalPresentationStyle: 'overFullScreen',
          modal: {swipeToDismiss: true},
        }),
      },
    });
  });
});
