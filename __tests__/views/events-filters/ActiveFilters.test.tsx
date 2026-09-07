import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {IntlProvider} from 'react-intl';
import en from '../../../i18n/en';
import de from '../../../i18n/de';
import {ActiveFilters} from '../../../views/events-filters/ActiveFilters';

const mockDispatch = jest.fn();
const mockSelectorValues = {
  cameras: ['front-door'],
  labels: ['person'],
  zones: [],
  retained: true,
};

jest.mock('../../../store/store', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: () => unknown) => selector(),
}));

jest.mock('../../../store/events', () => ({
  selectFiltersCameras: () => mockSelectorValues.cameras,
  selectFiltersLabels: () => mockSelectorValues.labels,
  selectFiltersZones: () => mockSelectorValues.zones,
  selectFiltersRetained: () => mockSelectorValues.retained,
  setFiltersCameras: (value: string[]) => ({type: 'cameras', payload: value}),
  setFiltersLabels: (value: string[]) => ({type: 'labels', payload: value}),
  setFiltersZones: (value: string[]) => ({type: 'zones', payload: value}),
  setFiltersRetained: (value: boolean) => ({type: 'retained', payload: value}),
}));

jest.mock('../../../helpers/designTokens', () => ({
  useDesignTokens: () => ({
    colors: {
      canvas: '#fff',
      surface: '#fff',
      surfaceElevated: '#eee',
      textPrimary: '#111',
      textSecondary: '#555',
      accent: '#145dcc',
      accentContainer: '#eef4ff',
      divider: '#ddd',
    },
    spacing: {sm: 8, md: 12, lg: 16},
    geometry: {minimumTouchTarget: 48, pillRadius: 999},
    typography: {label: {fontSize: 13}, supporting: {fontSize: 14}},
  }),
}));

describe('active event filters', () => {
  it('supports removing a chip and clearing all filters', () => {
    const {getByRole, getByLabelText} = render(
      <IntlProvider locale="en" messages={en}>
        <ActiveFilters />
      </IntlProvider>,
    );

    const camera = getByLabelText('Remove filter front-door');
    expect(camera.props.style.minHeight).toBeGreaterThanOrEqual(48);
    fireEvent.press(camera);
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'cameras',
      payload: [],
    });

    fireEvent.press(getByRole('button', {name: 'Clear filters'}));
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'cameras',
      payload: [],
    });
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'retained',
      payload: false,
    });
  });

  it('renders the German empty state without an ID or English fallback', () => {
    mockSelectorValues.cameras = [];
    mockSelectorValues.labels = [];
    mockSelectorValues.retained = false;

    const view = render(
      <IntlProvider locale="de" messages={de}>
        <ActiveFilters />
      </IntlProvider>,
    );

    expect(view.getByText('Alle Ereignisse')).toBeTruthy();
    expect(view.queryByText('eventsFilters.active.none')).toBeNull();
    expect(view.queryByText('All events')).toBeNull();

    mockSelectorValues.cameras = ['front-door'];
    mockSelectorValues.labels = ['person'];
    mockSelectorValues.retained = true;
  });
});
