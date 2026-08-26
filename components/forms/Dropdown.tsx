import React, {useCallback, useMemo, useState} from 'react';
import {FlatList, Modal, Pressable, StyleSheet, Text} from 'react-native';
import {useFormsStyles} from './styles';
import {useStyles} from '../../helpers/colors';

type DropdownValue = string | number | null | undefined;

interface IDropdownOption<T extends DropdownValue> {
  value: T;
  label?: string;
}

interface IDropdownProps<T extends DropdownValue> {
  value?: T;
  options: IDropdownOption<T>[];
  onValueChange?: (value: T) => void;
}

export const Dropdown = <T extends DropdownValue>({
  value,
  options,
  onValueChange,
}: IDropdownProps<T>) => {
  const formsStyles = useFormsStyles();
  const styles = useStyles(({theme}) => ({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.overlay,
    },
    options: {
      flexGrow: 1,
      justifyContent: 'center',
      width: '100%',
      borderTopWidth: 1,
      borderColor: theme.border,
    },
    item: {
      paddingHorizontal: 4,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
    },
    itemSelected: {
      backgroundColor: theme.highlighted,
    },
    itemText: {
      color: theme.text,
    },
  }));

  const [opened, setOpened] = useState(false);
  const selected = useMemo(
    () => options.find(option => value === option.value),
    [options, value],
  );

  const open = useCallback(() => {
    setOpened(true);
  }, []);

  const close = useCallback(() => {
    setOpened(false);
  }, []);

  const toggle = useCallback(() => {
    if (opened) {
      close();
    } else {
      open();
    }
  }, [close, open, opened]);

  const select = useCallback(
    (option: IDropdownOption<T>) => () => {
      onValueChange?.(option.value);
      close();
    },
    [close, onValueChange],
  );

  return (
    <>
      {opened && (
        <Modal>
          <Pressable style={styles.overlay} />
          <FlatList
            contentContainerStyle={[styles.options]}
            data={options}
            renderItem={({item}) => (
              <Pressable
                style={[
                  styles.item,
                  item === selected ? styles.itemSelected : undefined,
                ]}
                onPress={select(item)}
              >
                <Text style={styles.itemText}>{item.label || item.value}</Text>
              </Pressable>
            )}
          />
        </Modal>
      )}
      <Pressable style={formsStyles.input} onPress={toggle}>
        <Text style={formsStyles.inputText}>
          {selected ? selected.label || selected.value : ''}
        </Text>
      </Pressable>
    </>
  );
};
