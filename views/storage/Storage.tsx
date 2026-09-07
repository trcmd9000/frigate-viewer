import {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Navigation, NavigationFunctionComponent} from 'react-native-navigation';
import {Carousel, LoaderScreen, PageControlPosition} from 'react-native-ui-lib';
import {ScrollView} from 'react-native-gesture-handler';
import {Background} from '../../components/Background';
import {refreshButton} from '../../helpers/buttonts';
import {
  CamerasStorage,
  Stats,
  StorageInfo,
  StorageShortPlace,
} from '../../helpers/interfaces';
import {useRest} from '../../helpers/rest';
import {selectServer} from '../../store/settings';
import {useAppSelector} from '../../store/store';
import {menuButton, useMenu} from '../menu/menuHelpers';
import {RetryState} from '../../components/RetryState';
import {messages} from './messages';
import {CamerasStorageChart} from './CamerasStorageChart';
import {CamerasStorageTable} from './CamerasStorageTable';
import {StorageChart} from './StorageChart';
import {StorageTable} from './StorageTable';
import {useStyles, useTheme} from '../../helpers/colors';

export const Storage: NavigationFunctionComponent = ({componentId}) => {
  const theme = useTheme();
  const styles = useStyles(() => ({
    wrapper: {
      margin: 20,
    },
  }));
  useMenu(componentId, 'storage');
  const [storage, setStorage] =
    useState<Record<StorageShortPlace, StorageInfo>>();
  const [camerasStorage, setCamerasStorage] = useState<CamerasStorage>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(0);
  const server = useAppSelector(selectServer);
  const intl = useIntl();
  const {get} = useRest();
  const getRef = useRef(get);
  const mounted = useRef(true);
  const requestId = useRef(0);

  useEffect(() => {
    getRef.current = get;
  }, [get]);

  useEffect(() => () => {
    mounted.current = false;
    requestId.current += 1;
  }, []);

  const refresh = useCallback(() => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(false);
    Promise.allSettled([
      getRef.current<Stats>(server, 'stats'),
      getRef.current<CamerasStorage>(server, 'recordings/storage'),
    ]).then(([stats, cameras]) => {
      if (!mounted.current || currentRequest !== requestId.current) {
        return;
      }
      if (stats.status === 'fulfilled') {
        const {service} = stats.value;
        setStorage({
          clips: service.storage['/media/frigate/clips'],
          recordings: service.storage['/media/frigate/recordings'],
          cache: service.storage['/tmp/cache'],
          shm: service.storage['/dev/shm'],
        });
      }
      if (cameras.status === 'fulfilled') {
        setCamerasStorage(cameras.value);
      }
      if (stats.status === 'rejected' && cameras.status === 'rejected') {
        setError(true);
      }
      setLoading(false);
    });
  }, [server]);

  useEffect(() => {
    Navigation.mergeOptions(componentId, {
      topBar: {
        title: {
          text: intl.formatMessage(messages['topBar.title']),
        },
        leftButtons: [menuButton],
        rightButtons: [refreshButton(refresh)],
      },
    });
  }, [componentId, intl, refresh]);

  useEffect(() => {
    const timeoutId = setTimeout(refresh, 0);
    return () => {
      clearTimeout(timeoutId);
    };
  }, [refresh]);

  if (storage === undefined && error) {
    return (
      <RetryState
        message={intl.formatMessage(messages.error)}
        retryLabel={intl.formatMessage(messages.retry)}
        testID="storage-retry"
        onRetry={refresh}
      />
    );
  }

  return loading || storage === undefined ? (
    <LoaderScreen
      backgroundColor={theme.background}
      loaderColor={theme.link}
    />
  ) : (
    <Background>
      <ScrollView style={styles.wrapper}>
        <Carousel
          pageControlPosition={PageControlPosition.UNDER}
          onChangePage={setPage}
        >
          <StorageChart storage={storage} />
          {camerasStorage !== undefined && (
            <CamerasStorageChart camerasStorage={camerasStorage} />
          )}
        </Carousel>
        {page === 0 && <StorageTable storage={storage} />}
        {camerasStorage && page === 1 && (
          <CamerasStorageTable camerasStorage={camerasStorage} />
        )}
      </ScrollView>
    </Background>
  );
};
