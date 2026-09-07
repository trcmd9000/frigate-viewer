import {IconOutline, OutlineGlyphMapType} from '@ant-design/icons-react-native';
import React, {FC, useCallback} from 'react';
import {useIntl} from 'react-intl';
import {Pressable, Text, View} from 'react-native';
import {useStyles, useTheme} from '../../helpers/colors';
import {messages as menuMessages} from '../../views/menu/messages';

interface ITopBarButtonProps {
  icon: OutlineGlyphMapType;
  count?: number;
  onPress: () => void;
}

export const TopBarButton: FC<ITopBarButtonProps> = ({
  icon,
  count,
  onPress,
}) => {
  const theme = useTheme();
  const intl = useIntl();
  const styles = useStyles(({theme: palette}) => ({
    button: {
      minWidth: 48,
      minHeight: 48,
      paddingHorizontal: 12,
      marginHorizontal: 4,
      paddingVertical: 14,
      backgroundColor: palette.surface,
    },
    bullet: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      minWidth: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: palette.error,
    },
    bulletText: {
      color: palette.textInverse,
      textAlign: 'center',
      lineHeight: 12,
      fontSize: 10,
      fontWeight: '700',
    },
  }));
  const press = useCallback(() => {
    if (onPress) {
      onPress();
    }
  }, [onPress]);

  return (
    <Pressable
      onPress={press}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel={
        icon === 'sync'
          ? 'Refresh'
          : icon === 'ellipsis'
          ? intl.formatMessage(menuMessages['button.label'])
          : 'Filter'
      }
    >
      <View>
        <IconOutline accessible={false} name={icon} color={theme.text} size={20} />
        {count !== undefined && count !== 0 && (
          <View style={styles.bullet}>
            <Text style={styles.bulletText}>{`${count}`}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
};
