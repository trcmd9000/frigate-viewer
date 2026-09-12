import React, {FC} from 'react';
import {Text} from 'react-native';
import {useDesignTokens} from '../../helpers/designTokens';

interface SectionHeaderProps {
  children: string;
  testID?: string;
}

export const SectionHeader: FC<SectionHeaderProps> = ({children, testID}) => {
  const tokens = useDesignTokens();
  return (
    <Text
      testID={testID}
      accessibilityRole="header"
      style={{
        marginBottom: tokens.spacing.sm,
        color: tokens.colors.textPrimary,
        ...tokens.typography.sectionTitle,
      }}
    >
      {children}
    </Text>
  );
};
