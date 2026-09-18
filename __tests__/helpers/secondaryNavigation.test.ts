import {
  Navigation,
  OptionsModalPresentationStyle,
} from 'react-native-navigation';
import {SecureLogger} from '../../helpers/secureLogger';
import {
  createSecondaryNavigationOptions,
  dismissSecondaryStack,
  dismissSecondaryStackRoot,
  presentSecondaryStack,
  SECONDARY_ROOT_COMPONENT_ID,
  SECONDARY_STACK_ID,
  SECONDARY_TRANSITION_DISTANCE,
  SECONDARY_TRANSITION_DURATION,
} from '../../helpers/secondaryNavigation';
import {darkTheme, lightTheme} from '../../helpers/colors';

const modalDismissedListeners: Array<(event: {componentId: string}) => void> = [];

jest.mock('react-native-navigation', () => ({
  Navigation: {
    dismissModal: jest.fn(),
    events: jest.fn(() => ({
      registerModalDismissedListener: jest.fn(listener => {
        modalDismissedListeners.push(listener);
        return {remove: jest.fn()};
      }),
    })),
    showModal: jest.fn(),
  },
  OptionsModalPresentationStyle: {
    fullScreen: 'fullScreen',
  },
}));

jest.mock('../../helpers/secureLogger', () => ({
  SecureLogger: {
    logError: jest.fn(),
    logInfo: jest.fn(),
  },
}));

