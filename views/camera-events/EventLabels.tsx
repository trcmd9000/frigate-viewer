import React, {FC, useMemo} from 'react';
import {useIntl} from 'react-intl';
import {StyleProp, Text, View, ViewStyle} from 'react-native';
import {messages} from './messages';
import {useDesignTokens} from '../../helpers/designTokens';

interface IEventLabelsProps {
  endTime: number;
  label: string;
  zones: string[];
  topScore: number;
  style?: StyleProp<ViewStyle>;
  numColumns?: number;
}

export const EventLabels: FC<IEventLabelsProps> = ({
  endTime,
  label,
  zones,
  topScore,
  style,
}) => {
  const score = useMemo(() => {
    return `${Math.round(topScore * 100)}%`;
  }, [topScore]);
  const isInProgress = useMemo(() => !endTime, [endTime]);
  const intl = useIntl();

  const tokens = useDesignTokens();

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: tokens.spacing.sm,
        },
        style,
      ]}
    >
      <Text
        style={{
          ...tokens.typography.label,
          color: tokens.colors.textOnAccent,
          backgroundColor: tokens.colors.accent,
          paddingHorizontal: tokens.spacing.sm,
          paddingVertical: tokens.spacing.xs,
          borderRadius: tokens.geometry.controlRadius,
        }}
      >
        {label}
      </Text>
      {zones.map(zone => (
        <Text
          style={{
            ...tokens.typography.label,
            color: tokens.colors.textOnMedia,
            backgroundColor: tokens.colors.mediaBackground,
            paddingHorizontal: tokens.spacing.sm,
            paddingVertical: tokens.spacing.xs,
            borderRadius: tokens.geometry.controlRadius,
          }}
          key={zone}
        >
          {zone}
        </Text>
      ))}
      <Text
        style={{
          ...tokens.typography.label,
          color: tokens.colors.textSecondary,
          backgroundColor: tokens.colors.surfaceElevated,
          paddingHorizontal: tokens.spacing.sm,
          paddingVertical: tokens.spacing.xs,
          borderRadius: tokens.geometry.controlRadius,
        }}
      >
        {score}
      </Text>
      {isInProgress && (
        <Text
          style={{
            ...tokens.typography.label,
            color: tokens.colors.textOnWarning,
            backgroundColor: tokens.colors.warningContainer,
            paddingHorizontal: tokens.spacing.sm,
            paddingVertical: tokens.spacing.xs,
            borderRadius: tokens.geometry.controlRadius,
          }}
        >
          {intl.formatMessage(messages['labels.inProgressLabel'])}
        </Text>
      )}
    </View>
  );
};
