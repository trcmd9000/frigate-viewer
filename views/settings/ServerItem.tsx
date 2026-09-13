import React, {FC, useMemo} from 'react';
import {Pressable, Text, View} from 'react-native';
import {useIntl} from 'react-intl';
import {IconOutline} from '@ant-design/icons-react-native';
import {Server} from '../../store/settings';
import {useStyles, useTheme} from '../../helpers/colors';
import {MessageKey, messages} from './messages';
import {StatusChip} from '../../components/primitives';

interface ServerItemProps {
  server: Server;
  active?: boolean;
  isActive?: boolean;
  onSelect?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Kept as aliases for callers from the pre-profile settings surface. */
  onPress?: () => void;
  onRemovePress?: () => void;
}

/**
 * A profile deliberately renders only a display identity and configuration
 * state. Endpoint details and credentials are not needed on the landing page.
 */
export const ServerItem: FC<ServerItemProps> = ({
  server,
  active,
  isActive,
  onSelect,
  onEdit,
  onDelete,
  onPress,
  onRemovePress,
}) => {
  const theme = useTheme();
  const intl = useIntl();
  const styles = useStyles(({theme: currentTheme}) => ({
    wrapper: {
      marginVertical: 6,
      borderWidth: 1,
      borderColor: active || isActive ? currentTheme.link : currentTheme.border,
      borderRadius: 8,
      backgroundColor: currentTheme.surface,
      overflow: 'hidden',
    },
    select: {
      minHeight: 64,
      padding: 10,
      flexDirection: 'row',
      alignItems: 'center',
    },
    radio: {
      width: 24,
      height: 24,
      marginRight: 12,
      borderWidth: 2,
      borderRadius: 12,
      borderColor: currentTheme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioActive: {
      borderColor: currentTheme.link,
    },
    radioDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: currentTheme.link,
    },
    data: {
      flex: 1,
    },
    identity: {
      color: currentTheme.text,
      fontSize: 16,
      fontWeight: '600',
    },
    property: {
      color: currentTheme.text,
      fontSize: 13,
      marginTop: 3,
    },
    propertyLabel: {
      color: currentTheme.text,
      fontWeight: '600',
    },
    propertyValue: {
      color: currentTheme.text,
    },
    actions: {
      minHeight: 48,
      paddingHorizontal: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      borderTopWidth: 1,
      borderTopColor: currentTheme.border,
    },
    action: {
      minWidth: 48,
      minHeight: 48,
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    actionText: {
      color: currentTheme.link,
      fontSize: 14,
      fontWeight: '600',
      marginLeft: 4,
    },
    deleteText: {
      color: currentTheme.error,
    },
  }));

  const selected = active ?? isActive ?? false;
  const configured = Boolean(server.host?.trim());
  const authSummary = intl.formatMessage(
    messages[`server.auth.option.${server.auth}` as MessageKey],
  );
  const identity = useMemo(() => {
    const candidate = (server as Server & {label?: string}).label?.trim();
    if (candidate) {
      return candidate;
    }

    const authority = String(server.host || '')
      .trim()
      .replace(/^[a-z][a-z\d+\-.]*:\/\//i, '')
      .replace(/^[^/@]+@/, '')
      .split(/[/?#]/, 1)[0];
    const host = authority.startsWith('[')
      ? authority.slice(0, authority.indexOf(']') + 1)
      : authority.replace(/:\d+$/, '');
    return host || intl.formatMessage(messages['server.profile.unnamed']);
  }, [intl, server]);
  const statusMessage = intl.formatMessage(
    configured
      ? messages['server.profile.configured']
      : messages['server.profile.needsSetup'],
  );
  const select = onSelect || onPress;
  const edit = onEdit || onPress;
  const remove = onDelete || onRemovePress;

  return (
    <View
      style={styles.wrapper}
      testID={
        server.profileId ? `server-profile-${server.profileId}` : undefined
      }
    >
      <Pressable
        style={styles.select}
        onPress={select}
        accessibilityRole="radio"
        accessibilityLabel={`${identity}, ${statusMessage}`}
        accessibilityState={{selected}}
        testID={
          server.profileId
            ? `server-profile-select-${server.profileId}`
            : undefined
        }
      >
        <View style={[styles.radio, selected && styles.radioActive]}>
          {selected && <View style={styles.radioDot} />}
        </View>
        <View style={styles.data}>
          <Text style={styles.identity} numberOfLines={1}>
            {identity}
          </Text>
          <Text style={styles.property}>{statusMessage}</Text>
          <Text style={styles.property}>
            <Text style={styles.propertyLabel}>
              {intl.formatMessage(messages['server.auth.label'])}:
            </Text>{' '}
            <Text style={styles.propertyValue}>{authSummary}</Text>
          </Text>
          {server.mtlsEnabled === true && (
            <StatusChip
              label={intl.formatMessage(
                messages['server.profile.mtlsRequired'],
              )}
              tone="accent"
            />
          )}
        </View>
        {selected && (
          <StatusChip
            label={intl.formatMessage(messages['server.profile.active'])}
            tone="accent"
          />
        )}
      </Pressable>
      <View style={styles.actions}>
        <Pressable
          style={styles.action}
          onPress={edit}
          accessibilityRole="button"
          accessibilityLabel={intl.formatMessage(messages['server.profile.edit'])}
          testID={
            server.profileId ? `server-profile-edit-${server.profileId}` : undefined
          }
        >
          <IconOutline
            name="edit"
            color={theme.link}
            size={20}
            accessible={false}
          />
          <Text style={styles.actionText}>
            {intl.formatMessage(messages['server.profile.editAction'])}
          </Text>
        </Pressable>
        <Pressable
          style={styles.action}
          onPress={remove}
          accessibilityRole="button"
          accessibilityLabel={intl.formatMessage(
            messages['server.profile.delete'],
          )}
          testID={
            server.profileId
              ? `server-profile-delete-${server.profileId}`
              : undefined
          }
        >
          <IconOutline
            name="delete"
            color={theme.error}
            size={20}
            accessible={false}
          />
          <Text style={[styles.actionText, styles.deleteText]}>
            {intl.formatMessage(messages['server.profile.deleteAction'])}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};
