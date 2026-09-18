import React from 'react';
import {act, fireEvent, render} from '@testing-library/react-native';
import {Navigation} from 'react-native-navigation';
import {Menu, navigateToMenuItem, retainedMenuItem, secondaryMenuSections} from '../../../views/menu/Menu';
import {presentSecondaryStack} from '../../../helpers/secondaryNavigation';
import {openSecondaryMenu} from '../../../views/menu/menuHelpers';

let mockLocale = 'en';
let mockGeneration = 0;
const mockUnsubscribe = jest.fn();
let mockStoreListener: (() => void) | undefined;
jest.mock('../../../store/store', () => ({
  store: {
    getState: () => ({events: {scopeGeneration: mockGeneration}}),
    subscribe: (listener: () => void) => {
      mockStoreListener = listener;
      return mockUnsubscribe;
    },
  },
}));
const germanMenuMessages: Record<string, string> = {
  'menu.title': 'Mehr',
  'menu.section.app': 'App',
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

jest.mock('../../../helpers/secondaryNavigation', () => ({
  presentSecondaryStack: jest.fn(
    async (options: {onPresented?: (componentId: string) => void}) => {
      options.onPresented?.('SecondaryStackRoot');
      return 'SecondaryStackRoot';
    },
  ),
}));

jest.mock('react-native-navigation', () => ({
  Navigation: {
    dismissOverlay: jest.fn(() => Promise.resolve()),
    dismissModal: jest.fn(() => Promise.resolve()),
    showOverlay: jest.fn(() => Promise.resolve()),
    events: () => ({registerModalDismissedListener: () => ({remove: jest.fn()})}),
  },
}));

describe('secondary overflow menu', () => {
  beforeEach(() => {
    mockLocale = 'en';
    mockGeneration = 0;
    mockStoreListener = undefined;
    jest.clearAllMocks();
  });

  it('places Settings first in an App section and keeps only reachable destinations', () => {
    const ids = secondaryMenuSections.flatMap(section =>
      section.items.map(item => item.id),
    );

    expect(ids).toEqual([
      'settings',
      'retained',
      'storage',
      'system',
      'logs',
      'author',
    ]);
    expect(ids).not.toEqual(
      expect.arrayContaining(['camerasList', 'cameraEvents']),
    );
    expect(secondaryMenuSections[0]).toMatchObject({
      id: 'app',
      label: 'section.app',
    });
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
    expect(getByText('App')).toBeTruthy();
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

  it('dismisses on outside tap and presents secondary rows once after dismissal', async () => {
    const {getByRole, getByTestId} = render(
      <Menu componentId="menu" componentName="Menu" />,
    );

    await act(async () => {
      fireEvent.press(
        getByTestId('secondary-menu-scrim', {includeHiddenElements: true}),
      );
    });
    expect(Navigation.dismissOverlay).toHaveBeenCalledWith('menu');

    await act(async () => {
      fireEvent.press(getByRole('button', {name: 'System'}));
      fireEvent.press(getByRole('button', {name: 'System'}));
    });
    expect(presentSecondaryStack).toHaveBeenCalledTimes(1);
    expect(presentSecondaryStack).toHaveBeenCalledWith({
      componentName: 'System',
      passProps: undefined,
      isCurrentScope: undefined,
      onPresented: undefined,
    });
  });

  it('guards repeated overflow taps while the overlay is presenting', () => {
    openSecondaryMenu();
    openSecondaryMenu();

    expect(Navigation.showOverlay).toHaveBeenCalledTimes(1);
    expect(Navigation.showOverlay).toHaveBeenCalledWith({
      component: {
        name: 'Menu',
        options: expect.objectContaining({
          overlay: {interceptTouchOutside: true},
          layout: {
            backgroundColor: 'transparent',
            componentBackgroundColor: 'transparent',
          },
        }),
      },
    });
  });

  it('uses lifecycle hooks to dismiss retained events once when their scope changes', async () => {
    const navigate = navigateToMenuItem(retainedMenuItem);
    await navigate();
    expect(presentSecondaryStack).toHaveBeenCalledWith({
      componentName: 'CameraEvents',
      passProps: {retained: true, ownerScopeGeneration: 0},
      isCurrentScope: expect.any(Function),
      onPresented: expect.any(Function),
    });

    mockGeneration = 1;
    mockStoreListener?.();
    expect(Navigation.dismissModal).toHaveBeenCalledTimes(1);
    expect(Navigation.dismissModal).toHaveBeenCalledWith('SecondaryStackRoot');

    await navigate();
    expect(presentSecondaryStack).toHaveBeenCalledTimes(1);
  });

  it('does not navigate after a menu dismissal delayed across a scope change', async () => {
    let dismiss!: () => void;
    (Navigation.dismissOverlay as jest.Mock).mockReturnValueOnce(new Promise<void>(resolve => { dismiss = resolve; }));
    const view = render(<Menu componentId="menu" componentName="Menu" />);
    fireEvent.press(view.getByRole('button', {name: 'Retained'}));
    mockGeneration = 1;
    await act(async () => dismiss());
    expect(presentSecondaryStack).not.toHaveBeenCalled();
  });

  it('continues same-scope navigation after the menu itself unmounts', async () => {
    let dismiss!: () => void;
    (Navigation.dismissOverlay as jest.Mock).mockReturnValueOnce(new Promise<void>(resolve => { dismiss = resolve; }));
    const view = render(<Menu componentId="menu" componentName="Menu" />);
    fireEvent.press(view.getByRole('button', {name: 'Retained'}));
    view.unmount();
    await act(async () => dismiss());
    expect(presentSecondaryStack).toHaveBeenCalledWith({
      componentName: 'CameraEvents',
      passProps: {retained: true, ownerScopeGeneration: 0},
      isCurrentScope: expect.any(Function),
      onPresented: expect.any(Function),
    });
  });
});
