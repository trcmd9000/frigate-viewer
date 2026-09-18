import {
  Navigation,
  NavigationButtonPressedEvent,
  Options,
  OptionsModalPresentationStyle,
  OptionsTopBarButton,
} from 'react-native-navigation';
import {Appearance} from 'react-native';
import {
  ColorScheme,
  darkTheme,
  lightTheme,
  resolveColorScheme,
  Theme,
} from './colors';
import {SecureLogger} from './secureLogger';
import {selectAppColorScheme} from '../store/settings';
import {store} from '../store/store';

export const SECONDARY_STACK_ID = 'SecondaryStack';
export const SECONDARY_ROOT_COMPONENT_ID = 'SecondaryStackRoot';
export const SECONDARY_ROOT_DISMISS_BUTTON_ID = 'dismissSecondaryStack';
export const SECONDARY_TRANSITION_DISTANCE = 48;
export const SECONDARY_TRANSITION_DURATION = 240;

const SECONDARY_TRANSITION_INTERPOLATION = {
  type: 'decelerate' as const,
  factor: 1.2,
};

const enteringSecondaryContent = () => ({
  translationX: {
    from: SECONDARY_TRANSITION_DISTANCE,
    to: 0,
    duration: SECONDARY_TRANSITION_DURATION,
    interpolation: SECONDARY_TRANSITION_INTERPOLATION,
  },
  alpha: {
    from: 0,
    to: 1,
    duration: SECONDARY_TRANSITION_DURATION,
    interpolation: SECONDARY_TRANSITION_INTERPOLATION,
  },
  waitForRender: true,
});

const leavingSecondaryContent = () => ({
  translationX: {
    from: 0,
    to: SECONDARY_TRANSITION_DISTANCE,
    duration: SECONDARY_TRANSITION_DURATION,
    interpolation: SECONDARY_TRANSITION_INTERPOLATION,
  },
  alpha: {
    from: 1,
    to: 0,
    duration: SECONDARY_TRANSITION_DURATION,
    interpolation: SECONDARY_TRANSITION_INTERPOLATION,
  },
  waitForRender: true,
});

/**
 * App-surface defaults for secondary modal stacks and their nested screens.
 * Media/event surfaces intentionally use their own immersive options.
 */
export const createSecondaryNavigationOptions = (
  theme: Theme,
  scheme: ColorScheme,
): Options => ({
  layout: {
    backgroundColor: theme.background,
    componentBackgroundColor: theme.background,
    fitSystemWindows: true,
  },
  topBar: {
    visible: true,
    drawBehind: false,
    background: {
      color: theme.surface,
    },
    title: {
      color: theme.text,
    },
    backButton: {
      color: theme.text,
    },
  },
  statusBar: {
    visible: true,
    drawBehind: false,
    translucent: false,
    hideWithTopBar: false,
    backgroundColor: theme.background,
    style: scheme === 'dark' ? 'light' : 'dark',
  },
  navigationBar: {
    visible: true,
    backgroundColor: theme.background,
  },
  animations: {
    showModal: enteringSecondaryContent(),
    dismissModal: leavingSecondaryContent(),
    push: {
      waitForRender: true,
      content: enteringSecondaryContent(),
    },
    pop: {
      waitForRender: true,
      content: leavingSecondaryContent(),
    },
  },
});

const mergeSecondaryOptions = (
  defaults: Options,
  overrides?: Options,
): Options => {
  if (!overrides) {
    return defaults;
  }

  return {
    ...defaults,
    ...overrides,
    layout: {...defaults.layout, ...overrides.layout},
    topBar: overrides.topBar
      ? {
          ...defaults.topBar,
          ...overrides.topBar,
          background: {
            ...defaults.topBar?.background,
            ...overrides.topBar.background,
          },
          title: {...defaults.topBar?.title, ...overrides.topBar.title},
          backButton: {
            ...defaults.topBar?.backButton,
            ...overrides.topBar.backButton,
          },
        }
      : defaults.topBar,
    statusBar: {...defaults.statusBar, ...overrides.statusBar},
    navigationBar: {
      ...defaults.navigationBar,
      ...overrides.navigationBar,
    },
    animations: {
      ...defaults.animations,
      ...overrides.animations,
    },
    hardwareBackButton: {
      ...defaults.hardwareBackButton,
      ...overrides.hardwareBackButton,
    },
  };
};

