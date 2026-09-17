import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {IntlProvider} from 'react-intl';
import {Linking, StyleSheet} from 'react-native';
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
    useTheme: () => ({
    text: '#111',
    textSecondary: '#555',
    }),
}));

jest.mock('react-native-navigation', () => ({
  Navigation: {
    mergeOptions: jest.fn(),
    updateProps: jest.fn(),
    showModal: jest.fn(() => Promise.resolve('licenses')),
  },
}));

jest.mock('@ant-design/icons-react-native', () => ({
  IconOutline: () => null,
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
    expect(view.getByTestId('about-icon').props.style).toEqual(
      expect.objectContaining({width: 80, height: 80}),
    );
    expect(view.getByRole('image', {name: 'Frigate Viewer'})).toBeTruthy();
    expect(view.getByTestId('about-icon').props.source).toEqual({
      testUri: '../../../views/author/frigate-viewer-icon.png',
    });
    expect(
      view.getByText(
        /nicht mit dem Frigate-Projekt verbunden, wird von diesem nicht gesponsert/i,
      ),
    ).toBeTruthy();
    expect(view.getAllByText(/sp-engineering\/frigate-viewer/i)).not.toHaveLength(0);
    expect(view.queryByText(/Kauf mir einen Kaffee/i)).toBeNull();
    expect(view.getByText('Version 18.0.8')).toBeTruthy();
    expect(view.queryByText(/trcmd9000@gmail.com/i)).toBeNull();
    expect(view.getByText('Versionshinweise')).toBeTruthy();
    expect(view.getByText('Drittanbieter-Lizenzen')).toBeTruthy();

    const links = view.getAllByRole('link');
    expect(links).toHaveLength(5);
    links.slice(0, 4).forEach(link => {
      expect(StyleSheet.flatten(link.props.style)).toEqual(
        expect.objectContaining({minHeight: 56}),
      );
    });

    fireEvent.press(links[0]);
    expect(Linking.canOpenURL).toHaveBeenCalledWith(
      'https://github.com/trcmd9000/frigate-viewer',
    );

    fireEvent.press(
      view.getByRole('button', {name: 'Drittanbieter-Lizenzen'}),
    );
    expect(
      require('react-native-navigation').Navigation.showModal,
    ).toHaveBeenCalledWith({
      stack: {
        children: [{component: {name: 'Licenses'}}],
      },
    });
  });
});
