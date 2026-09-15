import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {IntlProvider} from 'react-intl';
import {NativeModules, Platform} from 'react-native';
import en from '../../../i18n/en';
import {Licenses} from '../../../views/licenses/Licenses';

const mockPush = jest.fn((_componentId: string, _layout: unknown) =>
  Promise.resolve(),
);
const mockShowModal = jest.fn((_layout: unknown) => Promise.resolve());
const mockMergeOptions = jest.fn();
const mockOpenAndroidLicenses = jest.fn(() => Promise.resolve());

jest.mock('react-native-navigation', () => ({
  Navigation: {
    dismissModal: jest.fn(() => Promise.resolve()),
    events: () => ({
      registerNavigationButtonPressedListener: () => ({
        remove: jest.fn(),
      }),
    }),
    mergeOptions: (componentId: string, options: unknown) =>
      mockMergeOptions(componentId, options),
    push: (componentId: string, layout: unknown) =>
      mockPush(componentId, layout),
    showModal: (layout: unknown) => mockShowModal(layout),
  },
}));

jest.mock('../../../helpers/colors', () => {
  const theme = {
    background: '#fff',
    surfaceElevated: '#f4f4f4',
    text: '#111',
    textSecondary: '#555',
  };
  return {
    useStyles: (factory: (value: unknown) => unknown) => factory({theme}),
    useTheme: () => theme,
  };
});

jest.mock('@ant-design/icons-react-native', () => ({
  IconOutline: () => null,
}));

describe('third-party license center', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as {OS: string}).OS = 'android';
    NativeModules.OssLicensesModule = {
      open: mockOpenAndroidLicenses,
    };
  });

  const renderLicenses = () =>
    render(
      <IntlProvider locale="en" messages={en}>
        <Licenses componentId="licenses" componentName="Licenses" />
      </IntlProvider>,
    );

  it('shows searchable offline JavaScript licenses and opens details', async () => {
    const view = renderLicenses();
    const search = view.getByLabelText('Search JavaScript libraries');

    fireEvent.changeText(search, 'readline');
    const result = await view.findByText('readline');
    expect(view.getByText(/1\.3\.0/)).toBeTruthy();

    fireEvent.press(result);
    expect(mockPush).toHaveBeenCalledWith('licenses', {
      component: {
        name: 'LicenseDetail',
        passProps: {
          license: expect.objectContaining({
            name: 'readline',
            version: '1.3.0',
            license: 'Apache-2.0',
          }),
        },
      },
    });
  });

  it('opens the offline Android license activity', async () => {
    const view = renderLicenses();

    fireEvent.press(
      view.getByRole('button', {name: 'All Android libraries'}),
    );

    await waitFor(() =>
      expect(mockOpenAndroidLicenses).toHaveBeenCalledWith(
        'All Android libraries',
      ),
    );
  });

  it('does not render a dead Android action on other platforms', () => {
    (Platform as {OS: string}).OS = 'ios';
    const view = renderLicenses();

    expect(
      view.queryByRole('button', {name: 'All Android libraries'}),
    ).toBeNull();
  });
});
