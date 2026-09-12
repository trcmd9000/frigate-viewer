import React, {ReactNode} from 'react';
import {View} from 'react-native';

export const LucideProvider = ({children}: {children: ReactNode}) => (
  <>{children}</>
);

export const Volume = () => (
  <View testID="lucide-icon" accessibilityLabel="volume" />
);
export const VolumeX = () => (
  <View testID="lucide-icon" accessibilityLabel="volume-x" />
);