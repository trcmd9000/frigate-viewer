import {IconOutline, OutlineGlyphMapType} from '@ant-design/icons-react-native';
import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import {useIntl} from 'react-intl';
import {
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import {
  Navigation,
  NavigationFunctionComponent,
} from 'react-native-navigation';
import {ScrollView} from 'react-native-gesture-handler';
import {ICameraEventsProps} from '../camera-events/CameraEvents';
import {useDesignTokens} from '../../helpers/designTokens';
import {SecureLogger} from '../../helpers/secureLogger';
import {
  currentServerScopeGeneration,
  dismissModalWhenServerScopeChanges,
  isCurrentServerScope,
  useServerScopeOwner,
} from '../../helpers/serverScopeScreen';
import {MenuId} from './menuHelpers';
import {MessageKey, messages} from './messages';

interface IMenuProps {
  current?: MenuId;
}

export interface IMenuItem<P extends object = object> {
  id: MenuId;
  icon: OutlineGlyphMapType;
  label?: string;
  view?: string;
  passProps?: P;
  modal?: boolean;
  disabled?: boolean;
}

export interface MenuSection {
  id: string;
  label: MessageKey;
  items: readonly IMenuItem[];
}

// These are retained for the Settings screen, which intentionally keeps
// secondary links reachable without opening the overflow menu first.
export const camerasListMenuItem: IMenuItem = {
  id: 'camerasList',
  icon: 'video-camera',
  view: 'CamerasList',
};

export const cameraEventsMenuItem: IMenuItem = {
  id: 'cameraEvents',
  icon: 'unordered-list',
  view: 'CameraEvents',
};

export const retainedMenuItem: IMenuItem<ICameraEventsProps> = {
  id: 'retained',
  icon: 'star',
  view: 'CameraEvents',
  passProps: {
    retained: true,
  },
};

export const storageMenuItem: IMenuItem = {
  id: 'storage',
  icon: 'pie-chart',
  view: 'Storage',
};

export const systemMenuItem: IMenuItem = {
  id: 'system',
  icon: 'cloud-server',
  view: 'System',
};

export const logsMenuItem: IMenuItem = {
  id: 'logs',
  icon: 'file-text',
  view: 'Logs',
};

export const settingsMenuItem: IMenuItem = {
  id: 'settings',
  icon: 'tool',
  view: 'Settings',
  modal: true,
};

export const authorMenuItem: IMenuItem = {
  id: 'author',
  icon: 'robot',
  view: 'Author',
};

export const reportProblemMenuItem: IMenuItem = {
  id: 'report',
  icon: 'send',
  view: 'Report',
};

/**
 * The overflow is deliberately limited to destinations which are not already
 * represented by the Cameras, Events, and Settings bottom tabs.
 */
export const secondaryMenuSections: readonly MenuSection[] = [
  {
    id: 'saved',
    label: 'section.saved',
    items: [retainedMenuItem],
  },
  {
    id: 'diagnostics',
    label: 'section.diagnostics',
    items: [storageMenuItem, systemMenuItem, logsMenuItem],
  },
  {
    id: 'support',
    label: 'section.support',
    items: [reportProblemMenuItem, authorMenuItem],
  },
];

const pendingNavigations = new Set<string>();

export const navigateToMenuItem =
  <P extends object>(
    {view, modal, passProps}: IMenuItem<P>,
    ownerScopeGeneration = currentServerScopeGeneration(),
  ) =>
  (): Promise<void> => {
    const scoped = view === 'CameraEvents' || view === 'CameraPreview' || view === 'CameraEventClip';
    if (!view || (scoped && !isCurrentServerScope(ownerScopeGeneration))) {
      return Promise.resolve();
    }

    const navigationKey = `${modal ? 'modal' : 'secondary'}:${view}`;
    if (pendingNavigations.has(navigationKey)) {
      return Promise.resolve();
    }

    pendingNavigations.add(navigationKey);
    const clearPendingNavigation = () => {
      pendingNavigations.delete(navigationKey);
    };
    const scopedPassProps = scoped
      ? {...passProps, ownerScopeGeneration}
      : passProps;

    try {
      return Promise.resolve(
        Navigation.showModal({
          stack: {
            children: [
              {
                component: {
                  name: view,
                  passProps: scopedPassProps,
                },
              },
            ],
          },
        }),
      )
        .then(componentId => {
          if (view === 'CameraEvents') {
            dismissModalWhenServerScopeChanges(componentId, ownerScopeGeneration);
          }
        })
        .finally(clearPendingNavigation)
        .catch(error => {
          SecureLogger.logError(error as Error, 'navigation.show-secondary');
        });
    } catch (error) {
      clearPendingNavigation();
      SecureLogger.logError(error as Error, 'navigation.show-secondary');
      return Promise.resolve();
    }
  };

export const Menu: NavigationFunctionComponent<IMenuProps> = ({
  current,
  componentId,
}) => {
  const intl = useIntl();
  const tokens = useDesignTokens();
  const dismissalInFlight = useRef(false);
  const {generation} = useServerScopeOwner();

  const dismissMenu = useCallback((): Promise<void> => {
    if (dismissalInFlight.current) {
      return Promise.resolve();
    }

    dismissalInFlight.current = true;
    try {
      return Promise.resolve(Navigation.dismissOverlay(componentId))
        .then(() => undefined)
        .finally(() => {
          dismissalInFlight.current = false;
        })
        .catch(error => {
          SecureLogger.logError(error as Error, 'navigation.dismiss-secondary-menu');
        });
    } catch (error) {
      dismissalInFlight.current = false;
      SecureLogger.logError(error as Error, 'navigation.dismiss-secondary-menu');
      return Promise.resolve();
    }
  }, [componentId]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        void dismissMenu();
        return true;
      },
    );
    return () => subscription.remove();
  }, [dismissMenu]);

  const sections = useMemo(
    () =>
      secondaryMenuSections.map(section => ({
        ...section,
        label: intl.formatMessage(messages[section.label]),
        items: section.items.map(item => ({
          ...item,
          label: intl.formatMessage(
            messages[`item.${item.id}.label` as MessageKey],
          ),
        })),
      })),
    [intl],
  );

  const navigate = useCallback(
    (item: IMenuItem) => () => {
      if (item.disabled || dismissalInFlight.current) {
        return;
      }

      const navigateToItem = navigateToMenuItem(item, generation);
      void dismissMenu().then(() => {
        if (isCurrentServerScope(generation)) {
          return navigateToItem();
        }
        return undefined;
      });
    },
    [dismissMenu, generation],
  );

  const styles = useMemo(
    () => ({
      root: {
        flex: 1,
        justifyContent: 'flex-end',
      } as ViewStyle,
      scrim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: tokens.colors.scrim,
      } as ViewStyle,
      sheet: {
        maxHeight: '84%',
        paddingTop: tokens.spacing.sm,
        paddingBottom: tokens.spacing.lg,
        backgroundColor: tokens.colors.surfaceElevated,
        borderTopLeftRadius: tokens.geometry.cardRadius,
        borderTopRightRadius: tokens.geometry.cardRadius,
      } as ViewStyle,
      handle: {
        alignSelf: 'center',
        width: 36,
        height: 4,
        marginBottom: tokens.spacing.sm,
        borderRadius: tokens.geometry.pillRadius,
        backgroundColor: tokens.colors.outline,
      } as ViewStyle,
      header: {
        minHeight: tokens.geometry.minimumTouchTarget,
        paddingHorizontal: tokens.spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
      } as ViewStyle,
      title: {
        flex: 1,
        ...tokens.typography.sectionTitle,
        color: tokens.colors.textPrimary,
      } as ViewStyle,
      close: {
        minWidth: tokens.geometry.minimumTouchTarget,
        minHeight: tokens.geometry.minimumTouchTarget,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: tokens.geometry.controlRadius,
      } as ViewStyle,
      sectionLabel: {
        paddingHorizontal: tokens.spacing.lg,
        paddingTop: tokens.spacing.md,
        paddingBottom: tokens.spacing.xs,
        ...tokens.typography.label,
        color: tokens.colors.textSecondary,
      } as ViewStyle,
      row: {
        minHeight: tokens.geometry.minimumTouchTarget,
        paddingHorizontal: tokens.spacing.lg,
        paddingVertical: tokens.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: tokens.geometry.controlRadius,
      } as ViewStyle,
      selectedRow: {
        backgroundColor: tokens.colors.accentContainer,
      } as ViewStyle,
      disabledRow: {
        opacity: 0.5,
      } as ViewStyle,
      icon: {
        marginRight: tokens.spacing.lg,
      } as ViewStyle,
      rowLabel: {
        ...tokens.typography.body,
        color: tokens.colors.textPrimary,
      } as ViewStyle,
    }),
    [tokens],
  );

  return (
    <View
      testID="secondary-menu"
      style={styles.root}
      accessibilityViewIsModal
      importantForAccessibility="yes"
    >
      <Pressable
        testID="secondary-menu-scrim"
        style={styles.scrim}
        onPress={() => {
          void dismissMenu();
        }}
        accessibilityRole="button"
        accessibilityLabel={intl.formatMessage(messages['close.label'])}
        accessibilityHint={intl.formatMessage(messages['close.hint'])}
      />
      <View style={styles.sheet} accessibilityViewIsModal>
        <View style={styles.handle} accessible={false} />
        <View style={styles.header}>
          <Text style={styles.title}>{intl.formatMessage(messages.title)}</Text>
          <Pressable
            onPress={() => {
              void dismissMenu();
            }}
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel={intl.formatMessage(messages['close.label'])}
          >
            <IconOutline
              name="close"
              size={22}
              color={tokens.colors.textPrimary}
              accessible={false}
            />
          </Pressable>
        </View>
        <ScrollView
          accessibilityLabel={intl.formatMessage(messages['items.label'])}
          showsVerticalScrollIndicator={false}
        >
          {sections.map(section => (
            <View key={section.id}>
              <Text style={styles.sectionLabel}>{section.label}</Text>
              {section.items.map(item => {
                const selected = item.id === current;
                return (
                  <Pressable
                    key={item.id}
                    onPress={navigate(item)}
                    disabled={item.disabled}
                    style={[
                      styles.row,
                      selected && styles.selectedRow,
                      item.disabled && styles.disabledRow,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    accessibilityState={{
                      selected,
                      disabled: item.disabled,
                    }}
                  >
                    <IconOutline
                      name={item.icon}
                      size={22}
                      color={
                        item.disabled
                          ? tokens.colors.textSecondary
                          : tokens.colors.textPrimary
                      }
                      accessible={false}
                      style={styles.icon}
                    />
                    <Text style={styles.rowLabel}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};
