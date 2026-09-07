import React from 'react';
import {render} from '@testing-library/react-native';
import {CameraPreview} from '../../../views/camera-preview/CameraPreview';

jest.mock('react-native-navigation', () => ({}));

jest.mock('../../../views/camera-preview/LivePreview', () => ({
  ['LivePreview']: () => null,
}));

jest.mock('../../../helpers/colors', () => ({
  useStyles: (fn: (value: unknown) => unknown) =>
    fn({
      theme: {
        mediaBackground: '#000000',
        mediaText: '#ffffff',
      },
    }),
}));

describe('CameraPreview top overlay layout', () => {
  it('reserves a separate top region for long camera names', () => {
    const cameraName =
      'a-camera-name-that-is-long-enough-to-wrap-without-covering-status';
    const {getByTestId} = render(
      <CameraPreview
        cameraName={cameraName}
        componentId="camera-preview"
        componentName="CameraPreview"
      />,
    );
    const title = getByTestId('camera-preview-title');
    const style = title.props.style;

    expect(style.left).toBe(16);
    expect(style.right).toBe('52%');
    expect(style.maxWidth).toBeUndefined();
    expect(title.props.numberOfLines).toBe(2);
    expect(title.props.ellipsizeMode).toBe('tail');
    expect(title.props.accessibilityLabel).toBe(cameraName);
  });
});
