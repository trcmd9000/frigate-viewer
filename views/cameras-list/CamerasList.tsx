import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  AccessibilityActionEvent,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {useIntl} from 'react-intl';
import {useStore} from 'react-redux';
import {Navigation, NavigationFunctionComponent} from 'react-native-navigation';
import {useRest} from '../../helpers/rest';
import {handleError} from '../../helpers/errorHandler';
import {
  selectAvailableCameras,
  selectServerScopeGeneration,
  setAvailableForScope,
} from '../../store/events';
import {
  selectCamerasNumColumns,
  selectLocaleRegion,
  selectServer,
} from '../../store/settings';
import {useAppDispatch, useAppSelector} from '../../store/store';
import type {RootState} from '../../store/store';
import {useMenu, menuButton} from '../menu/menuHelpers';
import {CameraTile} from './CameraTile';
import {messages} from './messages';
import {useNoServer} from '../settings/useNoServer';
import {Background} from '../../components/Background';
import {Refresh} from '../../components/Refresh';
import {RetryState} from '../../components/RetryState';
import {InlineState} from '../../components/primitives';
import {useDesignTokens} from '../../helpers/designTokens';
import {updatePrimaryDestinationLabels} from '../../helpers/navigationShell';
import {presentSecondaryStack} from '../../helpers/secondaryNavigation';
import {
  gridCellGutters,
  gridCellWidth,
  responsiveGridColumns,
} from '../../helpers/gridLayout';
import {
  invalidateLiveConfigCache,
  prewarmLiveDiscovery,
  rememberLiveConfig,
} from '../../helpers/liveDiscovery';
import type {FrigateLiveConfig} from '../../helpers/protectedLive';
import {invalidateStreamMetadataCache} from '../../helpers/hevcTransport';

interface IConfigResponse extends FrigateLiveConfig {
  cameras: Record<
    string,
    {
      zones: Record<string, unknown>;
      live?: {streams?: Record<string, string>};
    }
  >;
  objects: {track: string[]};
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 16,
  },
  refresh: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  refreshText: {
    fontSize: 15,
    fontWeight: '600',
  },
  skeletonCard: {
    minWidth: 0,
  },
  skeletonMedia: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
});

