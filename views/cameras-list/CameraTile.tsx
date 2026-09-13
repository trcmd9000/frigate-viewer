import React, {
  FC,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type {PropsWithChildren} from 'react';
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {useIntl} from 'react-intl';
import {IconOutline} from '@ant-design/icons-react-native';
import {Navigation} from 'react-native-navigation';
import {useAppSelector} from '../../store/store';
import {
  selectCamerasRefreshFrequency,
  selectCamerasNumColumns,
  selectEventsLockLandscapePlaybackOrientation,
  selectServer,
} from '../../store/settings';
import {buildServerApiUrl} from '../../helpers/rest';
import {serverProfileIdentity} from '../../helpers/serverIdentity';
import {SecureLogger} from '../../helpers/secureLogger';
import {useServerScopeOwner} from '../../helpers/serverScopeScreen';
import {
  downloadMedia,
  fileUri,
  releaseDownloadedMedia,
  removeDownloadedMedia,
  retainDownloadedMedia,
} from '../../helpers/mediaDownload';
import {useDesignTokens} from '../../helpers/designTokens';
import {Card} from '../../components/primitives';
import {ImagePreview} from './ImagePreview';
import {messages} from './messages';
import {
  gridCellGutters,
  gridCellWidth,
} from '../../helpers/gridLayout';

type CameraTileProps = PropsWithChildren<{
  /** Retained for callers while card navigation is modal-only. */
  componentId?: string;
  cameraName: string;
  active?: boolean;
  index?: number;
  layoutColumns?: number;
}>;

interface SnapshotState {
  status: 'loading' | 'decoded' | 'error';
  imageUrl?: string;
  decodedAt?: number;
}

const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value));