const currentSecondaryTheme = (): {
  theme: Theme;
  scheme: ColorScheme;
} => {
  const scheme = resolveColorScheme(
    selectAppColorScheme(store.getState()),
    Appearance.getColorScheme(),
  );
  return {
    scheme,
    theme: scheme === 'dark' ? darkTheme : lightTheme,
  };
};

export type SecondaryStackDismissReason = 'explicit' | 'native';
export type SecondaryStackOperation = 'present' | 'dismiss';

export interface SecondaryStackLifecycleHooks {
  /**
   * Allows server-owned callers to suppress stale lifecycle callbacks. The
   * navigation cleanup itself always runs, even after the scope changes.
   */
  isCurrentScope?: () => boolean;
  onPresented?: (rootComponentId: string) => void;
  onDismissed?: (reason: SecondaryStackDismissReason) => void;
  onError?: (error: Error, operation: SecondaryStackOperation) => void;
}

export interface PresentSecondaryStackOptions<P extends object = object>
  extends SecondaryStackLifecycleHooks {
  componentName: string;
  passProps?: P;
  theme?: Theme;
  colorScheme?: ColorScheme;
  rootOptions?: Options;
  /** Overrides the secondary stack's themed chrome and transition defaults. */
  stackOptions?: Options;
  /** Overrides the default reverse modal transition. */
  dismissOptions?: Options;
}

interface ActiveSecondaryStack extends SecondaryStackLifecycleHooks {
  dismissOptions?: Options;
  dismissalPromise?: Promise<boolean>;
  modalDismissedSubscription?: {remove: () => void};
}

let activeSecondaryStack: ActiveSecondaryStack | undefined;

const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const isHookCurrent = (hooks: SecondaryStackLifecycleHooks): boolean => {
  try {
    return hooks.isCurrentScope?.() ?? true;
  } catch (error) {
    SecureLogger.logError(
      asError(error),
      'navigation.secondary-scope-callback',
    );
    return false;
  }
};

const invokeCurrentHook = (
  hooks: SecondaryStackLifecycleHooks,
  callback: () => void,
  context: string,
): void => {
  if (!isHookCurrent(hooks)) {
    return;
  }
  try {
    callback();
  } catch (error) {
    SecureLogger.logError(asError(error), context);
  }
};

const clearActiveStack = (
  stack: ActiveSecondaryStack,
  reason: SecondaryStackDismissReason,
): void => {
  if (activeSecondaryStack !== stack) {
    return;
  }

  activeSecondaryStack = undefined;
  stack.modalDismissedSubscription?.remove();
  SecureLogger.logInfo(
    `Secondary stack dismissed (${reason})`,
    'navigation.secondary',
  );
  if (stack.onDismissed) {
    invokeCurrentHook(
      stack,
      () => stack.onDismissed?.(reason),
      'navigation.secondary-dismissed-callback',
    );
  }
};

const reportFailure = (
  stack: SecondaryStackLifecycleHooks,
  error: unknown,
  operation: SecondaryStackOperation,
): Error => {
  const failure = asError(error);
  SecureLogger.logError(failure, `navigation.secondary-${operation}`);
  if (stack.onError) {
    invokeCurrentHook(
      stack,
      () => stack.onError?.(failure, operation),
      'navigation.secondary-error-callback',
    );
  }
  return failure;
};

/**
 * Presents one full-screen modal stack. The guard remains held until the
 * stack is explicitly dismissed or native navigation reports its dismissal.
 */
