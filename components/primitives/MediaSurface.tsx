import React, {FC, ReactNode} from 'react';
import {StyleProp, View, ViewStyle} from 'react-native';
import {useDesignTokens} from '../../helpers/designTokens';

interface MediaSurfaceProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessible?: boolean;
  accessibilityLabel?: string;
}

export const MediaSurface: FC<MediaSurfaceProps> = ({
  children,
  style,
  testID,
  accessible = false,
  accessibilityLabel,
}) => {
  const tokens = useDesignTokens();
  return (
    <View
      testID={testID}
      accessible={accessible}
      accessibilityRole={accessible ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          width: '100%',
          aspectRatio: tokens.geometry.mediaAspectRatio,
          overflow: 'hidden',
          backgroundColor: tokens.colors.mediaBackground,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};
