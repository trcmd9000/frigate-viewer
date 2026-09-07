import React, {FC, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Dimensions, FlatList, ToastAndroid, Text, View} from 'react-native';
import {Navigation, NavigationFunctionComponent} from 'react-native-navigation';
import {useRest} from '../../helpers/rest';
import {
  selectFiltersCameras,
  selectFiltersLabels,
  selectFiltersRetained,
  selectFiltersZones,
} from '../../store/events';
import {
  selectEventsLockLandscapePlaybackOrientation,
  selectEventsNumColumns,
  selectEventsSnapshotHeight,
  selectServer,
  setEventSnapshotHeight,
} from '../../store/settings';
import {useAppDispatch, useAppSelector} from '../../store/store';
import {
  filterButton,
  useEventsFilters,
} from '../events-filters/eventsFiltersHelpers';
import {menuButton, useMenu} from '../menu/menuHelpers';
import {CameraEvent, ICameraEvent} from './CameraEvent';
import {messages} from './messages';
import {useNoServer} from '../settings/useNoServer';
import {Background} from '../../components/Background';
import {useOrientation} from '../../helpers/screen';
import {Share} from './Share';
import {Refresh} from '../../components/Refresh';
import {RetryState} from '../../components/RetryState';
import {SecureLogger} from '../../helpers/secureLogger';
import {ActiveFilters} from '../events-filters/ActiveFilters';
import {useDesignTokens} from '../../helpers/designTokens';

const EventListSkeleton: FC<{label: string}> = ({label}) => {
  const tokens = useDesignTokens();
  return (
    <View
      testID="camera-events-skeleton"
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{busy: true}}
      style={{padding: tokens.spacing.lg}}
    >
      {[0, 1, 2].map(item => (
        <View
          key={item}
          style={{
            marginBottom: tokens.spacing.lg,
            borderRadius: tokens.geometry.cardRadius,
            backgroundColor: tokens.colors.surfaceElevated,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: '100%',
              aspectRatio: tokens.geometry.mediaAspectRatio,
              backgroundColor: tokens.colors.mediaBackground,
              opacity: 0.35,
            }}
          />
          <View style={{padding: tokens.spacing.lg}}>
            <View
              style={{
                width: '52%',
                height: tokens.spacing.md,
                backgroundColor: tokens.colors.outline,
                marginBottom: tokens.spacing.sm,
              }}
            />
            <View
              style={{width: '76%', height: tokens.spacing.sm, backgroundColor: tokens.colors.outline}}
            />
          </View>
        </View>
      ))}
      <Text style={{position: 'absolute', opacity: 0}}>{label}</Text>
    </View>
  );
};

export interface ICameraEventsProps {
  cameraNames?: string[];
  retained?: boolean;
}

