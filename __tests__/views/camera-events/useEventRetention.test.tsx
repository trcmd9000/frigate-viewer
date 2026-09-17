import React, {PropsWithChildren} from 'react';
import {act, renderHook, waitFor} from '@testing-library/react-native';
import {IntlProvider} from 'react-intl';
import en from '../../../i18n/en';
import {useEventRetention} from '../../../views/camera-events/useEventRetention';
import {handleError} from '../../../helpers/errorHandler';

const mockPost = jest.fn();
const mockDel = jest.fn();

jest.mock('../../../helpers/rest', () => ({
  useRest: () => ({post: mockPost, del: mockDel}),
}));

jest.mock('../../../store/store', () => ({
  useAppSelector: () => ({host: 'frigate.example.test'}),
}));

jest.mock('../../../store/settings', () => ({
  selectServer: jest.fn(),
}));

jest.mock('../../../helpers/errorHandler', () => ({
  handleError: jest.fn(() => Promise.resolve()),
}));

const wrapper = ({children}: PropsWithChildren) => (
  <IntlProvider locale="en" messages={en}>
    {children}
  </IntlProvider>
);

describe('useEventRetention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retains and unretains an event through the Frigate API', async () => {
    mockPost.mockResolvedValue('');
    mockDel.mockResolvedValue('');
    const onRetainedChange = jest.fn();
    const {result} = renderHook(
      () =>
        useEventRetention({
          eventId: 'event-1',
          initiallyRetained: false,
          onRetainedChange,
        }),
      {wrapper},
    );

    expect(result.current.label).toBe('Save event');
    expect(result.current.hint).toBe(
      'Keeps the event on the Frigate server indefinitely',
    );
    act(() => result.current.toggleRetained());

    await waitFor(() => expect(result.current.retained).toBe(true));
    expect(mockPost).toHaveBeenCalledWith(
      {host: 'frigate.example.test'},
      'events/event-1/retain',
      {json: false},
    );
    expect(onRetainedChange).toHaveBeenLastCalledWith(true);
    expect(result.current.label).toBe('Remove from saved events');
    expect(result.current.hint).toBe(
      'Allows Frigate to expire the event normally',
    );

    act(() => result.current.toggleRetained());

    await waitFor(() => expect(result.current.retained).toBe(false));
    expect(mockDel).toHaveBeenCalledWith(
      {host: 'frigate.example.test'},
      'events/event-1/retain',
      {json: false},
    );
    expect(onRetainedChange).toHaveBeenLastCalledWith(false);
  });

  it('keeps the previous state and reports API failures', async () => {
    const error = new Error('request failed');
    mockPost.mockRejectedValue(error);
    const onRetainedChange = jest.fn();
    const {result} = renderHook(
      () =>
        useEventRetention({
          eventId: 'event-1',
          initiallyRetained: false,
          onRetainedChange,
        }),
      {wrapper},
    );

    act(() => result.current.toggleRetained());

    await waitFor(() => expect(result.current.updating).toBe(false));
    expect(result.current.retained).toBe(false);
    expect(onRetainedChange).not.toHaveBeenCalled();
    expect(handleError).toHaveBeenCalledWith(
      error,
      'CameraEvent.retention',
    );
  });

  it('ignores repeated presses while a request is pending', async () => {
    let resolveRequest: (() => void) | undefined;
    mockPost.mockReturnValue(
      new Promise<void>(resolve => {
        resolveRequest = resolve;
      }),
    );
    const {result} = renderHook(
      () =>
        useEventRetention({
          eventId: 'event-1',
          initiallyRetained: false,
        }),
      {wrapper},
    );

    act(() => {
      result.current.toggleRetained();
      result.current.toggleRetained();
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
    await act(async () => resolveRequest?.());
  });
});
