import React, {
  ComponentType,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
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
  }));
  const theme = useTheme();

  useMenu(componentId, 'logs');
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const server = useAppSelector(selectServer);
  const intl = useIntl();
  const {get} = useRest();

  const refresh = useCallback(() => {
    setLoading(true);
    const logsTypes = ['frigate', 'go2rtc', 'nginx'];
    Promise.allSettled(
      logsTypes.map(logType =>
        get<string>(server, `logs/${logType}`, {json: false}),
      ),
    ).then(logsData => {
      const updatedLogs: Log[] = logsTypes
        .map((logType, index) => ({logType, result: logsData[index]}))
        .filter(log => log.result.status === 'fulfilled')
        .map(log => ({
          name: log.logType,
          data: (log.result as PromiseFulfilledResult<string>).value
            .split('\n')
            .reverse(),
        }));
      setLogs(updatedLogs);
      setLoading(false);
    });
  }, [get, server]);

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

  return loading ? (
    <LoaderScreen
      backgroundColor={theme.background}
      loaderColor={theme.text}
      overlay
    />
  ) : logs.length > 1 ? (
    <TabController items={tabBarItems}>
      <TabBar enableShadow />
      <View style={{flex: 1}}>
        {logs.map((log, index) => (
          <TabPage index={index} key={log.name}>
            <LogPreview log={log} />
          </TabPage>
        ))}
      </View>
    </TabController>
  ) : logs.length > 0 ? (
    <LogPreview log={logs[0]} />
  ) : (
    <Text style={styles.noLogs}>{intl.formatMessage(messages.noLogs)}</Text>
  );
};