export const CameraEvents: NavigationFunctionComponent<ICameraEventsProps> = ({
  cameraNames,
  retained,
  componentId,
}) => {
  const isSpecificCamera = useMemo(
    () => cameraNames && cameraNames.length === 1,
    [cameraNames],
  );
  useNoServer();
  useMenu(
    componentId,
    !retained
      ? isSpecificCamera
        ? 'camerasList'
        : 'cameraEvents'
      : 'retained',
  );
  useEventsFilters(componentId, cameraNames);

  const listRef = useRef<FlatList<ICameraEvent>>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [events, setEvents] = useState<ICameraEvent[]>([]);
  const [error, setError] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [endReached, setEndReached] = useState<boolean>(false);
  const [snapshotDimensions, setSnapshotDimensions] =
    useState<[number, number]>();
  const [sharedEvent, setSharedEvent] = useState<ICameraEvent>();
  const [mediaEnabled, setMediaEnabled] = useState(true);
  const clipNavigationInFlight = useRef(false);
  const loadMoreInFlight = useRef(false);
  const requestId = useRef(0);
  const mounted = useRef(true);
  const dispatch = useAppDispatch();
  const server = useAppSelector(selectServer);
  const numColumns = useAppSelector(selectEventsNumColumns);
  const snapshotHeight = useAppSelector(selectEventsSnapshotHeight);
  const filtersCameras = useAppSelector(selectFiltersCameras);
  const filtersLabels = useAppSelector(selectFiltersLabels);
  const filtersZones = useAppSelector(selectFiltersZones);
  const filtersRetained = useAppSelector(selectFiltersRetained);
  const lockLandscapePlaybackOrientation = useAppSelector(
    selectEventsLockLandscapePlaybackOrientation,
  );
  const intl = useIntl();
  const {orientation, setComponentId} = useOrientation();
  const {get} = useRest();
  const getRef = useRef(get);

  useEffect(() => {
    getRef.current = get;
  }, [get]);

  useEffect(
    () => () => {
      mounted.current = false;
      requestId.current += 1;
    },
    [],
  );

  useEffect(() => {
    const listener = Navigation.events().registerComponentListener(
      {
        componentDidAppear() {
          setMediaEnabled(true);
        },
        componentDidDisappear() {
          setMediaEnabled(false);
        },
      },
      componentId,
    );
    return () => {
      listener.remove();
    };
  }, [componentId]);

  const filterCount = useMemo(
    () =>
      (cameraNames ? 0 : filtersCameras.length || 0) +
      (filtersLabels.length || 0) +
      (filtersZones.length || 0) +
      (filtersRetained ? 1 : 0),
    [cameraNames, filtersCameras, filtersLabels, filtersZones, filtersRetained],
  );

  const filterHeader = (
    <ActiveFilters viewedCameraNames={cameraNames} />
  );

  useEffect(() => {
    Navigation.mergeOptions(componentId, {
      topBar: retained
        ? {
            title: {
              text: intl.formatMessage(messages['topBar.retained.title']),
            },
            leftButtons: [menuButton],
            rightButtons: [filterButton(filterCount)],
          }
        : isSpecificCamera
        ? {
            title: {
              text: intl.formatMessage(
                messages['topBar.specificCamera.title'],
                {cameraName: cameraNames![0]},
              ),
            },
            rightButtons: [filterButton(filterCount)],
          }
        : {
            title: {
              text: intl.formatMessage(messages['topBar.general.title']),
            },
            leftButtons: [menuButton],
            rightButtons: [filterButton(filterCount)],
          },
    });
  }, [componentId, intl, cameraNames, filterCount]);

  useEffect(() => {
    Navigation.updateProps('FilterButton', {
      count: filterCount,
    });
  }, [filterCount]);

  const eventsQueryParams = useMemo(
    () => ({
      ...(cameraNames
        ? {cameras: cameraNames.join(',')}
        : filtersCameras.length > 0
        ? {cameras: filtersCameras.join(',')}
        : {}),
      ...(filtersLabels.length > 0 ? {labels: filtersLabels.join(',')} : {}),
      ...(filtersZones.length > 0 ? {zones: filtersZones.join(',')} : {}),
      ...(!refreshing && events.length > 0
        ? {before: `${events[events.length - 1].start_time}`}
        : {}),
      favorites: retained || filtersRetained ? '1' : '0',
      limit: '100',
      include_thumbnails: '0',
    }),
    [
      cameraNames,
      events,
      filtersCameras,
      filtersLabels,
      filtersZones,
      filtersRetained,
      retained,
      refreshing,
    ],
  );
  const refreshQueryParams = useMemo(
    () => ({
      ...(cameraNames
        ? {cameras: cameraNames.join(',')}
        : filtersCameras.length > 0
        ? {cameras: filtersCameras.join(',')}
        : {}),
      ...(filtersLabels.length > 0 ? {labels: filtersLabels.join(',')} : {}),
      ...(filtersZones.length > 0 ? {zones: filtersZones.join(',')} : {}),
      favorites: retained || filtersRetained ? '1' : '0',
      limit: '100',
      include_thumbnails: '0',
    }),
    [
      cameraNames,
      filtersCameras,
      filtersLabels,
      filtersRetained,
      filtersZones,
      retained,
    ],
  );

  const watchEndReached = (data: ICameraEvent[]) => {
    if (data.length < 100) {
      setEndReached(true);
    }
  };

  const refresh = () => {
    setEndReached(false);
    setError(false);
    setRefreshing(true);
    setRefreshVersion(version => version + 1);
  };

  useEffect(() => {
    if (!server.host || !refreshing || refreshVersion === 0) {
      return;
    }
    const currentRequest = ++requestId.current;
    getRef.current<ICameraEvent[]>(server, 'events', {
      queryParams: refreshQueryParams,
    })
      .then(data => {
        if (!mounted.current || currentRequest !== requestId.current) {
          return;
        }
        watchEndReached(data);
        setEvents(data);
        setError(false);
        if (data.length > 0) {
          listRef.current?.scrollToOffset({offset: 0, animated: false});
        }
      })
      .catch(error => {
        SecureLogger.logError(error as Error, 'loading-camera-events');
        if (mounted.current && currentRequest === requestId.current) {
          setError(true);
        }
      })
      .finally(() => {
        if (mounted.current && currentRequest === requestId.current) {
          setRefreshing(false);
        }
      });
  }, [refreshQueryParams, refreshVersion, refreshing, server]);

  const loadMore = () => {
    if (!endReached && !loadMoreInFlight.current) {
      loadMoreInFlight.current = true;
      const currentRequest = ++requestId.current;
      get<ICameraEvent[]>(server, 'events', {
        queryParams: eventsQueryParams,
      })
        .then(data => {
          if (!mounted.current || currentRequest !== requestId.current) {
            return;
          }
          watchEndReached(data);
          setEvents(currentEvents => {
            const existingIds = new Set(currentEvents.map(event => event.id));
            return [
              ...currentEvents,
              ...data.filter(event => !existingIds.has(event.id)),
            ];
          });
          setError(false);
        })
        .catch(error => {
          SecureLogger.logError(error as Error, 'loading-more-events');
          if (mounted.current && currentRequest === requestId.current) {
            setError(true);
          }
        })
        .finally(() => {
          loadMoreInFlight.current = false;
        });
    }
  };

  useEffect(() => {
    refresh();
  }, [filtersCameras, filtersLabels, filtersZones, filtersRetained]);

  const onDelete = (deletedIds: string[]) => {
    setEvents(currentEvents =>
      currentEvents.filter(event => !deletedIds.includes(event.id)),
    );
  };

  const onSnapshotDimensions = (width: number, height: number) => {
    if (!snapshotDimensions) {
      setSnapshotDimensions([width, height]);
    }
  };

  useEffect(() => {
    if (snapshotDimensions) {
      const [width, height] = snapshotDimensions;
      const proportion = height / width;
      const windowWidth = Dimensions.get('window').width;
      const newHeight = (windowWidth * proportion) / numColumns;
      if (newHeight !== snapshotHeight) {
        dispatch(setEventSnapshotHeight(newHeight));
      }
    }
  }, [snapshotDimensions, numColumns, orientation]);

  const showEventClip = (event: ICameraEvent) => {
    if (event.has_clip) {
      if (clipNavigationInFlight.current) {
        return;
      }
      clipNavigationInFlight.current = true;
      setMediaEnabled(false);
      requestAnimationFrame(() => {
        void Navigation.showModal({
          component: {
            name: 'CameraEventClip',
            passProps: {
              event,
            },
            options: {
              layout: {
                orientation: [
                  lockLandscapePlaybackOrientation
                    ? 'sensorLandscape'
                    : 'sensor',
                ],
              },
            },
          },
        })
          .then(componentId => {
            if (mounted.current) {
              setComponentId(componentId);
            }
          })
          .catch(error => {
            setMediaEnabled(true);
            SecureLogger.logError(error as Error, 'navigation.camera-event-clip');
          })
          .finally(() => {
            clipNavigationInFlight.current = false;
          });
      });
    } else {
      ToastAndroid.showWithGravity(
        intl.formatMessage(messages['toast.noClip']),
        ToastAndroid.LONG,
        ToastAndroid.TOP,
      );
    }
  };

  return (
    <Background>
      <FlatList
        ref={listRef}
        testID="camera-events-list"
        data={events}
        renderItem={({item}) => (
          <CameraEvent
            {...item}
            componentId={componentId}
            mediaEnabled={mediaEnabled}
            onDelete={onDelete}
            onSnapshotDimensions={onSnapshotDimensions}
            onEventPress={showEventClip}
            onShare={setSharedEvent}
          />
        )}
        key={numColumns}
        keyExtractor={data => data.id}
        initialNumToRender={Math.max(numColumns * 3, 6)}
        maxToRenderPerBatch={numColumns * 10}
        windowSize={7}
        updateCellsBatchingPeriod={50}
        onEndReached={() => {
          if (!refreshing && !error && events.length > 0) {
            loadMore();
          }
        }}
        onEndReachedThreshold={0.5}
        numColumns={numColumns}
        ListEmptyComponent={
          refreshing ? (
            <EventListSkeleton label={intl.formatMessage(messages.loading)} />
          ) : (
            <RetryState
              message={
                error
                  ? intl.formatMessage(messages.error)
                  : server.host
                  ? filterCount > 0
                    ? intl.formatMessage(messages.noFilteredEvents)
                    : intl.formatMessage(messages.noEvents)
                  : intl.formatMessage(messages.noServer)
              }
              retryLabel={intl.formatMessage(messages.retry)}
              testID="camera-events-retry"
              onRetry={refresh}
            />
          )
        }
        ListHeaderComponent={filterHeader}
        stickyHeaderIndices={[0]}
        ListFooterComponent={
          error && events.length > 0 ? (
            <RetryState
              message={intl.formatMessage(messages.loadMoreError)}
              retryLabel={intl.formatMessage(messages.retry)}
              testID="camera-events-load-more-retry"
              onRetry={() => {
                setError(false);
                loadMore();
              }}
            />
          ) : null
        }
        refreshControl={<Refresh refreshing={refreshing} onRefresh={refresh} />}
      />
      <Share event={sharedEvent} onDismiss={() => setSharedEvent(undefined)} />
    </Background>
  );
};
