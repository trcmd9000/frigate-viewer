import React, {FC, ReactNode} from 'react';
import {Text, View} from 'react-native';
import {useDesignTokens} from '../../helpers/designTokens';

interface AppBarProps {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  actions?: ReactNode;
  testID?: string;
}

export const AppBar: FC<AppBarProps> = ({
  title,
  subtitle,
  leading,
  actions,
  testID,
}) => {
  const tokens = useDesignTokens();
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="header"
      style={{
        minHeight: tokens.geometry.minimumTouchTarget,
        paddingHorizontal: tokens.spacing.lg,
        paddingVertical: tokens.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: tokens.colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: tokens.colors.divider,
      }}
    >
      {leading}
      <View style={{flex: 1, marginHorizontal: tokens.spacing.sm}}>
        <Text style={{...tokens.typography.screenTitle, color: tokens.colors.textPrimary}}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{...tokens.typography.supporting, color: tokens.colors.textSecondary}}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actions}
    </View>
  );
};
