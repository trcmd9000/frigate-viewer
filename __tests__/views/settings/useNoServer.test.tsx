import React from 'react';
import {act, render, waitFor} from '@testing-library/react-native';
import {ToastAndroid} from 'react-native';
import {useNoServer} from '../../../views/settings/useNoServer';
import {presentSettingsModal} from '../../../helpers/navigationShell';

let mockCurrentServer = {host: ''};
let mockComponentListener: {
  componentDidAppear?: () => void;
  componentDidDisappear?: () => void;
} | undefined;
let mockModalDismissedListener:
  | ((event: {componentName: string}) => void)
  | undefined;

jest.mock('react-native-navigation', () => ({
  Navigation: {
    events: () => ({
      registerComponentListener: (listener: typeof mockComponentListener) => {
        mockComponentListener = listener;
        return {remove: jest.fn()};
      },
      registerModalDismissedListener: (
        listener: (event: {componentName: string}) => void,
      ) => {
        mockModalDismissedListener = listener;
        return {remove: jest.fn()};
      },
    }),
  },
}));

jest.mock('../../../helpers/navigationShell', () => ({
  presentSettingsModal: jest.fn(),
}));

jest.mock('../../../store/store', () => ({
  useAppSelector: () => mockCurrentServer,
}));

jest.mock('react-intl', () => ({
  useIntl: () => ({formatMessage: ({id}: {id: string}) => id}),
  defineMessages: (messages: unknown) => messages,
}));

jest.mock('../../../helpers/secureLogger', () => ({
  SecureLogger: {
    logError: jest.fn(),
  },
}));

const Harness = ({componentId = 'cameras'}: {componentId?: string}) => {
  useNoServer(componentId);
  return null;
};

describe('useNoServer navigation lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentServer = {host: ''};
    mockComponentListener = undefined;
    mockModalDismissedListener = undefined;
    (presentSettingsModal as jest.Mock).mockResolvedValue(undefined);
    jest
      .spyOn(ToastAndroid, 'showWithGravity')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('re-prompts after dismissal when leaving and returning', async () => {
    render(<Harness />);
    await waitFor(() =>
      expect(presentSettingsModal).toHaveBeenCalledTimes(1),
    );
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      mockModalDismissedListener?.({componentName: 'Settings'});
      mockComponentListener?.componentDidDisappear?.();
      mockComponentListener?.componentDidAppear?.();
    });

    await waitFor(() =>
      expect(presentSettingsModal).toHaveBeenCalledTimes(2),
    );
  });

  it('retries after a rejected modal transition on the next focus', async () => {
    (presentSettingsModal as jest.Mock)
      .mockRejectedValueOnce(new Error('navigation failed'))
      .mockResolvedValueOnce(undefined);
    render(<Harness />);
    await waitFor(() =>
      expect(presentSettingsModal).toHaveBeenCalledTimes(1),
    );

    act(() => {
      mockComponentListener?.componentDidDisappear?.();
      mockComponentListener?.componentDidAppear?.();
    });

    await waitFor(() =>
      expect(presentSettingsModal).toHaveBeenCalledTimes(2),
    );
  });

  it('does not duplicate a prompt for repeated focus events', async () => {
    render(<Harness />);
    await waitFor(() =>
      expect(presentSettingsModal).toHaveBeenCalledTimes(1),
    );
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      mockModalDismissedListener?.({componentName: 'Settings'});
      mockComponentListener?.componentDidDisappear?.();
      mockComponentListener?.componentDidAppear?.();
      mockComponentListener?.componentDidAppear?.();
    });
    expect(presentSettingsModal).toHaveBeenCalledTimes(2);
  });

  it('stops prompting after a server is added', async () => {
    const view = render(<Harness />);
    await waitFor(() =>
      expect(presentSettingsModal).toHaveBeenCalledTimes(1),
    );

    mockCurrentServer = {host: 'frigate.local'};
    view.rerender(<Harness />);
    act(() => {
      mockComponentListener?.componentDidDisappear?.();
      mockComponentListener?.componentDidAppear?.();
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(presentSettingsModal).toHaveBeenCalledTimes(1);
  });
});
