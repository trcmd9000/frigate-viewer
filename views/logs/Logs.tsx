import React, {
  ComponentType,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {Text, View} from 'react-native';
import {useIntl} from 'react-intl';
import {Navigation, NavigationFunctionComponent} from 'react-native-navigation';
import {LoaderScreen} from 'react-native-ui-lib';
import {messages} from './messages';
import {menuButton, useMenu} from '../menu/menuHelpers';
import {selectServer} from '../../store/settings';
import {useAppSelector} from '../../store/store';
import {Log, LogPreview} from './LogPreview';
import {refreshButton} from '../../helpers/buttonts';
import {useTheme, useStyles} from '../../helpers/colors';
import {useRest} from '../../helpers/rest';
import {RetryState} from '../../components/RetryState';
import {handleError, getUserFriendlyMessage} from '../../helpers/errorHandler';

const LOG_TYPES = ['frigate', 'go2rtc', 'nginx'] as const;
const PAGE_SIZE = 500;
type LogType = (typeof LOG_TYPES)[number];

interface LogState extends Log {
  loading: boolean;
  end: boolean;
  error?: string;
  nextStart: number;
  loaded: boolean;
}

const initialLogs = (): LogState[] =>
  LOG_TYPES.map(name => ({
    name,
    data: [],
    loading: true,
    end: false,
    nextStart: -1000,
    loaded: false,
  }));

const parseLines = (value: string) => {
  const lines = value.split('\n');
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  return lines.reverse();
};

interface TabControllerItemProps {
  label: string;
  labelColor: string;
  selectedLabelColor: string;
  backgroundColor: string;
  activeBackgroundColor: string;
}

type TabControllerComponent = ComponentType<{
  items: TabControllerItemProps[];
  children?: ReactNode;
}> & {
  TabBar: ComponentType<{enableShadow?: boolean}>;
  TabPage: ComponentType<{index: number; children?: ReactNode}>;
};

const TabController = require('react-native-ui-lib')
  .TabController as TabControllerComponent;
const {TabBar, TabPage} = TabController;

export const Logs: NavigationFunctionComponent = ({componentId}) => {
  const styles = useStyles(({theme}) => ({
    noLogs: {
      padding: 20,
      color: theme.text,
      textAlign: 'center',
    },
    pages: {
      flex: 1,
    },
  }));
  const theme = useTheme();

  useMenu(componentId, 'logs');
  const [logs, setLogs] = useState<LogState[]>(initialLogs);
  const [initialLoading, setInitialLoading] = useState(true);
  const server = useAppSelector(selectServer);
  const intl = useIntl();
  const {get} = useRest();
  const getRef = useRef(get);
  const mounted = useRef(true);
  const requestVersions = useRef<Record<LogType, number>>({
    frigate: 0,
    go2rtc: 0,
    nginx: 0,
  });
  const inFlight = useRef<Set<LogType>>(new Set());

  useEffect(() => {
    getRef.current = get;
  }, [get]);

  useEffect(() => {
    const versions = requestVersions.current;
    const activeRequests = inFlight.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      LOG_TYPES.forEach(type => {
        versions[type] += 1;
      });
      activeRequests.clear();
    };
  }, []);

  const refresh = useCallback(() => {
    const versions = {} as Record<LogType, number>;
    LOG_TYPES.forEach(type => {
      versions[type] = ++requestVersions.current[type];
      inFlight.current.add(type);
    });
    setInitialLoading(true);
    setLogs(current =>
      current.map(log => ({
        ...log,
        loading: true,
        error: undefined,
        end: false,
        nextStart: -1000,
      })),
    );

    Promise.all(
      LOG_TYPES.map(async type => {
        try {
          const value = await getRef.current<string>(server, `logs/${type}`, {
            json: false,
            queryParams: {start: '-500'},
          });
          if (
            !mounted.current ||
            versions[type] !== requestVersions.current[type]
          ) {
            return;
          }
          const data = parseLines(value);
          setLogs(current =>
            current.map(log =>
              log.name === type
                ? {
                    ...log,
                    data,
                    loading: false,
                    loaded: true,
                    error: undefined,
                    end: data.length < PAGE_SIZE,
                    nextStart: -1000,
                  }
                : log,
            ),
          );
        } catch (reason) {
          const appError = await handleError(reason, `Logs.refresh.${type}`);
          if (
            !mounted.current ||
            versions[type] !== requestVersions.current[type]
          ) {
            return;
          }
          setLogs(current =>
            current.map(log =>
              log.name === type
                ? {
                    ...log,
                    loading: false,
                    loaded: true,
                    error: getUserFriendlyMessage(appError),
                  }
                : log,
            ),
          );
        } finally {
          if (versions[type] === requestVersions.current[type]) {
            inFlight.current.delete(type);
          }
        }
      }),
    ).then(() => {
      if (
        mounted.current &&
        LOG_TYPES.every(
          type => versions[type] === requestVersions.current[type],
        )
      ) {
        setInitialLoading(false);
      }
    });
  }, [server]);

  const loadOlder = useCallback(
    (type: LogType) => {
      const log = logs.find(item => item.name === type);
      if (!log || log.loading || log.end || inFlight.current.has(type)) {
        return;
      }
      const start = log.nextStart;
      const end = start + PAGE_SIZE;
      const version = ++requestVersions.current[type];
      inFlight.current.add(type);
      setLogs(current =>
        current.map(item =>
          item.name === type
            ? {...item, loading: true, error: undefined}
            : item,
        ),
      );

      getRef
        .current<string>(server, `logs/${type}`, {
          json: false,
          queryParams: {start: `${start}`, end: `${end}`},
        })
        .then(value => {
          if (
            !mounted.current ||
            version !== requestVersions.current[type]
          ) {
            return;
          }
          const older = parseLines(value);
          setLogs(current =>
            current.map(item =>
              item.name === type
                ? {
                    ...item,
                    data: [...item.data, ...older],
                    loading: false,
                    end: older.length < PAGE_SIZE,
                    nextStart: start - PAGE_SIZE,
                  }
                : item,
            ),
          );
        })
        .catch(async reason => {
          const appError = await handleError(reason, `Logs.loadOlder.${type}`);
          if (
            !mounted.current ||
            version !== requestVersions.current[type]
          ) {
            return;
          }
          setLogs(current =>
            current.map(item =>
              item.name === type
                ? {
                    ...item,
                    loading: false,
                    error:
                      getUserFriendlyMessage(appError) ||
                      intl.formatMessage(messages.loadOlderError),
                  }
                : item,
            ),
          );
        })
        .finally(() => {
          if (version === requestVersions.current[type]) {
            inFlight.current.delete(type);
          }
        });
    },
    [intl, logs, server],
  );

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

  const tabBarItems: TabControllerItemProps[] = useMemo(
    () =>
      logs.map(log => ({
        label: log.name,
        labelColor: theme.link,
        selectedLabelColor: theme.text,
        backgroundColor: theme.background,
        activeBackgroundColor: theme.background,
      })),
    [logs, theme],
  );

  const successfulLogs = logs.filter(log => log.data.length > 0);
  const allFailed =
    !initialLoading &&
    successfulLogs.length === 0 &&
    logs.every(log => log.loaded && Boolean(log.error));

  return initialLoading && successfulLogs.length === 0 ? (
    <LoaderScreen
      backgroundColor={theme.background}
      loaderColor={theme.text}
      overlay
    />
  ) : allFailed ? (
    <RetryState
      message={
        logs.find(log => log.error)?.error ||
        intl.formatMessage(messages.error)
      }
      retryLabel={intl.formatMessage(messages.retry)}
      testID="logs-retry"
      onRetry={refresh}
    />
  ) : logs.length > 1 ? (
    <TabController items={tabBarItems}>
      <TabBar enableShadow />
      <View style={styles.pages}>
        {logs.map((log, index) => (
          <TabPage index={index} key={log.name}>
            <LogPreview
              log={log}
              loading={log.loading}
              end={log.end}
              error={log.error}
              onLoadOlder={
                log.data.length > 0
                  ? () => loadOlder(log.name as LogType)
                  : undefined
              }
            />
          </TabPage>
        ))}
      </View>
    </TabController>
  ) : logs.length > 0 ? (
    <LogPreview
      log={logs[0]}
      loading={logs[0].loading}
      end={logs[0].end}
      error={logs[0].error}
      onLoadOlder={
        logs[0].data.length > 0
          ? () => loadOlder(logs[0].name as LogType)
          : undefined
      }
    />
  ) : (
    <Text style={styles.noLogs}>{intl.formatMessage(messages.noLogs)}</Text>
  );
};