export const presentSecondaryStack = async <P extends object>(
  options: PresentSecondaryStackOptions<P>,
): Promise<string | undefined> => {
  if (activeSecondaryStack) {
    SecureLogger.logInfo(
      'Ignored duplicate secondary stack presentation',
      'navigation.secondary',
    );
    return undefined;
  }
  if (!isHookCurrent(options)) {
    SecureLogger.logInfo(
      'Ignored stale secondary stack presentation',
      'navigation.secondary',
    );
    return undefined;
  }

  const stack: ActiveSecondaryStack = {
    isCurrentScope: options.isCurrentScope,
    onPresented: options.onPresented,
    onDismissed: options.onDismissed,
    onError: options.onError,
  };
  const currentTheme = currentSecondaryTheme();
  const secondaryDefaults = createSecondaryNavigationOptions(
    options.theme ?? currentTheme.theme,
    options.colorScheme ?? currentTheme.scheme,
  );
  const stackOptions = mergeSecondaryOptions(
    secondaryDefaults,
    options.stackOptions,
  );
  const dismissDefaults: Options = {
    animations: {
      dismissModal: stackOptions.animations?.dismissModal,
    },
  };
  stack.dismissOptions = options.dismissOptions
    ? {
        ...dismissDefaults,
        ...options.dismissOptions,
        animations: {
          ...dismissDefaults.animations,
          ...options.dismissOptions.animations,
        },
      }
    : dismissDefaults;
  activeSecondaryStack = stack;
  SecureLogger.logInfo(
    'Presenting secondary stack',
    'navigation.secondary',
  );

  try {
    stack.modalDismissedSubscription = Navigation.events()
      .registerModalDismissedListener(event => {
        if (
          event.componentId === SECONDARY_ROOT_COMPONENT_ID ||
          event.componentId === SECONDARY_STACK_ID
        ) {
          clearActiveStack(stack, 'native');
        }
      });

    await Navigation.showModal({
      stack: {
        id: SECONDARY_STACK_ID,
        children: [
          {
            component: {
              id: SECONDARY_ROOT_COMPONENT_ID,
              name: options.componentName,
              passProps: options.passProps,
              options: options.rootOptions,
            },
          },
        ],
        options: {
          ...stackOptions,
          modalPresentationStyle: OptionsModalPresentationStyle.fullScreen,
          hardwareBackButton: {
            ...stackOptions.hardwareBackButton,
            dismissModalOnPress: true,
            popStackOnPress: true,
          },
        },
      },
    });

  } catch (error) {
    if (activeSecondaryStack === stack) {
      activeSecondaryStack = undefined;
      stack.modalDismissedSubscription?.remove();
    }
    throw reportFailure(stack, error, 'present');
  }

  if (activeSecondaryStack === stack) {
    if (!isHookCurrent(stack)) {
      SecureLogger.logInfo(
        'Dismissing stale secondary stack after presentation',
        'navigation.secondary',
      );
      await dismissSecondaryStack();
    } else {
      SecureLogger.logInfo(
        'Secondary stack presented',
        'navigation.secondary',
      );
      if (stack.onPresented) {
        invokeCurrentHook(
          stack,
          () => stack.onPresented?.(SECONDARY_ROOT_COMPONENT_ID),
          'navigation.secondary-presented-callback',
        );
      }
    }
  }
  return SECONDARY_ROOT_COMPONENT_ID;
};

/** Dismisses the secondary root and returns control to the bottom-tab shell. */
export const dismissSecondaryStack = (): Promise<boolean> => {
  const stack = activeSecondaryStack;
  if (!stack) {
    SecureLogger.logInfo(
      'Ignored secondary stack dismissal with no active stack',
      'navigation.secondary',
    );
    return Promise.resolve(false);
  }
  if (stack.dismissalPromise) {
    return stack.dismissalPromise;
  }

  SecureLogger.logInfo(
    'Dismissing secondary stack',
    'navigation.secondary',
  );
  let nativeDismissal: Promise<unknown>;
  try {
    nativeDismissal = Promise.resolve(
      Navigation.dismissModal(
        SECONDARY_ROOT_COMPONENT_ID,
        stack.dismissOptions,
      ),
    );
  } catch (error) {
    nativeDismissal = Promise.reject(error);
  }
  const dismissalPromise = nativeDismissal
    .then(() => {
      clearActiveStack(stack, 'explicit');
      return true;
    })
    .catch(error => {
      throw reportFailure(stack, error, 'dismiss');
    })
    .finally(() => {
      if (activeSecondaryStack === stack) {
        stack.dismissalPromise = undefined;
      }
    });
  stack.dismissalPromise = dismissalPromise;
  return dismissalPromise;
};

/**
 * Root-only variant for screen callbacks; nested screens must use native pop.
 */
export const dismissSecondaryStackRoot = (
  componentId: string,
): Promise<boolean> =>
  componentId === SECONDARY_ROOT_COMPONENT_ID
    ? dismissSecondaryStack()
    : Promise.resolve(false);

export const createSecondaryStackDismissButton = (
  text: string,
): OptionsTopBarButton => ({
  id: SECONDARY_ROOT_DISMISS_BUTTON_ID,
  text,
});

/** Handles the shared root top-bar button without intercepting nested Back. */
export const handleSecondaryStackNavigationButton = (
  event: NavigationButtonPressedEvent,
): Promise<boolean> =>
  event.componentId === SECONDARY_ROOT_COMPONENT_ID &&
  event.buttonId === SECONDARY_ROOT_DISMISS_BUTTON_ID
    ? dismissSecondaryStack()
    : Promise.resolve(false);
