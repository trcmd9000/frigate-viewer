import {useCallback, useEffect, useState} from 'react';
import {Dimensions} from 'react-native';
import {EventSubscription, Navigation} from 'react-native-navigation';

const getOrientation = (): 'portrait' | 'landscape' => {
  const screen = Dimensions.get('screen');
  return screen.width > screen.height ? 'landscape' : 'portrait';
};

export const useOrientation = () => {
  const [componentId, setComponentId] = useState<string>();
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(
    getOrientation,
  );

  const checkOrientation = useCallback(() => {
    const newOrientation = getOrientation();
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
