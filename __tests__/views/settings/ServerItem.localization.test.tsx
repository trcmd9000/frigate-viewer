import React from 'react';
import {render} from '@testing-library/react-native';
import {IntlProvider} from 'react-intl';
import de from '../../../i18n/de';
import {emptyServer} from '../../../store/settings';
import {ServerItem} from '../../../views/settings/ServerItem';

jest.mock('@ant-design/icons-react-native', () => ({
  IconOutline: () => null,
}));

jest.mock('../../../helpers/colors', () => ({
  useTheme: () => ({
    border: '#ddd',
    surface: '#fff',
    text: '#000',
  }),
  useStyles: (fn: (value: unknown) => unknown) =>
    fn({
      theme: {
        border: '#ddd',
        surface: '#fff',
        text: '#000',
      },
    }),
}));

jest.mock('../../../components/primitives', () => {
  const {Text} = require('react-native');
  return {
    StatusChip: ({label}: {label: string}) => <Text>{label}</Text>,
  };
});

describe('ServerItem localization', () => {
  it('renders configuration status, authorization, and certificate labels', () => {
    const server = {
      ...emptyServer(),
      host: 'frigate.local',
      auth: 'frigate' as const,
      mtlsEnabled: true,
    };

    const {getByText, getByLabelText, queryByText} = render(
      <IntlProvider locale="de" messages={de}>
        <ServerItem server={server} onRemovePress={jest.fn()} />
      </IntlProvider>,
    );

    expect(getByText('Konfiguriert')).toBeTruthy();
    expect(getByText('Art der Autorisierung:')).toBeTruthy();
    expect(getByText('Frigate-Authentifizierung')).toBeTruthy();
    expect(getByText('Client-Zertifikat erforderlich')).toBeTruthy();
    expect(getByText('Bearbeiten')).toBeTruthy();
    expect(getByText('Löschen')).toBeTruthy();
    expect(queryByText('Server bearbeiten')).toBeNull();
    expect(queryByText('Server löschen')).toBeNull();
    expect(getByLabelText('Server löschen')).toBeTruthy();

    expect(queryByText('Configured')).toBeNull();
    expect(queryByText('Ready')).toBeNull();
    expect(queryByText('frigate')).toBeNull();
    expect(queryByText('basic')).toBeNull();
    expect(queryByText('Client certificate required')).toBeNull();
    expect(queryByText('settings.server.profile.connected')).toBeNull();
    expect(queryByText('settings.server.profile.mtlsRequired')).toBeNull();
  });
});
