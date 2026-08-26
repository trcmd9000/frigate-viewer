import React, {FC} from 'react';
import {ImageProps} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

type IZoomableImageProps = ImageProps;

interface PinchGestureEvent {
  scale: number;
}
interface PanGestureEvent {
  translationX: number;
  translationY: number;
}

export const ZoomableImage: FC<IZoomableImageProps> = ({
  style,
  ...imageProps
}) => {
  const offset = useSharedValue({x: 0, y: 0});
  const scale = useSharedValue(1);

  const animatedStyles = useAnimatedStyle(() => {
    return {
      transform: [
        {translateX: scale.value * offset.value.x},
        {translateY: scale.value * offset.value.y},
        {scale: withSpring(Math.max(scale.value, 1))},
      ],
    };
  });

  const nativeGesture = Gesture.Native();

  const zoomGesture = Gesture.Pinch()
    .onUpdate((event: PinchGestureEvent) => {
      scale.value = event.scale;
    })
    .onEnd(() => {
      scale.value = 1;
    });

  const dragGesture = Gesture.Pan()
    .averageTouches(true)
    .minPointers(2)
    .onUpdate((event: PanGestureEvent) => {
      offset.value = {
        x: event.translationX,
        y: event.translationY,
      };
    })
    .onEnd(() => {
      offset.value = {x: 0, y: 0};
    });

  const gestures = Gesture.Race(
    nativeGesture,
    Gesture.Simultaneous(zoomGesture, dragGesture),
  );

  return (
    <GestureDetector gesture={gestures}>
      <Animated.Image style={[style, animatedStyles]} {...imageProps} />
    </GestureDetector>
  );
};