const CameraListSkeleton = ({
  numColumns,
  loadingLabel,
}: {
  numColumns: number;
  loadingLabel: string;
}) => {
  const tokens = useDesignTokens();
  const {width: listWidth} = useWindowDimensions();
  return (
    <View
      testID="cameras-list-loading"
      style={{flexDirection: 'row', flexWrap: 'wrap'}}
    >
      {Array.from({length: Math.max(numColumns * 2, 4)}, (_, index) => (
        <View
          key={index}
          style={[
            styles.skeletonCard,
            {
              width: gridCellWidth(listWidth, numColumns, 16),
              marginLeft: gridCellGutters(index, numColumns, 16).left,
              marginRight: gridCellGutters(index, numColumns, 16).right,
              marginVertical: 8,
            },
          ]}
        >
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={loadingLabel}
            style={[
              styles.skeletonMedia,
              {
                backgroundColor: tokens.colors.mediaBackground,
                borderRadius: tokens.geometry?.mediaRadius ?? 4,
              },
            ]}
          />
          <View style={{paddingTop: 8, paddingHorizontal: 12}}>
            <View
              style={{
                width: '65%',
                height: 20,
                borderRadius: tokens.geometry?.mediaRadius ?? 4,
                backgroundColor: tokens.colors.surfaceElevated,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
};

export const CamerasList: NavigationFunctionComponent = props => {
  const generation = useAppSelector(selectServerScopeGeneration);
  return (
    <CamerasListContent key={generation} {...props} generation={generation} />
  );
};

const CamerasListContent: NavigationFunctionComponent<{generation: number}> = ({
  componentId,
  generation,
}) => {
  const store = useStore<RootState>();
  const dispatch = useAppDispatch();
  const intl = useIntl();
  const tokens = useDesignTokens();
  const server = useAppSelector(selectServer);
  const cameras = useAppSelector(selectAvailableCameras);
  const preferredColumns = useAppSelector(selectCamerasNumColumns) ?? 1;
  const {width: listWidth, fontScale} = useWindowDimensions();
  const numColumns = responsiveGridColumns(
    listWidth,
    preferredColumns,
    160,
    16,
    fontScale,
  );
  const localeRegion = useAppSelector(selectLocaleRegion);
  const {get} = useRest();
  const getRef = useRef(get);
  const mounted = useRef(true);
  const refreshRequestId = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [screenVisible, setScreenVisible] = useState(true);

  const isCurrentScope = useCallback(
    () =>
      mounted.current &&
      selectServerScopeGeneration(store.getState()) === generation,
    [generation, store],
  );
  const isCurrentRequest = useCallback(
    (id: number) => isCurrentScope() && id === refreshRequestId.current,
    [isCurrentScope],
  );

  useMenu(componentId, 'camerasList');
  useNoServer(componentId);

  useEffect(() => {
    getRef.current = get;
  }, [get]);

  const refresh = useCallback(() => {
    if (!isCurrentScope() || !server.host) {
      return;
    }
    const currentRequest = ++refreshRequestId.current;
    invalidateLiveConfigCache(server);
    invalidateStreamMetadataCache(server);
    setLoading(true);
    setError(false);
    getRef
      .current<IConfigResponse>(server, 'config')
      .then(config => {
        if (!isCurrentRequest(currentRequest)) {
          return;
        }
        const availableCameras = Object.keys(config.cameras);
        const availableLabels = config.objects.track;
        const availableZones = availableCameras.reduce(
          (zones, cameraName) => [
            ...zones,
            ...Object.keys(config.cameras[cameraName].zones).filter(
              zoneName => !zones.includes(zoneName),
            ),
          ],
          [] as string[],
        );
        dispatch(
          setAvailableForScope({
            generation,
            available: {
              cameras: availableCameras,
              labels: availableLabels,
              zones: availableZones,
            },
          }),
        );
        rememberLiveConfig(server, config);
        void prewarmLiveDiscovery(
          server,
          config,
          availableCameras,
          () => isCurrentRequest(currentRequest),
        ).catch(requestError => {
          if (isCurrentRequest(currentRequest)) {
            void handleError(requestError, 'CamerasList.prewarm');
          }
        });
      })
      .catch(async requestError => {
        if (!isCurrentRequest(currentRequest)) {
          return;
        }
        await handleError(requestError, 'CamerasList.refresh');
        if (isCurrentRequest(currentRequest)) {
          setError(true);
        }
      })
      .finally(() => {
        if (isCurrentRequest(currentRequest)) {
          setLoading(false);
        }
      });
  }, [dispatch, generation, isCurrentRequest, isCurrentScope, server]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      refreshRequestId.current += 1;
    };
  }, []);

  useEffect(() => {
    const listener = Navigation.events().registerComponentListener(
      {
        componentDidAppear() {
          if (isCurrentScope()) {
            setScreenVisible(true);
          }
        },
        componentDidDisappear() {
          if (isCurrentScope()) {
            setScreenVisible(false);
          }
        },
      },
      componentId,
    );
    return () => listener.remove();
  }, [componentId, isCurrentScope]);

  useEffect(() => {
    Navigation.mergeOptions(componentId, {
      topBar: {
        title: {text: intl.formatMessage(messages['topBar.title'])},
        leftButtons: [menuButton],
      },
    });
  }, [componentId, intl]);

  useEffect(() => {
    void updatePrimaryDestinationLabels({
      cameras: intl.formatMessage(messages['tab.cameras']),
      events: intl.formatMessage(messages['tab.events']),
    }).catch(navigationError => {
      if (isCurrentScope()) {
        handleError(navigationError, 'CamerasList.updateTabLabels');
      }
    });
  }, [intl, isCurrentScope, localeRegion]);

  useEffect(() => {
    if (!server.host) {
      setLoading(false);
      return undefined;
    }
    const timeoutId = setTimeout(refresh, 0);
    return () => clearTimeout(timeoutId);
  }, [refresh, server.host]);

  const openSettings = useCallback(() => {
    if (!isCurrentScope()) {
      return;
    }
    void presentSecondaryStack({componentName: 'Settings'}).catch(
      navigationError => {
        if (isCurrentScope()) {
          handleError(navigationError, 'CamerasList.openSettings');
        }
      },
    );
  }, [isCurrentScope]);
  const refreshLabel = intl.formatMessage(messages.refresh);
  const onAccessibilityAction = useCallback(
    ({nativeEvent}: AccessibilityActionEvent) => {
      if (nativeEvent.actionName === 'activate') {
        refresh();
      }
    },
    [refresh],
  );

  const emptyState = loading ? (
    <CameraListSkeleton
      numColumns={numColumns}
      loadingLabel={intl.formatMessage(messages.loadingSnapshot)}
    />
  ) : error ? (
    <InlineState
      testID="cameras-list-error"
      icon="warning"
      tone="error"
      title={intl.formatMessage(messages.error)}
      action={
        <Pressable
          testID="cameras-list-retry"
          onPress={refresh}
          accessibilityRole="button"
          accessibilityLabel={intl.formatMessage(messages.retry)}
          style={styles.refresh}
        >
          <Text style={[styles.refreshText, {color: tokens.colors.accent}]}>
            {intl.formatMessage(messages.retry)}
          </Text>
        </Pressable>
      }
    />
  ) : (
    <InlineState
      testID="cameras-list-empty"
      icon="video-camera"
      title={intl.formatMessage(messages.noCameras)}
      description={intl.formatMessage(messages.emptyDescription)}
      action={
        <Pressable
          testID="cameras-list-configure"
          onPress={openSettings}
          accessibilityRole="button"
          accessibilityLabel={intl.formatMessage(messages.configure)}
          style={styles.refresh}
        >
          <Text style={[styles.refreshText, {color: tokens.colors.accent}]}>
            {intl.formatMessage(messages.configure)}
          </Text>
        </Pressable>
      }
    />
  );

  return (
    <Background>
      <FlatList
        testID="cameras-list"
        data={cameras}
        renderItem={({item, index}) => (
          <CameraTile
            cameraName={item}
            componentId={componentId}
            active={screenVisible}
            index={index}
            layoutColumns={numColumns}
          />
        )}
        key={numColumns}
        keyExtractor={cameraName => cameraName}
        numColumns={numColumns}
        initialNumToRender={Math.max(numColumns * 2, 6)}
        maxToRenderPerBatch={numColumns * 4}
        windowSize={5}
        updateCellsBatchingPeriod={50}
        accessibilityActions={[{name: 'activate', label: refreshLabel}]}
        onAccessibilityAction={onAccessibilityAction}
        ListEmptyComponent={emptyState}
        ListFooterComponent={
          error && cameras.length > 0 ? (
            <RetryState
              message={intl.formatMessage(messages.error)}
              retryLabel={intl.formatMessage(messages.retry)}
              testID="cameras-list-retry"
              onRetry={refresh}
            />
          ) : null
        }
        contentContainerStyle={styles.list}
        refreshControl={<Refresh refreshing={loading} onRefresh={refresh} />}
      />
    </Background>
  );
};
