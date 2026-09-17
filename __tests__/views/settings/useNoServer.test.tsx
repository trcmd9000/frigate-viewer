import React from 'react';
import {act, render, waitFor} from '@testing-library/react-native';
import {ToastAndroid} from 'react-native';
import {useNoServer} from '../../../views/settings/useNoServer';
import {presentSecondaryStack} from '../../../helpers/secondaryNavigation';

let mockCurrentServer = {host: ''};
type ComponentListener = {
  componentDidAppear?: () => void;
  componentDidDisappear?: () => void;
};
let mockComponentListeners: Record<string, ComponentListener>;
let mockOnDismissed: (() => void) | undefined;

jest.mock('react-native-navigation', () => ({
  Navigation: {
    events: () => ({
      registerComponentListener: (
        listener: ComponentListener,
        componentId: string,
      ) => {
        mockComponentListeners[componentId] = listener;
        return {remove: jest.fn()};
      },
    }),
  },
}));

jest.mock('../../../helpers/secondaryNavigation', () => ({
  presentSecondaryStack: jest.fn((options: {onDismissed?: () => void}) => {
    mockOnDismissed = options.onDismissed;
    return Promise.resolve('SecondaryStackRoot');
  }),
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
    mockComponentListeners = {};
    mockOnDismissed = undefined;
    (presentSecondaryStack as jest.Mock).mockImplementation(
      (options: {onDismissed?: () => void}) => {
        mockOnDismissed = options.onDismissed;
        return Promise.resolve('SecondaryStackRoot');
      },
    );
    jest
      .spyOn(ToastAndroid, 'showWithGravity')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not prompt-loop on return from Settings, but re-prompts after a later visit', async () => {
    render(<Harness />);
    act(() => {
      mockComponentListeners.cameras.componentDidAppear?.();
    });
    await waitFor(() => expect(presentSecondaryStack).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      mockComponentListeners.cameras.componentDidDisappear?.();
      mockOnDismissed?.();
      mockComponentListeners.cameras.componentDidAppear?.();
    });
    expect(presentSecondaryStack).toHaveBeenCalledTimes(1);

    act(() => {
      mockComponentListeners.cameras.componentDidDisappear?.();
      mockComponentListeners.cameras.componentDidAppear?.();
    });
    await waitFor(() => expect(presentSecondaryStack).toHaveBeenCalledTimes(2));
  });

  it('retries after a rejected modal transition on the next focus', async () => {
    (presentSecondaryStack as jest.Mock)
      .mockRejectedValueOnce(new Error('navigation failed'))
      .mockResolvedValueOnce(undefined);
    render(<Harness />);
    act(() => {
      mockComponentListeners.cameras.componentDidAppear?.();
    });
    await waitFor(() => expect(presentSecondaryStack).toHaveBeenCalledTimes(1));

    act(() => {
      mockComponentListeners.cameras.componentDidDisappear?.();
      mockComponentListeners.cameras.componentDidAppear?.();
    });

    await waitFor(() => expect(presentSecondaryStack).toHaveBeenCalledTimes(2));
  });

  it('does not duplicate a prompt for repeated focus events', async () => {
    render(<Harness />);
    act(() => {
      mockComponentListeners.cameras.componentDidAppear?.();
    });
    await waitFor(() => expect(presentSecondaryStack).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      mockComponentListeners.cameras.componentDidDisappear?.();
      mockOnDismissed?.();
      mockComponentListeners.cameras.componentDidAppear?.();
      mockComponentListeners.cameras.componentDidAppear?.();
    });
    expect(presentSecondaryStack).toHaveBeenCalledTimes(1);
  });

  it('stops prompting after a server is added', async () => {
    const view = render(<Harness />);
    act(() => {
      mockComponentListeners.cameras.componentDidAppear?.();
    });
    await waitFor(() => expect(presentSecondaryStack).toHaveBeenCalledTimes(1));

    mockCurrentServer = {host: 'frigate.local'};
    view.rerender(<Harness />);
    act(() => {
      mockComponentListeners.cameras.componentDidDisappear?.();
      mockComponentListeners.cameras.componentDidAppear?.();
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(presentSecondaryStack).toHaveBeenCalledTimes(1);
  });

  it('lets only the focused owner prompt and hands off after a later tab switch', async () => {
    render(
      <>
        <Harness componentId="cameras" />
        <Harness componentId="events" />
      </>,
    );

    expect(presentSecondaryStack).not.toHaveBeenCalled();

    act(() => {
      mockComponentListeners.cameras.componentDidAppear?.();
      mockComponentListeners.events.componentDidAppear?.();
    });
    await waitFor(() => expect(presentSecondaryStack).toHaveBeenCalledTimes(1));

    act(() => {
      mockComponentListeners.events.componentDidDisappear?.();
      mockComponentListeners.cameras.componentDidDisappear?.();
      mockOnDismissed?.();
      mockComponentListeners.cameras.componentDidAppear?.();
    });
    expect(presentSecondaryStack).toHaveBeenCalledTimes(1);

    act(() => {
      mockComponentListeners.cameras.componentDidDisappear?.();
      mockComponentListeners.events.componentDidAppear?.();
    });
    await waitFor(() => expect(presentSecondaryStack).toHaveBeenCalledTimes(2));
  });
});
