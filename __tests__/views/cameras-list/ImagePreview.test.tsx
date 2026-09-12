import React from 'react';
import {render} from '@testing-library/react-native';
import {ImagePreview} from '../../../views/cameras-list/ImagePreview';

jest.mock('../../../helpers/designTokens', () => ({
  useDesignTokens: () => ({
    colors: {
      mediaBackground: '#000000',
      surfaceElevated: '#2a2a2a',
    },
    geometry: {mediaAspectRatio: 16 / 9, minimumTouchTarget: 48},
  }),
}));

jest.mock('../../../components/ZoomableImage', () => ({
  ['ZoomableImage']: () => null,
}));

describe('ImagePreview', () => {
  it('keeps a media-colored 16:9 surface and announces loading state', () => {
    const {getByTestId, getByLabelText} = render(
      <ImagePreview accessibilityLabel="Front snapshot" />,
    );

    const media = getByTestId('camera-card-media');
    expect(media.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          aspectRatio: 16 / 9,
          backgroundColor: '#000000',
        }),
      ]),
    );
    expect(getByLabelText('Loading camera snapshot')).toBeTruthy();
    expect(getByTestId('camera-card-media-skeleton')).toBeTruthy();
  });

  it('keeps the interactive target accessible when a snapshot is available', () => {
    const {getByLabelText} = render(
      <ImagePreview
        imageUrl="file:///snapshot.jpg"
        onPress={jest.fn()}
        accessibilityLabel="Front snapshot"
      />,
    );

    expect(getByLabelText('Front snapshot')).toBeTruthy();
  });
});
