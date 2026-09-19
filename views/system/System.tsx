import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Navigation, NavigationFunctionComponent} from 'react-native-navigation';
import {
  Carousel,
  LoaderScreen,
  PageControlPosition,
  Text,
  View,
} from 'react-native-ui-lib';
import {ScrollView} from 'react-native-gesture-handler';
import {Background} from '../../components/Background';
import {useStyles, useTheme} from '../../helpers/colors';
import {Stats} from '../../helpers/interfaces';
import {useRest} from '../../helpers/rest';
import {selectAvailableCameras} from '../../store/events';
import {selectServer} from '../../store/settings';
import {useAppSelector} from '../../store/store';
import {refreshButton} from '../../helpers/buttonts';
import {menuButton, useMenu} from '../menu/menuHelpers';
import {CameraInfoChart} from './CameraInfoChart';
import {CameraInfo, CameraTable} from './CameraTable';
import {CpuUsageChart} from './CpuUsageChart';
import {DetectorRow, DetectorsTable} from './DetectorsTable';
import {GpuRow, GpusTable} from './GpusTable';
import {messages} from './messages';
import {SectionTitle} from './SectionTitle';
import {SystemInfo} from './SystemInfo';
import {RetryState} from '../../components/RetryState';
import {handleError} from '../../helpers/errorHandler';
import {
  createSecondaryStackDismissButton,
  handleSecondaryStackNavigationButton,
  SECONDARY_ROOT_COMPONENT_ID,
} from '../../helpers/secondaryNavigation';

const refreshFrequency = 30;

