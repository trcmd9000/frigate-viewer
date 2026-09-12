import {IconOutline} from '@ant-design/icons-react-native';
import React, {FC, useEffect} from 'react';
import {BackHandler, Pressable, ScrollView, Text, View} from 'react-native';
import {useIntl} from 'react-intl';
import {useStyles, useTheme} from '../../helpers/colors';

interface LiveStreamOption {
  value: string;
  label: string;
}

interface LiveStreamControlProps {
  value: string;
  options: LiveStreamOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onValueChange: (value: string) => void;
}

export const LiveStreamControl: FC<LiveStreamControlProps> = ({
  value,
  options,
  open,
  onOpenChange,
  onValueChange,
}) => {
  const intl = useIntl();
  const theme = useTheme();
  const styles = useStyles(({theme}) => ({
    container: {
      position: 'relative',
      width: 48,
      height: 48,
      zIndex: 5,
    },
    trigger: {
      width: 48,
      height: 48,
      minWidth: 48,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 24,
      backgroundColor: theme.mediaOverlay,
    },
    menu: {
      position: 'absolute',
      right: 0,
      bottom: 56,
      width: 196,
      maxHeight: 216,
      overflow: 'hidden',
      borderRadius: 8,
      backgroundColor: theme.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.border,
      elevation: 8,
    },
    option: {
      minHeight: 40,
      paddingHorizontal: 10,
      paddingVertical: 6,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderColor: theme.border,
    },
    selectedOption: {
      backgroundColor: theme.link,
    },
    optionText: {
      flex: 1,
      color: theme.text,
      fontSize: 14,
    },
    selectedOptionText: {
      color: theme.textInverse,
    },
    selectedMark: {
      width: 20,
      marginLeft: 6,
      color: theme.text,
      fontSize: 16,
      textAlign: 'center',
    },
    selectedMarkActive: {
      color: theme.textInverse,
    },
  }));

  useEffect(() => {
    if (!open) {
      return;
    }
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onOpenChange(false);
        return true;
      },
    );
    return () => subscription.remove();
  }, [onOpenChange, open]);

  const select = (nextValue: string) => {
    onOpenChange(false);
    onValueChange(nextValue);
  };

  return (
    <View testID="camera-preview-stream-selector" style={styles.container}>
      {open && (
        <View
          testID="camera-preview-stream-menu"
          accessibilityRole="radiogroup"
          style={styles.menu}
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            {options.map(option => {
              const selected = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.option, selected && styles.selectedOption]}
                  onPress={() => select(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{selected}}
                  accessibilityLabel={option.label}
                >
                  <Text
                    style={[
                      styles.optionText,
                      selected && styles.selectedOptionText,
                    ]}
                    numberOfLines={2}
                  >
                    {option.label}
                  </Text>
                  <Text
                    style={[
                      styles.selectedMark,
                      selected && styles.selectedMarkActive,
                    ]}
                    accessible={false}
                  >
                    {selected ? '✓' : ''}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
      <Pressable
        testID="camera-preview-stream-dropdown"
        style={styles.trigger}
        onPress={() => onOpenChange(!open)}
        accessibilityRole="button"
        accessibilityLabel={intl.formatMessage({
          id: 'cameraPreview.stream.select',
          defaultMessage: 'Select live stream',
        })}
        accessibilityState={{expanded: open}}
      >
        <IconOutline
          accessible={false}
          name="setting"
          color={theme.mediaText}
          size={22}
        />
      </Pressable>
    </View>
  );
};