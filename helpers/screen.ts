import {useCallback, useEffect, useState} from 'react';
import {Dimensions} from 'react-native';
import {EventSubscription, Navigation} from 'react-native-navigation';

export type ScreenOrientation = 'portrait' | 'landscape';

export const getScreenOrientation = (): ScreenOrientation => {
  const screen = Dimensions.get('screen');
  return screen.width > screen.height ? 'landscape' : 'portrait';
};

export const useOrientation = () => {
  const [componentId, setComponentId] = useState<string>();
  const [orientation, setOrientation] =
    useState<ScreenOrientation>(getScreenOrientation);

  const checkOrientation = useCallback(() => {
    const newOrientation = getScreenOrientation();
    setOrientation(currentOrientation =>
      currentOrientation === newOrientation
        ? currentOrientation
        : newOrientation,
    );
  }, []);

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', checkOrientation);
    return () => {
      sub.remove();
    };
  }, [checkOrientation]);

  useEffect(() => {
    let listener: EventSubscription | undefined;
    if (componentId) {
      listener = Navigation.events().registerComponentListener(
        {
          componentDidDisappear() {
            checkOrientation();
          },
        },
        componentId,
      );
    }
    return () => {
      listener?.remove();
    };
  }, [checkOrientation, componentId]);

  return {
    orientation,
    setComponentId,
  };
};