export const System: NavigationFunctionComponent = ({componentId}) => {
  const styles = useStyles(({theme}) => ({
    wrapper: {
      margin: 20,
    },
    cameraTableWrapper: {
      marginBottom: 10,
    },
    cameraTableTitle: {
      color: theme.text,
      fontWeight: '600',
      marginVertical: 6,
    },
    loader: {
      position: 'absolute',
      top: 10,
      width: '100%',
    },
  }));
  const theme = useTheme();

  useMenu(componentId, 'system');
  const [stats, setStats] = useState<Stats>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [screenVisible, setScreenVisible] = useState(true);
  const [page, setPage] = useState(0);
  const server = useAppSelector(selectServer);
  const cameras = useAppSelector(selectAvailableCameras);
  const intl = useIntl();
  const interval = useRef<ReturnType<typeof setInterval>>();
  const {get} = useRest();
  const getRef = useRef(get);
  const mounted = useRef(true);
  const requestInFlight = useRef(false);
  const isSecondaryRoot = componentId === SECONDARY_ROOT_COMPONENT_ID;

  useEffect(() => {
    getRef.current = get;
  }, [get]);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  useEffect(() => {
    const listener = Navigation.events().registerComponentListener(
      {
        componentDidAppear() {
          setScreenVisible(true);
        },
        componentDidDisappear() {
          setScreenVisible(false);
        },
      },
      componentId,
    );
    return () => listener.remove();
  }, [componentId]);

  const refresh = useCallback(() => {
    if (requestInFlight.current) {
      return Promise.resolve();
    }
    requestInFlight.current = true;
    setLoading(true);
    setError(false);
    return getRef.current<Stats>(server, 'stats')
      .then(nextStats => {
        if (mounted.current) {
          setStats(nextStats);
        }
      })
      .catch(async requestError => {
        await handleError(requestError, 'System.refresh');
        if (mounted.current) {
          setError(true);
        }
      })
      .finally(() => {
        requestInFlight.current = false;
        if (mounted.current) {
          setLoading(false);
        }
      });
  }, [server]);

  useEffect(() => {
    Navigation.mergeOptions(componentId, {
      topBar: {
        title: {
          text: intl.formatMessage(messages['topBar.title']),
        },
        leftButtons: [
          isSecondaryRoot
            ? createSecondaryStackDismissButton(
                intl.formatMessage(messages['topBar.back']),
                theme.text,
              )
            : menuButton,
        ],
        rightButtons: [refreshButton(refresh)],
      },
    });
  }, [componentId, intl, isSecondaryRoot, refresh, theme.text]);

  useEffect(() => {
    if (!isSecondaryRoot) {
      return undefined;
    }
    const subscription =
      Navigation.events().registerNavigationButtonPressedListener(event => {
        handleSecondaryStackNavigationButton(event).catch(() => undefined);
      });
    return () => subscription.remove();
  }, [isSecondaryRoot]);

  useEffect(() => {
    if (!screenVisible) {
      return undefined;
    }
    const removeRefreshing = () => {
      if (interval.current) {
        clearInterval(interval.current);
      }
    };

    const timeoutId = setTimeout(refresh, 0);
    removeRefreshing();
    interval.current = setInterval(async () => {
      await refresh();
    }, refreshFrequency * 1000);

    return () => {
      clearTimeout(timeoutId);
      removeRefreshing();
    };
  }, [refresh, screenVisible]);

  const detectors: DetectorRow[] = useMemo(
    () =>
      stats
        ? Object.keys(stats.detectors).map(name => {
            const detector = stats.detectors[name];
            const cpuUsage = stats.cpu_usages
              ? stats.cpu_usages[detector.pid]
              : undefined;
            return {
              name,
              inferenceSpeed: detector.inference_speed,
              cpu: cpuUsage ? parseFloat(cpuUsage.cpu) : undefined,
              mem: cpuUsage ? parseFloat(cpuUsage.mem) : undefined,
            };
          })
        : [],
    [stats],
  );

  const gpus: GpuRow[] = useMemo(() => {
    const gpuUsages = stats?.gpu_usages;
    if (!gpuUsages) {
      return [];
    }

    return Object.keys(gpuUsages).map(name => ({
      name,
      gpu: parseFloat(gpuUsages[name].gpu.slice(0, -2)),
      mem: parseFloat(gpuUsages[name].mem.slice(0, -2)),
    }));
  }, [stats]);

  const cameraTables: Record<string, CameraInfo> = useMemo(() => {
    return stats && cameras
      ? cameras.reduce((result, cameraName) => {
          const cameraInfo = stats.cameras[cameraName];
          const ffmpegUsage =
            stats.cpu_usages && cameraInfo?.ffmpeg_pid
              ? stats.cpu_usages[cameraInfo.ffmpeg_pid]
              : undefined;
          const captureUsage =
            stats.cpu_usages && cameraInfo
              ? stats.cpu_usages[cameraInfo.capture_pid]
              : undefined;
          const detectUsage =
            stats.cpu_usages && cameraInfo
              ? stats.cpu_usages[cameraInfo.pid]
              : undefined;
          return {
            ...result,
            [cameraName]: {
              ffmpeg: {
                fps: cameraInfo?.camera_fps,
                cpu: ffmpegUsage ? parseFloat(ffmpegUsage.cpu) : undefined,
                mem: ffmpegUsage ? parseFloat(ffmpegUsage.mem) : undefined,
              },
              capture: {
                fps: cameraInfo?.process_fps,
                cpu: captureUsage ? parseFloat(captureUsage.cpu) : undefined,
                mem: captureUsage ? parseFloat(captureUsage.mem) : undefined,
              },
              detect: {
                fps: cameraInfo?.detection_fps,
                fps_skipped: cameraInfo?.skipped_fps,
                cpu: detectUsage ? parseFloat(detectUsage.cpu) : undefined,
                mem: detectUsage ? parseFloat(detectUsage.mem) : undefined,
              },
            },
          };
        }, {} as Record<string, CameraInfo>)
      : {};
  }, [cameras, stats]);

  const isCarousel = useMemo(
    () =>
      detectors.some(detector => detector.cpu !== undefined) ||
      gpus.some(gpu => gpu.gpu !== undefined) ||
      Object.values(cameraTables).some(
        info =>
          info.ffmpeg.cpu !== undefined ||
          info.capture.cpu !== undefined ||
          info.detect.cpu !== undefined,
      ),
    [cameraTables, detectors, gpus],
  );

  const detectorsAndGpusFragment = (
    <View>
      {detectors.length > 0 && (
        <View>
          <SectionTitle>
            {intl.formatMessage(messages['detectors.title'])}
          </SectionTitle>
          <DetectorsTable detectors={detectors} />
        </View>
      )}
      {gpus.length > 0 && (
        <View>
          <SectionTitle>
            {intl.formatMessage(messages['gpus.title'])}
          </SectionTitle>
          <GpusTable gpus={gpus} />
        </View>
      )}
    </View>
  );

  const cameraTablesFragment = (
    <View>
      <SectionTitle>
        {intl.formatMessage(messages['cameras.title'])}
      </SectionTitle>
      {cameras.map(cameraName => (
        <View style={styles.cameraTableWrapper} key={cameraName}>
          <Text style={styles.cameraTableTitle}>{cameraName}</Text>
          <CameraTable cameraInfo={cameraTables[cameraName]} />
        </View>
      ))}
    </View>
  );

  return stats === undefined && error ? (
    <RetryState
      message={intl.formatMessage(messages.error)}
      retryLabel={intl.formatMessage(messages.retry)}
      testID="system-retry"
      onRetry={refresh}
    />
  ) : stats === undefined ? (
    <LoaderScreen
      backgroundColor={theme.background}
      loaderColor={theme.link}
    />
  ) : (
    <Background>
      {loading && (
        <LoaderScreen
          containerStyle={styles.loader}
          backgroundColor={theme.background}
          loaderColor={theme.link}
        />
      )}
      <ScrollView style={styles.wrapper}>
        {isCarousel ? (
          <>
            <Carousel
              pageControlPosition={PageControlPosition.UNDER}
              onChangePage={setPage}
            >
              <CpuUsageChart {...{detectors, gpus}} />
              <CameraInfoChart cameraInfos={cameraTables} />
            </Carousel>
            {page === 0 && detectorsAndGpusFragment}
            {page === 1 && cameras.length > 0 && cameraTablesFragment}
          </>
        ) : (
          <></>
        )}
        <SystemInfo service={stats.service} />
      </ScrollView>
    </Background>
  );
};
