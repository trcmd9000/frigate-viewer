import React from 'react';
import {render} from '@testing-library/react-native';
import {IntlProvider} from 'react-intl';
import {de as mockDateLocale} from 'date-fns/locale';
import de from '../../../i18n/de';
import en from '../../../i18n/en';
import {EventTitle} from '../../../views/camera-events/EventTitle';

let mockDatesDisplay: 'descriptive' | 'numeric' = 'numeric';

jest.mock('../../../store/store', () => ({
  useAppSelector: () => mockDatesDisplay,
}));

jest.mock('../../../store/settings', () => ({
  selectLocaleDatesDisplay: 'selectLocaleDatesDisplay',
}));

jest.mock('../../../helpers/locale', () => {
  const actual = jest.requireActual('../../../helpers/locale');
  return {
    ...actual,
    useDateLocale: () => mockDateLocale,
  };
});

jest.mock('../../../helpers/designTokens', () => ({
  useDesignTokens: () => ({
    spacing: {sm: 8},
    typography: {timestamp: {}},
    colors: {textSecondary: '#555', warning: '#fc0'},
  }),
}));

const startTime = new Date(2026, 8, 7, 18, 3).getTime() / 1000;

const renderTitle = (
  start = startTime,
  end = start + 12.862,
  locale = 'de',
  messages: Record<string, string> = de,
  retained = false,
) =>
  render(
    <IntlProvider locale={locale} messages={messages}>
      <EventTitle
        startTime={start}
        endTime={end}
        retained={retained}
      />
    </IntlProvider>,
  );

describe('EventTitle duration formatting', () => {
  beforeEach(() => {
    mockDatesDisplay = 'numeric';
  });

  it('formats elapsed seconds instead of milliseconds in numeric mode', () => {
    const {getByText, getByLabelText, queryByText} = renderTitle();

    expect(getByText('(0:13)')).toBeTruthy();
    expect(queryByText('(214:22)')).toBeNull();
    expect(
      getByLabelText('07.09.2026 18:03, Dauer 0:13'),
    ).toBeTruthy();
  });

  it('keeps short duration formatting in descriptive date mode', () => {
    mockDatesDisplay = 'descriptive';
    const {getByText, getByLabelText} = renderTitle();

    expect(getByText('(0:13)')).toBeTruthy();
    expect(getByLabelText(/Dauer 0:13/)).toBeTruthy();
  });

  it('uses the English duration label when the locale is English', () => {
    const {getByLabelText} = renderTitle(startTime, startTime + 12.862, 'en', en);

    expect(getByLabelText(/duration 0:13/)).toBeTruthy();
  });

  it.each([
    ['in-progress', 0],
    ['negative', -1],
    ['malformed', Number.NaN],
  ])('omits duration safely for %s end times', (_name, end) => {
    const {queryByText, getByLabelText} = renderTitle(startTime, end);

    expect(queryByText(/\(\d+:\d{2}\)/)).toBeNull();
    expect(getByLabelText(/07\.09\.2026 18:03/).props.accessibilityLabel).not.toContain(
      'Dauer',
    );
  });

  it('omits duration safely for malformed start times', () => {
    const {queryByText} = renderTitle(Number.NaN, startTime + 10);

    expect(queryByText(/\(\d+:\d{2}\)/)).toBeNull();
  });

  it('renders retained status with the warning token and an accessible label', () => {
    const {getByLabelText, getByText} = renderTitle(
      startTime,
      startTime + 10,
      'de',
      de,
      true,
    );

    expect(getByLabelText('Retained event')).toBeTruthy();
    expect(getByText('★').props.style).toEqual(
      expect.objectContaining({fontSize: 18, color: '#fc0'}),
    );
  });
});
