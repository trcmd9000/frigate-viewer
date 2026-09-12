import React, {FC} from 'react';
import {Text, View} from 'react-native';
import {DesignTokens, useDesignTokens} from '../../helpers/designTokens';

export type StatusChipTone = 'neutral' | 'success' | 'warning' | 'error' | 'accent';

interface StatusChipProps {
  label: string;
  tone?: StatusChipTone;
  accessibilityLabel?: string;
  testID?: string;
}

const colorsForTone = (tokens: DesignTokens, tone: StatusChipTone) => {
  switch (tone) {
    case 'success':
      return {backgroundColor: tokens.colors.successContainer, color: tokens.colors.textOnSuccess};
    case 'warning':
      return {backgroundColor: tokens.colors.warningContainer, color: tokens.colors.textOnWarning};
    case 'error':
      return {backgroundColor: tokens.colors.errorContainer, color: tokens.colors.textOnError};
    case 'accent':
      return {backgroundColor: tokens.colors.accentContainer, color: tokens.colors.textPrimary};
    default:
      return {backgroundColor: tokens.colors.surfaceElevated, color: tokens.colors.textPrimary};
  }
};

export const StatusChip: FC<StatusChipProps> = ({
  label,
  tone = 'neutral',
  accessibilityLabel,
  testID,
}) => {
  const tokens = useDesignTokens();
  const colors = colorsForTone(tokens, tone);
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel || label}
      style={{
        minHeight: tokens.geometry.minimumTouchTarget,
        alignSelf: 'flex-start',
        justifyContent: 'center',
        paddingHorizontal: tokens.spacing.md,
        paddingVertical: tokens.spacing.sm,
        borderRadius: tokens.geometry.pillRadius,
        backgroundColor: colors.backgroundColor,
      }}
    >
      <Text style={{...tokens.typography.label, color: colors.color}}>{label}</Text>
    </View>
  );
};
