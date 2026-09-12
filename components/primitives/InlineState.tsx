import React, {FC} from 'react';
import {Text, View} from 'react-native';
import {IconOutline, OutlineGlyphMapType} from '@ant-design/icons-react-native';
import {useDesignTokens} from '../../helpers/designTokens';

interface InlineStateProps {
  icon: OutlineGlyphMapType;
  title: string;
  description?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'error';
  action?: React.ReactNode;
  testID?: string;
}

export const InlineState: FC<InlineStateProps> = ({
  icon,
  title,
  description,
  tone = 'neutral',
  action,
  testID,
}) => {
  const tokens = useDesignTokens();
  const color =
    tone === 'error'
      ? tokens.colors.error
      : tone === 'warning'
      ? tokens.colors.warning
      : tone === 'success'
      ? tokens.colors.success
      : tokens.colors.textSecondary;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={[title, description].filter(Boolean).join('. ')}
      style={{
        padding: tokens.spacing.lg,
        borderRadius: tokens.geometry.controlRadius,
        backgroundColor:
          tone === 'error'
            ? tokens.colors.errorContainer
            : tone === 'warning'
            ? tokens.colors.warningContainer
            : tone === 'success'
            ? tokens.colors.successContainer
            : tokens.colors.surfaceElevated,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <IconOutline name={icon} color={color} size={20} accessible={false} />
      <View style={{flex: 1, marginLeft: tokens.spacing.md}}>
        <Text style={{...tokens.typography.body, color: tokens.colors.textPrimary}}>
          {title}
        </Text>
        {description ? (
          <Text style={{...tokens.typography.supporting, color: tokens.colors.textSecondary}}>
            {description}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
};
