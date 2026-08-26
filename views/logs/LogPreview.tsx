import {FC} from 'react';
import {ListRenderItemInfo} from 'react-native';
import {FlatList} from 'react-native-gesture-handler';
import {Text} from 'react-native-ui-lib';
import {useStyles} from '../../helpers/colors';

export interface Log {
  name: string;
  data: string[];
}

interface ILogPreviewProps {
  log: Log;
}

export const LogPreview: FC<ILogPreviewProps> = ({log}) => {
  const styles = useStyles(({theme}) => ({
    wrapper: {
      padding: 16,
      backgroundColor: theme.background,
    },
    line: {
      color: theme.text,
      marginVertical: 6,
    },
  }));

  return (
    <FlatList
      style={styles.wrapper}
      data={log.data}
      renderItem={({item}: ListRenderItemInfo<string>) => (
        <Text style={styles.line}>{item}</Text>
      )}
      keyExtractor={(_item: string, index: number) => `${index}`}
      inverted={true}
    />
  );
};
