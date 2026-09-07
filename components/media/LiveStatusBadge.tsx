import {IconOutline} from '@ant-design/icons-react-native';
import React, {FC} from 'react';
import {ActivityIndicator, Text, TextStyle, View} from 'react-native';
import {useIntl} from 'react-intl';
import {useStyles} from '../../helpers/colors';
import {livePreviewStatus} from '../../helpers/livePreviewStatus';
import type {
  LivePreviewState,
  LivePreviewTransport,
} from '../../helpers/livePreviewStatus';

interface LiveStatusBadgeProps {
  state: LivePreviewState;
  transport?: LivePreviewTransport;
}

const defaultStatusMessages: Record<string, string> = {
  'cameraPreview.status.snapshot': 'Snapshots',
  'cameraPreview.status.preparing': 'Preparing live stream',
  'cameraPreview.status.connecting': 'Connecting to live stream',
  'cameraPreview.status.rtsp': 'RTSP live stream',
  'cameraPreview.status.webrtc': 'WebRTC live stream',
  'cameraPreview.status.live': 'Live stream',
  'cameraPreview.status.reconnecting': 'Reconnecting to live stream',
  'cameraPreview.status.degraded': 'Live degraded; showing snapshots',
  'cameraPreview.status.fallback': 'Snapshot fallback',
};

export const LiveStatusBadge: FC<LiveStatusBadgeProps> = ({
  state,
  transport,
}) => {
  const styles = useStyles(({theme: palette}) => ({
    badge: {
      position: 'absolute',
      top: 12,
      left: '52%',
      right: 12,
      zIndex: 3,
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 0,
      overflow: 'hidden',
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 4,
      backgroundColor: palette.mediaOverlay,
    },
    icon: {
      marginRight: 5,
    },
    text: {
      flexShrink: 1,
      minWidth: 0,
      color: palette.mediaText,
      fontSize: 12,
      fontWeight: '600',
    },
  }));
  const intl = useIntl();
  const status = livePreviewStatus(state, transport);
  const label = intl.formatMessage({
    id: status.messageId,
    defaultMessage: defaultStatusMessages[status.messageId],
  });
  const connecting =
    state === 'preparing' ||
    state === 'connecting' ||
    state === 'reconnecting';

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={styles.badge}
    >
      {connecting ? (
        <ActivityIndicator
          testID="live-status-activity-indicator"
          accessibilityElementsHidden
          animating
          color={(styles.text as TextStyle).color as string}
          size="small"
          style={styles.icon}
        />
      ) : (
        <IconOutline
          name={status.icon}
          color={(styles.text as TextStyle).color as string}
          size={14}
          style={styles.icon}
        />
      )}
      <Text style={styles.text}>{label}</Text>
    </View>
  );
};
