import React, {FC, ComponentType, useCallback, useMemo} from 'react';
import {IconFill, IconOutline} from '@ant-design/icons-react-native';
import {
  Image,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import {useIntl} from 'react-intl';
import {useRest} from '../../helpers/rest';
import {
  selectEventsSnapshotHeight,
  selectEventsNumColumns,
  selectServer,
} from '../../store/settings';
import {useAppSelector} from '../../store/store';
import {EventLabels} from './EventLabels';
import {EventTitle} from './EventTitle';
import {messages} from './messages';
import {EventSnapshot} from './EventSnapshot';
import {useStyles, useTheme} from '../../helpers/colors';
import {SecureLogger} from '../../helpers/secureLogger';
import {handleError} from '../../helpers/errorHandler';
import {MediaSurface, SurfaceCard} from '../../components/primitives';
import {
  gridCellGutters,
  gridCellWidth,
} from '../../helpers/gridLayout';
import {useEventRetention} from './useEventRetention';

interface DrawerItemProps {
  text: string;
  icon: number;
  background: string;
  onPress: () => void;
}

const Drawer = require('react-native-ui-lib').Drawer as ComponentType<{
  leftItem?: DrawerItemProps;
  rightItems?: DrawerItemProps[];
  style?: ViewStyle;
  children?: React.ReactNode;
}>;

export interface ICameraEvent {
  id: string;
  camera: string;
  thumbnail: string;
  start_time: number;
  end_time: number; // timestamp
  zones: string[];
  area: string | null;
  box: string | null;
  has_clip: boolean;
  has_snapshot: boolean;
  label: string;
  sub_label: string | null;
  plus_id: string | null;
  data: {
    top_score: number; // float [0,1]
  };
  false_positive: null;
  ratio: null;
  region: null;
  retain_indefinitely: boolean;
}

interface ICameraEventProps extends ICameraEvent {
  componentId: string;
  index?: number;
  onDelete: (id: string[]) => void;
  onSnapshotDimensions: (width: number, height: number) => void;
  onEventPress: (event: ICameraEvent) => void;
  onShare: (event: ICameraEvent) => void;
  onRetainedChange: (eventId: string, retained: boolean) => void;
  mediaEnabled: boolean;
  layoutColumns?: number;
}

export const CameraEvent: FC<ICameraEventProps> = props => {
  const theme = useTheme();
  const styles = useStyles(({theme: palette}) => ({
    cameraEvent: {
      backgroundColor: palette.surface,
      flex: 1,
      position: 'relative',
    },
    metadata: {
      padding: 10,
      gap: 4,
    },
    cameraName: {
      color: palette.text,
      fontSize: 14,
      fontWeight: '600',
    },
    retentionButton: {
      position: 'absolute',
      right: 8,
      top: 8,
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.mediaOverlayPanel,
      zIndex: 1,
    },
  }));

  const {
    onDelete,
    onSnapshotDimensions,
    onEventPress,
    onShare,
    onRetainedChange,
    mediaEnabled,
    layoutColumns,
    index = 0,
    ...event
  } = props;
  const {
    id,
    has_snapshot,
    start_time,
    end_time,
    label,
    zones,
    data,
    retain_indefinitely,
  } = event;
  const server = useAppSelector(selectServer);
  const snapshotHeight = useAppSelector(selectEventsSnapshotHeight);
  const preferredColumns = useAppSelector(selectEventsNumColumns) ?? 1;
  const numColumns = layoutColumns ?? preferredColumns;
  const {width: listWidth} = useWindowDimensions();
  const intl = useIntl();
  const {del} = useRest();
  const {
    retained,
    updating: retentionUpdating,
    toggleRetained,
    label: retentionLabel,
    hint: retentionHint,
  } = useEventRetention({
    eventId: id,
    initiallyRetained: retain_indefinitely,
    onRetainedChange: nextRetained => onRetainedChange(id, nextRetained),
  });
  const gutters = gridCellGutters(index, numColumns, 12);
  const cellWidth = gridCellWidth(listWidth, numColumns, 12);

  const onSnapshotLoad = useCallback(
    async (snapshot: string) => {
      try {
        SecureLogger.logRequest('GET', '/snapshot');
        Image.getSize(snapshot, (width, height) => {
          onSnapshotDimensions(width, height);
        });
      } catch (err) {
        SecureLogger.logError(err as Error, 'loading-snapshot');
      }
    },
    [onSnapshotDimensions],
  );

  const deleteDrawerItem: DrawerItemProps = useMemo(
    () => ({
      text: intl.formatMessage(messages['action.delete']),
      icon: require('./icons/delete.png'),
      background: theme.error,
      onPress: () => {
        void del(server, `events/${id}`, {json: false})
          .then(() => {
            onDelete([id]);
          })
          .catch(error => handleError(error, 'CameraEvent.delete'));
      },
    }),
    [del, id, intl, onDelete, server, theme],
  );

  const retainDrawerItem: DrawerItemProps = useMemo(
    () =>
      retained
        ? {
            text: intl.formatMessage(messages['action.unretain']),
            icon: require('./icons/star.png'),
            background: theme.error,
            onPress: toggleRetained,
          }
        : {
            text: intl.formatMessage(messages['action.retain']),
            icon: require('./icons/star.png'),
            background: theme.success,
            onPress: toggleRetained,
          },
    [intl, retained, theme, toggleRetained],
  );

  const shareDrawerItem: DrawerItemProps = useMemo(
    () => ({
      text: intl.formatMessage(messages['action.share']),
      icon: require('./icons/share.png'),
      background: theme.info,
      onPress: () => {
        onShare(event);
      },
    }),
    [event, intl, onShare, theme.info],
  );
  return (
    <Drawer
      leftItem={deleteDrawerItem}
      rightItems={[shareDrawerItem, retainDrawerItem]}
      style={{
        width: cellWidth + gutters.left + gutters.right,
        paddingVertical: 6,
        paddingLeft: gutters.left,
        paddingRight: gutters.right,
      }}
    >
      <SurfaceCard style={{padding: 0, overflow: 'hidden'}}>
        <View style={styles.cameraEvent}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={retentionLabel}
            accessibilityHint={retentionHint}
            accessibilityState={{
              busy: retentionUpdating,
              disabled: retentionUpdating,
              selected: retained,
            }}
            disabled={retentionUpdating}
            hitSlop={8}
            onPress={toggleRetained}
            style={styles.retentionButton}
            testID={`event-retention-${id}`}
          >
            {retained ? (
              <IconFill
                accessible={false}
                color={theme.warning}
                name="star"
                size={24}
              />
            ) : (
              <IconOutline
                accessible={false}
                color={theme.mediaText}
                name="star"
                size={24}
              />
            )}
          </Pressable>
          <Pressable
            onPress={() => onEventPress(event)}
            accessibilityRole="button"
            accessibilityLabel={`${event.camera}, ${label} event`}
            accessibilityHint={intl.formatMessage(messages['action.open'])}
          >
            <MediaSurface
              style={{
                aspectRatio: undefined,
                height: snapshotHeight,
                borderTopLeftRadius: 4,
                borderTopRightRadius: 4,
              }}
              accessible
              accessibilityLabel={`${event.camera} ${label} event thumbnail`}
            >
              <EventSnapshot
                id={id}
                hasSnapshot={has_snapshot}
                enabled={mediaEnabled}
                onSnapshotLoad={onSnapshotLoad}
              />
            </MediaSurface>
            <View style={styles.metadata}>
              <Text style={styles.cameraName}>{event.camera}</Text>
              <EventLabels
                endTime={end_time}
                label={label}
                zones={zones}
                topScore={data.top_score}
                numColumns={numColumns}
              />
              <EventTitle
                startTime={start_time}
                endTime={end_time}
                retained={retained}
                numColumns={numColumns}
              />
            </View>
          </Pressable>
        </View>
      </SurfaceCard>
    </Drawer>
  );
};
