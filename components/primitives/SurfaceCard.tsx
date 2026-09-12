import React, {FC, ReactNode} from 'react';
import {
  Pressable,
  PressableProps,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';
import {useDesignTokens} from '../../helpers/designTokens';

interface SurfaceCardProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  onPress?: PressableProps['onPress'];
  accessibilityRole?: PressableProps['accessibilityRole'];
  accessibilityLabel?: string;
}

export const SurfaceCard: FC<SurfaceCardProps> = ({
  children,
  style,
  testID,
  onPress,
  accessibilityRole,
  accessibilityLabel,
}) => {
  const tokens = useDesignTokens();
  const cardStyle = [
    {
      backgroundColor: tokens.colors.surface,
      borderRadius: tokens.geometry.cardRadius,
      borderWidth: 1,
      borderColor: tokens.colors.outline,
      padding: tokens.spacing.lg,
    },
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        style={cardStyle}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View testID={testID} style={cardStyle}>
      {children}
    </View>
  );
};