const styles = StyleSheet.create({
  tile: {
    marginVertical: 8,
    minWidth: 0,
  },
  compactCard: {
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  media: {
    position: 'relative',
    overflow: 'hidden',
  },
  state: {
    position: 'absolute',
    top: 12,
    left: 12,
    minHeight: 32,
    maxWidth: '80%',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#000000b8',
    flexDirection: 'row',
    alignItems: 'center',
  },
  stateText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  stateIcon: {
    marginRight: 6,
  },
  nameScrim: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#000000b8',
  },
  name: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  metadata: {
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  supporting: {
    fontSize: 14,
    lineHeight: 20,
  },
});

export const CameraTile: FC<CameraTileProps> = ({
  cameraName,
  active = true,
  index = 0,
  layoutColumns,
}) => {
  const [snapshot, setSnapshot] = useState<SnapshotState>({
    status: 'loading',
  });
  const server = useAppSelector(selectServer);
  const refreshFrequency = useAppSelector(selectCamerasRefreshFrequency);
  const preferredColumns = useAppSelector(selectCamerasNumColumns) ?? 1;
  const numColumns = layoutColumns ?? preferredColumns;
  const lockLandscapePlaybackOrientation = useAppSelector(
    selectEventsLockLandscapePlaybackOrientation,
  );
  const tokens = useDesignTokens();
  const {width: listWidth} = useWindowDimensions();
  const intl = useIntl();
  const interval = useRef<NodeJS.Timeout>();
  const currentPath = useRef<string>();
  const requestId = useRef(0);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const navigationInFlight = useRef(false);
  const {generation, isCurrentScope} = useServerScopeOwner();
  const imageRequestId = useRef(0);
  const profileIdentity = serverProfileIdentity(server);
  const gutters = gridCellGutters(index, numColumns, 16);
  const cellWidth = gridCellWidth(listWidth, numColumns, 16);

  const getLastImageUrl = useCallback(
    () => {
      const apiUrl = buildServerApiUrl(server);
      if (!apiUrl) {
        throw new Error('The configured server endpoint is unavailable');
      }
      return `${apiUrl}/${cameraName}/latest.jpg?bbox=1&ts=${new Date().toISOString()}`;
    },
    [cameraName, server],
  );

  const updateLastImageUrl = useCallback(async () => {
    if (!mounted.current || inFlight.current) {
      return;
    }
    inFlight.current = true;
    const currentRequest = ++requestId.current;
    setSnapshot(previous => ({
      status: 'loading',
      imageUrl: previous.imageUrl,
      decodedAt: previous.decodedAt,
    }));
    try {
      const nextPath = await downloadMedia(server, getLastImageUrl());
      if (!mounted.current || currentRequest !== requestId.current) {
        await removeDownloadedMedia(nextPath);
        return;
      }
      const previousPath = currentPath.current;
      retainDownloadedMedia(nextPath);
      currentPath.current = nextPath;
      imageRequestId.current = currentRequest;
      setSnapshot({
        status: 'loading',
        imageUrl: fileUri(nextPath),
      });
      await releaseDownloadedMedia(previousPath);
    } catch (error) {
      if (mounted.current && currentRequest === requestId.current) {
        const previousPath = currentPath.current;
        currentPath.current = undefined;
        setSnapshot({status: 'error'});
        await releaseDownloadedMedia(previousPath);
      }
      SecureLogger.logError(toError(error), 'loading-camera-preview');
    } finally {
      if (currentRequest === requestId.current) {
        inFlight.current = false;
      }
    }
  }, [getLastImageUrl, server]);

  useLayoutEffect(() => {
    requestId.current += 1;
    imageRequestId.current = 0;
    inFlight.current = false;
    const previousPath = currentPath.current;
    currentPath.current = undefined;
    setSnapshot({status: 'loading'});
    void Promise.resolve(releaseDownloadedMedia(previousPath)).catch(error => {
      SecureLogger.logError(toError(error), 'releasing-camera-preview');
    });
  }, [profileIdentity]);

  useEffect(() => {
    const stopRefreshing = () => {
      if (interval.current) {
        clearInterval(interval.current);
        interval.current = undefined;
      }
      requestId.current += 1;
      inFlight.current = false;
    };
    stopRefreshing();
    if (!active) {
      return undefined;
    }
    void updateLastImageUrl();
    interval.current = setInterval(() => {
      void updateLastImageUrl();
    }, refreshFrequency * 1000);
    return stopRefreshing;
  }, [active, refreshFrequency, updateLastImageUrl]);

  useEffect(
    () => () => {
      mounted.current = false;
      requestId.current += 1;
      inFlight.current = false;
      if (interval.current) {
        clearInterval(interval.current);
      }
      const path = currentPath.current;
      currentPath.current = undefined;
      void Promise.resolve(releaseDownloadedMedia(path)).catch(error => {
        SecureLogger.logError(toError(error), 'releasing-camera-preview');
      });
    },
    [],
  );

  const showCameraPreview = useCallback(() => {
    if (!isCurrentScope() || navigationInFlight.current) {
      return;
    }
    navigationInFlight.current = true;
    void Promise.resolve().then(() => {
      if (!isCurrentScope()) {
        return;
      }
      return Navigation.showModal({
        component: {
          name: 'CameraPreview',
          passProps: {cameraName, ownerScopeGeneration: generation},
          options: {
            layout: {
              orientation: [
                lockLandscapePlaybackOrientation ? 'sensorLandscape' : 'sensor',
              ],
              backgroundColor: '#000000',
            },
            topBar: {visible: false},
            statusBar: {visible: false},
            navigationBar: {visible: false, backgroundColor: '#000000'},
          },
        },
      });
    })
      .catch(error => {
        SecureLogger.logError(toError(error), 'navigation.camera-preview');
      })
      .finally(() => {
        navigationInFlight.current = false;
      });
  }, [cameraName, generation, isCurrentScope, lockLandscapePlaybackOrientation]);

  const onPress = showCameraPreview;
  const onPreviewLoad = useCallback((imageUrl: string) => {
    if (
      !mounted.current ||
      !currentPath.current ||
      imageRequestId.current !== requestId.current ||
      fileUri(currentPath.current) !== imageUrl
    ) {
      return;
    }
    setSnapshot(previous => ({
      ...previous,
      status: 'decoded',
      decodedAt: Date.now(),
    }));
  }, []);
  const onPreviewError = useCallback((imageUrl: string) => {
    if (
      !mounted.current ||
      !currentPath.current ||
      imageRequestId.current !== requestId.current ||
      fileUri(currentPath.current) !== imageUrl
    ) {
      return;
    }
    const previousPath = currentPath.current;
    currentPath.current = undefined;
    setSnapshot({status: 'error'});
    void Promise.resolve(releaseDownloadedMedia(previousPath)).catch(error => {
      SecureLogger.logError(toError(error), 'releasing-camera-preview');
    });
  }, []);
  const lastUpdate = snapshot.decodedAt
    ? new Date(snapshot.decodedAt).toLocaleString()
    : undefined;
  const snapshotLabel = intl.formatMessage(messages.snapshot);
  const openLabel = intl.formatMessage(messages.open);
  const loadingLabel = intl.formatMessage(messages.loadingSnapshot);
  const unavailableLabel = intl.formatMessage(messages.snapshotUnavailable);
  const stateLabel =
    snapshot.status === 'error'
      ? unavailableLabel
      : snapshot.status === 'loading'
        ? loadingLabel
        : snapshotLabel;
  const cardAccessibilityLabel = intl.formatMessage(
    messages.cardAccessibility,
    {
      camera: cameraName,
      state: stateLabel,
      action: openLabel,
    },
  );
  const snapshotAccessibilityLabel = intl.formatMessage(
    messages.snapshotAccessibility,
    {camera: cameraName},
  );
  const stateAccessibilityLabel = intl.formatMessage(
    messages.stateAccessibility,
    {camera: cameraName, state: stateLabel},
  );

  return (
    <Card
      testID={`camera-card-${cameraName}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={cardAccessibilityLabel}
      style={[
        styles.tile,
        styles.compactCard,
        {
          width: cellWidth,
          marginLeft: gutters.left,
          marginRight: gutters.right,
        },
      ]}
    >
      <View
        style={[
          styles.media,
          {borderRadius: tokens.geometry?.mediaRadius ?? 4},
        ]}
      >
        <ImagePreview
          imageUrl={snapshot.imageUrl}
          state={snapshot.status}
          onPreviewLoad={onPreviewLoad}
          onPreviewError={onPreviewError}
          accessibilityLabel={snapshotAccessibilityLabel}
          loadingLabel={loadingLabel}
          unavailableLabel={unavailableLabel}
        />
        {snapshot.status === 'error' && (
          <View
            pointerEvents="none"
            accessible
            accessibilityRole="text"
            accessibilityLabel={stateAccessibilityLabel}
            style={styles.state}
          >
            <IconOutline
              name="warning"
              size={14}
              color="#ffffff"
              accessible={false}
              style={styles.stateIcon}
            />
            <Text style={styles.stateText}>{unavailableLabel}</Text>
          </View>
        )}
        <View
          testID={`camera-card-name-${cameraName}`}
          pointerEvents="none"
          style={[
            styles.nameScrim,
            {
              paddingHorizontal: tokens.spacing.md,
              paddingVertical: tokens.spacing.sm,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[styles.name, tokens.typography.mediaOverlay]}
          >
            {cameraName}
          </Text>
        </View>
      </View>
      <View style={styles.metadata}>
        <Text
          style={[
            styles.supporting,
            {color: tokens.colors.textSecondary},
          ]}
          numberOfLines={2}
        >
          {lastUpdate
            ? intl.formatMessage(messages.lastUpdate, {time: lastUpdate})
            : snapshot.status === 'error'
              ? unavailableLabel
              : snapshot.imageUrl
                ? loadingLabel
                : intl.formatMessage(messages.waiting)}
        </Text>
      </View>
    </Card>
  );
};