describe('secondary navigation', () => {
  const showModal = Navigation.showModal as jest.Mock;
  const dismissModal = Navigation.dismissModal as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    modalDismissedListeners.length = 0;
    showModal.mockResolvedValue(SECONDARY_ROOT_COMPONENT_ID);
    dismissModal.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await dismissSecondaryStack().catch(() => undefined);
  });

  it('presents one guarded full-screen stack and retains the guard', async () => {
    let finishPresentation: (() => void) | undefined;
    showModal.mockReturnValue(
      new Promise<void>(resolve => {
        finishPresentation = resolve;
      }),
    );

    const first = presentSecondaryStack({
      componentName: 'Settings',
      passProps: {ownerScopeGeneration: 4},
    });
    await expect(
      presentSecondaryStack({componentName: 'Logs'}),
    ).resolves.toBeUndefined();

    expect(showModal).toHaveBeenCalledTimes(1);
    const defaults = createSecondaryNavigationOptions(lightTheme, 'light');
    expect(showModal).toHaveBeenCalledWith({
      stack: {
        id: SECONDARY_STACK_ID,
        children: [
          {
            component: {
              id: SECONDARY_ROOT_COMPONENT_ID,
              name: 'Settings',
              passProps: {ownerScopeGeneration: 4},
              options: undefined,
            },
          },
        ],
        options: {
          ...defaults,
          modalPresentationStyle: OptionsModalPresentationStyle.fullScreen,
          hardwareBackButton: {
            dismissModalOnPress: true,
            popStackOnPress: true,
          },
        },
      },
    });

    finishPresentation?.();
    await expect(first).resolves.toBe(SECONDARY_ROOT_COMPONENT_ID);
    await expect(
      presentSecondaryStack({componentName: 'Logs'}),
    ).resolves.toBeUndefined();
    expect(SecureLogger.logInfo).toHaveBeenCalledWith(
      'Ignored duplicate secondary stack presentation',
      'navigation.secondary',
    );
  });

  it.each([
    ['light', lightTheme, 'dark'],
    ['dark', darkTheme, 'light'],
  ] as const)(
    'creates stable app chrome for the %s theme',
    (scheme, theme, statusBarStyle) => {
      const options = createSecondaryNavigationOptions(theme, scheme);

      expect(options.layout).toEqual({
        backgroundColor: theme.background,
        componentBackgroundColor: theme.background,
        fitSystemWindows: true,
      });
      expect(options.topBar).toEqual(
        expect.objectContaining({
          visible: true,
          drawBehind: false,
          background: {color: theme.surface},
        }),
      );
      expect(options.statusBar).toEqual({
        visible: true,
        drawBehind: false,
        translucent: false,
        hideWithTopBar: false,
        backgroundColor: theme.background,
        style: statusBarStyle,
      });
      expect(options.navigationBar).toEqual({
        visible: true,
        backgroundColor: theme.background,
      });
    },
  );

  it('uses short decelerating show/push animations and reverse dismiss/pop animations', () => {
    const animations = createSecondaryNavigationOptions(
      lightTheme,
      'light',
    ).animations;
    const entering = {
      translationX: {
        from: SECONDARY_TRANSITION_DISTANCE,
        to: 0,
        duration: SECONDARY_TRANSITION_DURATION,
        interpolation: {type: 'decelerate', factor: 1.2},
      },
      alpha: {
        from: 0,
        to: 1,
        duration: SECONDARY_TRANSITION_DURATION,
        interpolation: {type: 'decelerate', factor: 1.2},
      },
      waitForRender: true,
    };
    const leaving = {
      translationX: {
        from: 0,
        to: SECONDARY_TRANSITION_DISTANCE,
        duration: SECONDARY_TRANSITION_DURATION,
        interpolation: {type: 'decelerate', factor: 1.2},
      },
      alpha: {
        from: 1,
        to: 0,
        duration: SECONDARY_TRANSITION_DURATION,
        interpolation: {type: 'decelerate', factor: 1.2},
      },
      waitForRender: true,
    };

    expect(animations).toEqual({
      showModal: entering,
      dismissModal: leaving,
      push: {waitForRender: true, content: entering},
      pop: {waitForRender: true, content: leaving},
    });
  });

  it('merges caller stack overrides without dropping other defaults', async () => {
    await presentSecondaryStack({
      componentName: 'Settings',
      theme: darkTheme,
      colorScheme: 'dark',
      rootOptions: {topBar: {title: {text: 'Settings'}}},
      stackOptions: {
        topBar: {title: {fontSize: 18}},
        animations: {push: {enabled: false}},
      },
    });

    const layout = showModal.mock.calls[0][0];
    expect(layout.stack.children[0].component.options).toEqual({
      topBar: {title: {text: 'Settings'}},
    });
    expect(layout.stack.options).toEqual(
      expect.objectContaining({
        layout: {
          backgroundColor: darkTheme.background,
          componentBackgroundColor: darkTheme.background,
          fitSystemWindows: true,
        },
        topBar: expect.objectContaining({
          background: {color: darkTheme.surface},
          title: {color: darkTheme.text, fontSize: 18},
        }),
        animations: expect.objectContaining({
          push: {enabled: false},
          pop: expect.any(Object),
          showModal: expect.any(Object),
          dismissModal: expect.any(Object),
        }),
      }),
    );
  });

  it('dismisses only the root, deduplicates dismissal, and resets afterward', async () => {
    const onDismissed = jest.fn();
    await presentSecondaryStack({
      componentName: 'Settings',
      dismissOptions: {animations: {dismissModal: {enabled: false}}},
      onDismissed,
    });

    let finishDismissal: (() => void) | undefined;
    dismissModal.mockReturnValue(
      new Promise<void>(resolve => {
        finishDismissal = resolve;
      }),
    );

    await expect(dismissSecondaryStackRoot('NestedScreen')).resolves.toBe(false);
    const firstDismissal = dismissSecondaryStackRoot(
      SECONDARY_ROOT_COMPONENT_ID,
    );
    const duplicateDismissal = dismissSecondaryStack();
    expect(dismissModal).toHaveBeenCalledTimes(1);
    expect(dismissModal).toHaveBeenCalledWith(SECONDARY_ROOT_COMPONENT_ID, {
      animations: {dismissModal: {enabled: false}},
    });

    finishDismissal?.();
    await expect(firstDismissal).resolves.toBe(true);
    await expect(duplicateDismissal).resolves.toBe(true);
    expect(onDismissed).toHaveBeenCalledWith('explicit');

    await presentSecondaryStack({componentName: 'Logs'});
    expect(showModal).toHaveBeenCalledTimes(2);
  });

  it.each([SECONDARY_ROOT_COMPONENT_ID, SECONDARY_STACK_ID])(
    'resets when native dismissal reports %s',
    async dismissedComponentId => {
      const onDismissed = jest.fn();
      await presentSecondaryStack({componentName: 'Settings', onDismissed});

      modalDismissedListeners[0]({componentId: dismissedComponentId});

      expect(onDismissed).toHaveBeenCalledWith('native');
      await presentSecondaryStack({componentName: 'Logs'});
      expect(showModal).toHaveBeenCalledTimes(2);
    },
  );

  it('logs presentation failures, calls the scoped hook, and resets the guard', async () => {
    const error = new Error('native presentation failed');
    const onError = jest.fn();
    showModal.mockRejectedValueOnce(error);

    await expect(
      presentSecondaryStack({componentName: 'Settings', onError}),
    ).rejects.toBe(error);
    expect(SecureLogger.logError).toHaveBeenCalledWith(
      error,
      'navigation.secondary-present',
    );
    expect(onError).toHaveBeenCalledWith(error, 'present');

    await presentSecondaryStack({componentName: 'Logs'});
    expect(showModal).toHaveBeenCalledTimes(2);
  });

  it('logs dismiss failures, permits retry, and keeps the active guard', async () => {
    const error = new Error('native dismissal failed');
    const onError = jest.fn();
    await presentSecondaryStack({componentName: 'Settings', onError});
    dismissModal.mockRejectedValueOnce(error);

    await expect(dismissSecondaryStack()).rejects.toBe(error);
    expect(SecureLogger.logError).toHaveBeenCalledWith(
      error,
      'navigation.secondary-dismiss',
    );
    expect(onError).toHaveBeenCalledWith(error, 'dismiss');
    await expect(
      presentSecondaryStack({componentName: 'Logs'}),
    ).resolves.toBeUndefined();

    await expect(dismissSecondaryStack()).resolves.toBe(true);
    await presentSecondaryStack({componentName: 'Logs'});
    expect(showModal).toHaveBeenCalledTimes(2);
  });

  it('does not present or call lifecycle hooks for a stale server scope', async () => {
    const onPresented = jest.fn();
    await expect(
      presentSecondaryStack({
        componentName: 'CameraEvents',
        isCurrentScope: () => false,
        onPresented,
      }),
    ).resolves.toBeUndefined();

    expect(showModal).not.toHaveBeenCalled();
    expect(onPresented).not.toHaveBeenCalled();
  });

  it('dismisses once without stale callbacks when scope changes during presentation', async () => {
    let currentScope = true;
    let finishPresentation: (() => void) | undefined;
    const onPresented = jest.fn();
    const onDismissed = jest.fn();
    showModal.mockReturnValueOnce(
      new Promise<void>(resolve => {
        finishPresentation = resolve;
      }),
    );

    const presentation = presentSecondaryStack({
      componentName: 'CameraEvents',
      passProps: {retained: true, ownerScopeGeneration: 4},
      isCurrentScope: () => currentScope,
      onPresented,
      onDismissed,
    });

    currentScope = false;
    finishPresentation?.();
    await expect(presentation).resolves.toBe(SECONDARY_ROOT_COMPONENT_ID);

    expect(dismissModal).toHaveBeenCalledTimes(1);
    expect(dismissModal).toHaveBeenCalledWith(
      SECONDARY_ROOT_COMPONENT_ID,
      expect.any(Object),
    );
    expect(onPresented).not.toHaveBeenCalled();
    expect(onDismissed).not.toHaveBeenCalled();

    await presentSecondaryStack({componentName: 'Logs'});
    expect(showModal).toHaveBeenCalledTimes(2);
  });
});
