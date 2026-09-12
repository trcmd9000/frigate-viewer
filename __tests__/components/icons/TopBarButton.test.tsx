import React from 'react';
import {render} from '@testing-library/react-native';
import {TopBarButton} from '../../../components/icons/TopBarButton';

let mockLocale = 'en';

jest.mock('react-intl', () => ({
  defineMessages: (messages: Record<string, unknown>) => messages,
  useIntl: () => ({
    formatMessage: (message: {id: string; defaultMessage: string}) =>
      mockLocale === 'de' && message.id === 'menu.button.label'
        ? 'Mehr'
        : message.defaultMessage,
  }),
}));

jest.mock('../../../helpers/colors', () => ({
  useTheme: () => ({
    text: '#111',
    surface: '#fff',
    error: '#b00',
    textInverse: '#fff',
  }),
  useStyles: (
    factory: (helpers: {theme: Record<string, string>}) => unknown,
  ) =>
    factory({
      theme: {
        text: '#111',
        surface: '#fff',
        error: '#b00',
        textInverse: '#fff',
      },
    }),
}));

describe('overflow top bar accessibility label', () => {
  beforeEach(() => {
    mockLocale = 'en';
  });

  it('uses the localized German label', () => {
    mockLocale = 'de';
    const {getByRole} = render(
      <TopBarButton icon="ellipsis" onPress={jest.fn()} />,
    );

    expect(getByRole('button').props.accessibilityLabel).toBe('Mehr');
  });

  it('falls back to the English default for other locales', () => {
    const {getByRole} = render(
      <TopBarButton icon="ellipsis" onPress={jest.fn()} />,
    );

    expect(getByRole('button').props.accessibilityLabel).toBe('More');
  });
});
