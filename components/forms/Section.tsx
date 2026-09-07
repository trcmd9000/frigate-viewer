import React, {FC} from 'react';
import {Pressable, Text, TextInputProps, View} from 'react-native';
import {useDesignTokens} from '../../helpers/designTokens';

export interface ISectionProps extends TextInputProps {
  header: string | JSX.Element;
  summary?: string;
  expanded?: boolean;
  onToggle?: () => void;
  testID?: string;
  invalid?: boolean;
  compact?: boolean;
}

export const Section: FC<ISectionProps> = ({
  header,
  children,
  summary,
  expanded = true,
  onToggle,
  testID,
  invalid,
  compact = false,
}) => {
  const tokens = useDesignTokens();
  const headerContent = (
    <View style={{flex: 1}}>
      <Text
        accessibilityRole="header"
        style={{
          color: tokens.colors.textPrimary,
          ...tokens.typography.sectionTitle,
        }}
      >
        {header}
      </Text>
      {summary ? (
        <Text
          style={{
            color: invalid ? tokens.colors.error : tokens.colors.textSecondary,
            ...tokens.typography.supporting,
          }}
        >
          {summary}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View
      testID={testID}
      style={{marginVertical: compact ? tokens.spacing.sm : tokens.spacing.md}}
      accessibilityState={onToggle ? {expanded} : undefined}
    >
      {onToggle ? (
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{expanded}}
          style={{
            minHeight: tokens.geometry.minimumTouchTarget,
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: compact ? tokens.spacing.xs : tokens.spacing.sm,
          }}
        >
          {headerContent}
          <Text
            accessibilityElementsHidden
            style={{
              color: tokens.colors.textSecondary,
              fontSize: 22,
              paddingHorizontal: tokens.spacing.sm,
            }}
          >
            {expanded ? '−' : '+'}
          </Text>
        </Pressable>
      ) : (
        headerContent
      )}
      {expanded ? children : null}
    </View>
  );
};
