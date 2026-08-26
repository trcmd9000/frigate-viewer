/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'react-native-ui-lib' {
  import * as React from 'react';
  import {
    SwitchProps as RNSwitchProps,
    Text as RNText,
    View as RNView,
  } from 'react-native';

  export type SwitchProps = RNSwitchProps;
  export const View: typeof RNView;
  export const Text: typeof RNText;
  export const Switch: React.ComponentType<SwitchProps>;
  export const Button: React.ComponentType<any> & {sizes: Record<string, any>};
  export const ActionBar: React.ComponentType<any>;
  export const ActionSheet: React.ComponentType<any>;
  export const Dialog: React.ComponentType<any>;
  export const Carousel: React.ComponentType<any>;
  export const LoaderScreen: React.ComponentType<any>;
  export const Colors: Record<string, string>;
  export const PageControlPosition: Record<string, any>;
}

declare module 'react-native-gesture-handler' {
  import * as React from 'react';
  import {
    FlatList as RNFlatList,
    ScrollView as RNScrollView,
    TouchableHighlight as RNTouchableHighlight,
  } from 'react-native';

  export const Gesture: any;
  export const GestureDetector: React.ComponentType<any>;
  export const FlatList: typeof RNFlatList;
  export const ScrollView: typeof RNScrollView;
  export const TouchableHighlight: typeof RNTouchableHighlight;
}

declare module 'react-native-reanimated' {
  const Animated: any;
  export default Animated;
  export const LightSpeedInLeft: any;
  export const LightSpeedInRight: any;
  export const clamp: any;
  export const measure: any;
  export const runOnJS: any;
  export const useAnimatedRef: any;
  export const useAnimatedStyle: any;
  export const useSharedValue: any;
  export const withDelay: any;
  export const withSequence: any;
  export const withSpring: any;
  export const withTiming: any;
}

declare module 'react-native-svg' {
  export const Circle: any;
  export const G: any;
  export const Line: any;
  export const Path: any;
  export const Text: any;
  const Svg: any;
  export default Svg;
}

declare module '@react-native-picker/picker' {
  export const Picker: any;
}
