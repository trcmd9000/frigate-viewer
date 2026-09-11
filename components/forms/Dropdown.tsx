import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {IconOutline, OutlineGlyphMapType} from '@ant-design/icons-react-native';
import {
  FlatList,
  ListRenderItemInfo,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
} from 'react-native';
import {useFormsStyles} from './styles';
import {useStyles} from '../../helpers/colors';

type DropdownValue = string | number | null | undefined;

export interface IDropdownOption<T extends DropdownValue> {
  value: T;
  label?: string;
}

interface IDropdownProps<T extends DropdownValue> {
  value?: T;
  options: IDropdownOption<T>[];
  onValueChange?: (value: T) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  compact?: boolean;
  icon?: OutlineGlyphMapType;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const OPTION_HEIGHT = 56;

export const Dropdown = <T extends DropdownValue>({
  value,
  options,
  onValueChange,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  compact = false,
  icon = 'switcher',
  open,
  onOpenChange,
}: IDropdownProps<T>) => {
  const formsStyles = useFormsStyles();
  const styles = useStyles(({theme}) => ({
    trigger: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    triggerText: {
      flex: 1,
      color: theme.text,
    },
    chevron: {
      color: theme.text,
      fontSize: 18,
    },
    disabled: {
      backgroundColor: theme.highlighted,
      borderColor: theme.disabled,
      opacity: 0.6,
    },
    compactTrigger: {
      width: 48,
      height: 48,
      minWidth: 48,
      minHeight: 48,
      justifyContent: 'center',
      paddingHorizontal: 0,
      paddingVertical: 0,
      borderWidth: 0,
      borderBottomWidth: 0,
      borderRadius: 24,
      backgroundColor: theme.mediaOverlay || theme.surface,
    },
    modal: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.overlay,
    },
    panel: {
      width: '100%',
      maxHeight: '80%',
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.border,
      elevation: 8,
    },
    option: {
      height: OPTION_HEIGHT,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderColor: theme.border,
    },
    optionSelected: {
      backgroundColor: theme.highlighted,
    },
    optionText: {
      flex: 1,
      color: theme.text,
    },
    selection: {
      width: 24,
      marginLeft: 12,
      color: theme.link,
      fontSize: 18,
      textAlign: 'center',
    },
  }));

  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const opened = open ?? uncontrolledOpen;
  const setOpened = useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, open],
  );
  const listRef = useRef<FlatList<IDropdownOption<T>>>(null);
  const selectedIndex = useMemo(
    () => options.findIndex(option => Object.is(value, option.value)),
    [options, value],
  );
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const close = useCallback(() => {
    setOpened(false);
  }, []);

  useEffect(() => {
    if (!opened || selectedIndex < 0) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        index: selectedIndex,
        animated: false,
        viewPosition: 0.5,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [opened, selectedIndex]);

  const select = useCallback(
    (option: IDropdownOption<T>) => {
      onValueChange?.(option.value);
      close();
    },
    [close, onValueChange],
  );

  const renderOption = useCallback(
    ({item}: ListRenderItemInfo<IDropdownOption<T>>) => {
      const isSelected = Object.is(item.value, value);
      const itemLabel =
        item.label ?? (item.value === null || item.value === undefined
          ? ''
          : String(item.value));
      return (
        <Pressable
          style={[styles.option, isSelected && styles.optionSelected]}
          onPress={() => select(item)}
          accessibilityRole="radio"
          accessibilityState={{selected: isSelected}}
          accessibilityLabel={itemLabel}
        >
          <Text
            style={styles.optionText}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {itemLabel}
          </Text>
          <Text style={styles.selection} accessible={false}>
            {isSelected ? '✓' : ''}
          </Text>
        </Pressable>
      );
    },
    [select, styles, value],
  );

  const selectedLabel =
    selected?.label ??
    (selected?.value === null || selected?.value === undefined
      ? ''
      : String(selected.value));

  return (
    <>
      <Pressable
        testID={testID}
        style={[
          !compact && formsStyles.input,
          styles.trigger,
          compact && styles.compactTrigger,
          (disabled || options.length === 0) && styles.disabled,
        ]}
        onPress={() => setOpened(true)}
        disabled={disabled || options.length === 0}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || selectedLabel || 'Select an option'}
        accessibilityHint={accessibilityHint}
        accessibilityState={{
          disabled: disabled || options.length === 0,
          expanded: opened,
        }}
      >
        {compact ? (
          <IconOutline
            accessible={false}
            name={icon}
            color={(styles.triggerText as TextStyle).color as string}
            size={22}
          />
        ) : (
          <>
            <Text style={styles.triggerText} numberOfLines={2}>
              {selectedLabel}
            </Text>
            <Text style={styles.chevron} accessible={false}>
              ▾
            </Text>
          </>
        )}
      </Pressable>
      <Modal
        visible={opened}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={close}
        accessibilityViewIsModal
      >
        <View style={styles.modal}>
          <Pressable
            style={styles.backdrop}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close options"
          />
          <View style={styles.panel}>
            <FlatList
              ref={listRef}
              data={options}
              renderItem={renderOption}
              keyExtractor={(_, index) => String(index)}
              getItemLayout={(_, index) => ({
                length: OPTION_HEIGHT,
                offset: OPTION_HEIGHT * index,
                index,
              })}
              onScrollToIndexFailed={({index}) => {
                listRef.current?.scrollToOffset({
                  offset: Math.max(0, index * OPTION_HEIGHT),
                  animated: false,
                });
              }}
              keyboardShouldPersistTaps="handled"
              accessibilityRole="radiogroup"
            />
          </View>
        </View>
      </Modal>
    </>
  );
};
