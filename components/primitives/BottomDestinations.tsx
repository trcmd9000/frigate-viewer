import React, {FC} from 'react';
import {Pressable, Text, View} from 'react-native';
import {useDesignTokens} from '../../helpers/designTokens';

export interface BottomDestination {
  key: string;
  label: string;
  icon?: React.ReactNode;
}

interface BottomDestinationsProps {
  destinations: readonly BottomDestination[];
  selectedKey: string;
  onSelect: (key: string) => void;
  testID?: string;
}

export const BottomDestinations: FC<BottomDestinationsProps> = ({
  destinations,
  selectedKey,
  onSelect,
  testID,
}) => {
  const tokens = useDesignTokens();
  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={{
        minHeight: tokens.geometry.minimumTouchTarget,
        flexDirection: 'row',
        backgroundColor: tokens.colors.surface,
        borderTopWidth: 1,
        borderTopColor: tokens.colors.divider,
      }}
    >
      {destinations.map(destination => {
        const selected = destination.key === selectedKey;
        return (
          <Pressable
            key={destination.key}
            onPress={() => onSelect(destination.key)}
            accessibilityRole="tab"
            accessibilityLabel={destination.label}
            accessibilityState={{selected}}
            style={{
              minWidth: tokens.geometry.minimumTouchTarget,
              minHeight: tokens.geometry.minimumTouchTarget,
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: tokens.spacing.sm,
              paddingVertical: tokens.spacing.xs,
              backgroundColor: selected
                ? tokens.colors.accentContainer
                : tokens.colors.surface,
            }}
          >
            {destination.icon}
            <Text
              style={{
                ...tokens.typography.label,
                color: selected ? tokens.colors.accent : tokens.colors.textSecondary,
              }}
            >
              {destination.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};
