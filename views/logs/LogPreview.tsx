import {FC} from 'react';
import {
  ActivityIndicator,
  ListRenderItemInfo,
  Platform,
  Pressable,
  View,
} from 'react-native';
import {FlatList} from 'react-native-gesture-handler';
import {Text} from 'react-native-ui-lib';
import {useIntl} from 'react-intl';
import {useStyles} from '../../helpers/colors';
import {messages} from './messages';

export interface Log {
  name: string;
  data: string[];
}

interface ILogPreviewProps {
  log: Log;
  loading?: boolean;
  end?: boolean;
  error?: string;
  onLoadOlder?: () => void;
}

export const LogPreview: FC<ILogPreviewProps> = ({
  log,
  loading = false,
  end = false,
  error,
  onLoadOlder,
}) => {
  const intl = useIntl();
  const styles = useStyles(({theme}) => ({
    wrapper: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      paddingHorizontal: 16,
    },
    line: {
      color: theme.text,
      marginVertical: 6,
    },
    controls: {
      alignItems: 'center',
      backgroundColor: theme.background,
      padding: 12,
    },
    action: {
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    actionText: {
      color: theme.link,
    },
    status: {
      color: theme.text,
      paddingVertical: 8,
      textAlign: 'center',
    },
  }));

  return (
    <View style={styles.wrapper}>
      <FlatList
        testID={`logs-list-${log.name}`}
        contentContainerStyle={styles.content}
        data={log.data}
        renderItem={({item}: ListRenderItemInfo<string>) => (
          <Text style={styles.line}>{item}</Text>
        )}
        keyExtractor={(_item: string, index: number) => `${log.name}:${index}`}
        inverted={true}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={5}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={Platform.OS === 'android'}
      />
      <View style={styles.controls}>
        {loading ? (
          <>
            <ActivityIndicator
              accessibilityLabel={intl.formatMessage(messages.loadingOlder)}
            />
            <Text style={styles.status}>
              {intl.formatMessage(messages.loadingOlder)}
            </Text>
          </>
        ) : error ? (
          <>
            <Text accessibilityRole="alert" style={styles.status}>
              {error}
            </Text>
            {!end && onLoadOlder ? (
              <Pressable
                accessibilityRole="button"
                testID={`logs-load-older-${log.name}`}
                onPress={onLoadOlder}
                style={styles.action}>
                <Text style={styles.actionText}>
                  {intl.formatMessage(messages.loadOlder)}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : end ? (
          <Text style={styles.status}>
            {intl.formatMessage(messages.endOfLogs)}
          </Text>
        ) : onLoadOlder ? (
          <Pressable
            accessibilityRole="button"
            testID={`logs-load-older-${log.name}`}
            onPress={onLoadOlder}
            style={styles.action}>
            <Text style={styles.actionText}>
              {intl.formatMessage(messages.loadOlder)}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};
