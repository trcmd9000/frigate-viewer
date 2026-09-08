import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {IntlProvider} from 'react-intl';
import {Linking} from 'react-native';
import de from '../../../i18n/de';
import {Author} from '../../../views/author/Author';

jest.mock('react-native-gesture-handler', () => {
  const ReactModule = require('react');
  const {View} = require('react-native');
  return {
    ScrollView: View,
    GestureHandlerRootView: ({children}: {children: React.ReactNode}) =>
      ReactModule.createElement(View, null, children),
  };
});

jest.mock('../../../store/store', () => ({
  useAppSelector: () => undefined,
}));

jest.mock('../../../helpers/colors', () => ({
  palette: {white: '#fff'},
  useStyles: (factory: (value: unknown) => unknown) =>
    factory({
      theme: {
        background: '#fff',
        surfaceElevated: '#f7f9fb',
        text: '#111',
        textSecondary: '#555',
        link: '#05c',
      },
    }),
}));

jest.mock('react-native-navigation', () => ({
  Navigation: {
    mergeOptions: jest.fn(),
    updateProps: jest.fn(),
  },
}));

describe('About page', () => {
  beforeEach(() => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes current links, disclaimer, and separated upstream attribution', () => {
    const view = render(
      <IntlProvider locale="de" messages={de}>
        <Author componentId="about" componentName="Author" />
      </IntlProvider>,
    );

    expect(view.getByText('Frigate Viewer')).toBeTruthy();
    expect(
      view.getByText(/unabhängiger, mit Frigate kompatibler Client/i),
    ).toBeTruthy();
    expect(view.getAllByText(/sp-engineering\/frigate-viewer/i)).not.toHaveLength(0);
    expect(view.queryByText(/Kauf mir einen Kaffee/i)).toBeNull();
    expect(view.queryByText(/verwendeten Bibliotheken/i)).toBeNull();

    const links = view.getAllByRole('link');
    expect(links).toHaveLength(4);
    links.forEach(link => {
      expect(link.props.style).toEqual(
        expect.objectContaining({minHeight: 48}),
      );
    });

    fireEvent.press(links[0]);
    expect(Linking.canOpenURL).toHaveBeenCalledWith(
      'mailto:trcmd9000@gmail.com',
    );
  });
});
