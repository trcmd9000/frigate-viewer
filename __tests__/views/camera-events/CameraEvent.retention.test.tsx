import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {IntlProvider} from 'react-intl';
import en from '../../../i18n/en';
import {
  CameraEvent,
  ICameraEvent,
} from '../../../views/camera-events/CameraEvent';

const mockToggleRetained = jest.fn();
const mockOnRetainedChange = jest.fn();
const mockUseAppSelector = jest.fn();

jest.mock('../../../views/camera-events/useEventRetention', () => ({
  useEventRetention: () => ({
    retained: false,
    updating: false,
    toggleRetained: mockToggleRetained,
    label: 'Save event',
    hint: 'Keeps the event on the Frigate server indefinitely',
  }),
}));

jest.mock('../../../helpers/rest', () => ({
  useRest: () => ({del: jest.fn()}),
}));

jest.mock('../../../store/store', () => ({
  useAppSelector: () => mockUseAppSelector(),
}));

jest.mock('../../../store/settings', () => ({
  selectEventsSnapshotHeight: jest.fn(),
  selectEventsNumColumns: jest.fn(),
  selectServer: jest.fn(),
}));

jest.mock('../../../helpers/colors', () => ({
  useTheme: () => ({
    error: '#c00',
    info: '#06c',
    mediaText: '#fff',
    success: '#080',
    warning: '#fc0',
  }),
  useStyles: (factory: (value: unknown) => unknown) =>
    factory({
      theme: {
        mediaOverlayPanel: '#000a',
        surface: '#fff',
        text: '#111',
      },
    }),
}));

jest.mock('../../../components/primitives', () => {
  const {View} = require('react-native');
  return {
    MediaSurface: View,
    SurfaceCard: View,
  };
});

jest.mock('../../../views/camera-events/EventSnapshot', () => ({
  EventSnapshot: () => null,
}));
jest.mock('../../../views/camera-events/EventLabels', () => ({
  EventLabels: () => null,
}));
jest.mock('../../../views/camera-events/EventTitle', () => ({
  EventTitle: () => null,
}));

jest.mock('react-native-ui-lib', () => {
  const {View} = require('react-native');
  return {
    Drawer: ({children}: {children: React.ReactNode}) => <View>{children}</View>,
  };
});

jest.mock('@ant-design/icons-react-native', () => {
  const {Text} = require('react-native');
  return {
    IconFill: (props: Record<string, unknown>) => <Text {...props} />,
    IconOutline: (props: Record<string, unknown>) => <Text {...props} />,
  };
});

const event: ICameraEvent = {
  id: 'event-1',
  camera: 'front-door',
  thumbnail: '',
  start_time: 10,
  end_time: 20,
  zones: [],
  area: null,
  box: null,
  has_clip: true,
  has_snapshot: true,
  label: 'person',
  sub_label: null,
  plus_id: null,
  data: {top_score: 0.9},
  false_positive: null,
  ratio: null,
  region: null,
  retain_indefinitely: false,
};

describe('CameraEvent retention action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAppSelector
      .mockReturnValueOnce({host: 'frigate.example.test'})
      .mockReturnValueOnce(120)
      .mockReturnValueOnce(1);
  });

  it('shows a separate accessible star action without opening the event', () => {
    const onEventPress = jest.fn();
    const view = render(
      <IntlProvider locale="en" messages={en}>
        <CameraEvent
          {...event}
          componentId="events"
          mediaEnabled
          onDelete={jest.fn()}
          onEventPress={onEventPress}
          onRetainedChange={mockOnRetainedChange}
          onShare={jest.fn()}
          onSnapshotDimensions={jest.fn()}
        />
      </IntlProvider>,
    );

    const retention = view.getByTestId('event-retention-event-1');
    expect(retention.props.accessibilityLabel).toBe('Save event');
    expect(retention.props.accessibilityHint).toBe(
      'Keeps the event on the Frigate server indefinitely',
    );
    expect(retention.props.accessibilityState).toEqual({
      busy: false,
      disabled: false,
      selected: false,
    });

    fireEvent.press(retention);

    expect(mockToggleRetained).toHaveBeenCalledTimes(1);
    expect(onEventPress).not.toHaveBeenCalled();
  });
});
