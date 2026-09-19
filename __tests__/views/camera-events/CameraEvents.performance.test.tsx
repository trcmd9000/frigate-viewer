import React from 'react';
import {render} from '@testing-library/react-native';
import {IntlProvider} from 'react-intl';
import en from '../../../i18n/en';
import {CameraEvents} from '../../../views/camera-events/CameraEvents';

const mockGet = jest.fn().mockResolvedValue([]);
const mockServer = {host: 'frigate.test'};
const mockEmptyFilters: string[] = [];
const mockStore = {getState: () => ({events: {scopeGeneration: 0}})};

jest.mock('react-redux', () => ({
  useStore: () => mockStore,
}));

jest.mock('../../../helpers/rest', () => ({useRest: () => ({get: mockGet})}));
jest.mock('../../../views/settings/useNoServer', () => ({useNoServer: jest.fn()}));
jest.mock('../../../views/menu/menuHelpers', () => ({
  useMenu: jest.fn(),
  menuButton: {},
}));
jest.mock('../../../views/events-filters/eventsFiltersHelpers', () => ({
  useEventsFilters: jest.fn(),
  filterButton: () => ({}),
}));
jest.mock('../../../views/events-filters/ActiveFilters', () => ({
  ActiveFilters: () => null,
}));
jest.mock('../../../views/camera-events/CameraEvent', () => ({
  CameraEvent: () => null,
}));
jest.mock('../../../views/camera-events/Share', () => ({Share: () => null}));
jest.mock('../../../components/Background', () => ({
  Background: ({children}: {children: React.ReactNode}) => children,
}));
jest.mock('../../../components/Refresh', () => ({Refresh: () => null}));
jest.mock('../../../components/RetryState', () => ({RetryState: () => null}));
jest.mock('../../../helpers/screen', () => ({
  useOrientation: () => ({orientation: 'portrait', setComponentId: jest.fn()}),
}));
jest.mock('../../../helpers/colors', () => ({
  useTheme: () => ({text: '#000'}),
  useStyles: (fn: (value: unknown) => unknown) =>
    fn({theme: {background: '#fff', surfaceElevated: '#eee', border: '#ccc'}}),
}));
jest.mock('../../../helpers/designTokens', () => ({
  useDesignTokens: () => ({
    colors: {
      canvas: '#fff',
      surfaceElevated: '#eee',
      mediaBackground: '#000',
      outline: '#ccc',
    },
    spacing: {sm: 8, md: 12, lg: 16, xxl: 32},
    geometry: {cardRadius: 16, mediaAspectRatio: 16 / 9},
  }),
}));
jest.mock('../../../store/store', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: () => unknown) => selector(),
}));
jest.mock('../../../store/settings', () => ({
  selectServer: () => mockServer,
  selectEventsNumColumns: () => 1,
  selectEventsSnapshotHeight: () => 180,
  selectEventsLockLandscapePlaybackOrientation: () => false,
  setEventSnapshotHeight: (value: number) => ({payload: value}),
}));
jest.mock('../../../store/events', () => ({
  selectServerScopeGeneration: () => 0,
  selectFiltersCameras: () => mockEmptyFilters,
  selectFiltersLabels: () => mockEmptyFilters,
  selectFiltersZones: () => mockEmptyFilters,
  selectFiltersRetained: () => false,
}));
jest.mock('react-native-navigation', () => ({
  Navigation: {
    events: () => ({registerComponentListener: () => ({remove: jest.fn()})}),
    mergeOptions: jest.fn(),
    updateProps: jest.fn(),
    showModal: jest.fn(),
  },
}));

describe('event list performance contract', () => {
  it('keeps virtualization and pagination tuning on the stable list', () => {
    const {getByTestId} = render(
      <IntlProvider locale="en" messages={en}>
        <CameraEvents
          componentId="events"
          componentName="CameraEvents"
        />
      </IntlProvider>,
    );
    const list = getByTestId('camera-events-list');

    expect(list.props.initialNumToRender).toBeGreaterThan(0);
    expect(list.props.maxToRenderPerBatch).toBeGreaterThan(0);
    expect(list.props.windowSize).toBeGreaterThanOrEqual(5);
    expect(list.props.updateCellsBatchingPeriod).toBeLessThanOrEqual(100);
    expect(list.props.stickyHeaderIndices).toEqual([0]);
  });
});
