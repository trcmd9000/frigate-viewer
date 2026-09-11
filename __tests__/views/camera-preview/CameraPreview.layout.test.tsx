import React from 'react';
import {render} from '@testing-library/react-native';
import {CameraPreview} from '../../../views/camera-preview/CameraPreview';

jest.mock('react-native-navigation', () => ({}));

jest.mock('../../../store/store', () => ({
  store: {getState: () => ({events: {scopeGeneration: 0}})},
  useAppSelector: () => 0,
}));

jest.mock('../../../views/camera-preview/LivePreview', () => {
  const ReactModule = require('react');
  const {View} = require('react-native');
  return {
    ['LivePreview']: ({cameraName}: {cameraName: string}) =>
      ReactModule.createElement(View, {
        testID: 'delegated-live-preview',
        cameraName,
      }),
  };
});

jest.mock('../../../helpers/colors', () => ({
  useStyles: (fn: (value: unknown) => unknown) =>
    fn({
      theme: {
        mediaBackground: '#000000',
        mediaText: '#ffffff',
      },
    }),
}));

describe('CameraPreview overlay ownership', () => {
  it('delegates the camera name to the live preview overlay', () => {
    const cameraName =
      'a-camera-name-that-is-long-enough-to-wrap-without-covering-status';
    const view = render(
      <CameraPreview
        cameraName={cameraName}
        componentId="camera-preview"
        componentName="CameraPreview"
      />,
    );
    expect(view.getByTestId('delegated-live-preview').props.cameraName).toBe(
      cameraName,
    );
    expect(view.queryByTestId('camera-preview-title')).toBeNull();
  });
});
