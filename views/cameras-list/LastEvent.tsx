import {FC, useCallback} from 'react';
import {ICameraEvent} from '../camera-events/CameraEvent';
import {Pressable, StyleSheet, View} from 'react-native';
import {EventSnapshot} from '../camera-events/EventSnapshot';
import {EventLabels} from '../camera-events/EventLabels';
import {EventTitle} from '../camera-events/EventTitle';
import {useAppSelector} from '../../store/store';
import {
  selectCamerasNumColumns,
  selectCamerasPreviewHeight,
} from '../../store/settings';
import {useStyles} from '../../helpers/colors';

const styles = StyleSheet.create({
  eventMetadata: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
  },
  eventTitle: {
    position: 'relative',
  },
  eventLabels: {
    position: 'relative',
  },
});

interface ILastEventProps {
  height?: number;
  event?: ICameraEvent;
  onPress?: () => void;
  accessibilityLabel?: string;
}

export const LastEvent: FC<ILastEventProps> = ({
  height,
  event,
  onPress,
  accessibilityLabel,
}) => {
  const previewHeight = useAppSelector(selectCamerasPreviewHeight);
  const numColumns = useAppSelector(selectCamerasNumColumns);
  const themedStyles = useStyles(({theme}) => ({
    media: {
      backgroundColor: theme.mediaBackground,
    },
  }));

  const onEventPress = useCallback(() => {
    if (onPress) {
      onPress();
    }
  }, [onPress]);

  return (
    <Pressable
      onPress={onEventPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{minHeight: 48}}
    >
      <View
        style={{
          width: '100%',
          height: height || previewHeight,
          ...themedStyles.media,
        }}
      >
        {event && (
          <>
            <EventSnapshot
              id={event.id}
              hasSnapshot={event.has_snapshot}
              enabled
            />
            <View style={styles.eventMetadata}>
              <EventLabels
                endTime={event.end_time}
                label={event.label}
                zones={event.zones}
                topScore={event.data.top_score}
                style={styles.eventLabels}
                numColumns={numColumns}
              />
              <EventTitle
                startTime={event.start_time}
                endTime={event.end_time}
                retained={event.retain_indefinitely}
                style={styles.eventTitle}
                numColumns={numColumns}
              />
            </View>
          </>
        )}
      </View>
    </Pressable>
  );
};
