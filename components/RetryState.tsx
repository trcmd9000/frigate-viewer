import React, {FC} from 'react';
import {Pressable, Text, View} from 'react-native';
import {useStyles} from '../helpers/colors';

interface RetryStateProps {
  message: string;
  retryLabel: string;
  onRetry: () => void;
  testID?: string;
}

export const RetryState: FC<RetryStateProps> = ({
  message,
  retryLabel,
  onRetry,
  testID,
}) => {
  const styles = useStyles(({theme}) => ({
    container: {
      flex: 1,
      minHeight: 120,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    message: {
      color: theme.text,
      textAlign: 'center',
      marginBottom: 12,
    },
    retry: {
      minWidth: 48,
      minHeight: 48,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    retryText: {
      color: theme.link,
      textAlign: 'center',
    },
  }));

  return (
    <View style={styles.container}>
      <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.message}>
        {message}
      </Text>
      <Pressable
        testID={testID}
        style={styles.retry}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={retryLabel}
      >
        <Text style={styles.retryText}>{retryLabel}</Text>
      </Pressable>
    </View>
  );
};
