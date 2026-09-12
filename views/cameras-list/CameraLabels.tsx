import React, {FC, useCallback} from 'react';
import {ListRenderItemInfo, Pressable, StyleSheet, Text} from 'react-native';
import {selectAvailableLabels} from '../../store/events';
import {
  selectCamerasNumColumns,
  selectCamerasPreviewHeight,
} from '../../store/settings';
import {useAppSelector} from '../../store/store';
import {FlatList} from 'react-native-gesture-handler';
import {useStyles} from '../../helpers/colors';

const stylesFn = (
  numColumns: number,
  theme: {surfaceElevated: string; successSurface: string; text: string},
) =>
  StyleSheet.create({
    wrapper: {
      width: '100%',
      height: '100%',
      backgroundColor: theme.surfaceElevated,
      padding: 2,
      marginTop: 35 / numColumns,
    },
    label: {
      display: 'flex',
      margin: 2,
      padding: 5,
      minHeight: 48,
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-end',
      flex: 1,
      maxWidth: '24%',
      height: 80 / numColumns,
      backgroundColor: theme.successSurface,
    },
    labelText: {
      fontSize: 14 / numColumns,
      color: theme.text,
    },
    iconEmoji: {
      fontSize: 40 / (numColumns * 1.5),
      color: theme.text,
    },
  });

const labelEmoji: Record<string, string> = {
  person: '🧑',
  car: '🚗',
  cat: '🐈',
  dog: '🐕',
  bus: '🚌',
  bicycle: '🚲',
  plate: '🔢',
};

interface ICameraLabelsProps {
  height?: number;
  onLabelPress: (label: string) => void;
}

export const CameraLabels: FC<ICameraLabelsProps> = ({
  height,
  onLabelPress,
}) => {
  const labels = useAppSelector(selectAvailableLabels);
  const previewHeight = useAppSelector(selectCamerasPreviewHeight);
  const numColumns = useAppSelector(selectCamerasNumColumns);
  const styles = useStyles(({theme}) => stylesFn(numColumns, theme));

  const onPress = useCallback(
    (label: string) => () => {
      onLabelPress(label);
    },
    [onLabelPress],
  );

  return (
    <FlatList
      data={labels}
      numColumns={4}
      renderItem={({item}: ListRenderItemInfo<string>) => (
        <Pressable
          style={styles.label}
          onPress={onPress(item)}
          accessibilityRole="button"
          accessibilityLabel={item}
        >
          {labelEmoji[item] && (
            <Text style={styles.iconEmoji}>{labelEmoji[item]}</Text>
          )}
          <Text style={styles.labelText}>{item}</Text>
        </Pressable>
      )}
      keyExtractor={(label: string) => label}
      style={[
        styles.wrapper,
        {height: (height || previewHeight) - 35 / numColumns},
      ]}
    />
  );
};
