import React, {FC} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import type {MessageDescriptor} from 'react-intl';
import {ZoomableImage} from '../../components/ZoomableImage';
import {MediaSurface} from '../../components/primitives';
import {useDesignTokens} from '../../helpers/designTokens';
import {messages} from './messages';

export type ImagePreviewState = 'loading' | 'decoded' | 'error';

const defaultMessage = (message: MessageDescriptor): string =>
  typeof message.defaultMessage === 'string'
    ? message.defaultMessage
    : message.id || '';

const styles = StyleSheet.create({
  image: {
    ...StyleSheet.absoluteFillObject,
  },
  skeleton: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.55,
  },
});

interface IImagePreviewProps {
  height?: number;
  imageUrl?: string;
  onPress?: () => void;
  onPreviewLoad?: (imageUrl: string) => void;
  onPreviewError?: (imageUrl: string) => void;
  accessibilityLabel?: string;
  state?: ImagePreviewState;
  loadingLabel?: string;
  unavailableLabel?: string;
}

export const ImagePreview: FC<IImagePreviewProps> = ({
  height,
  imageUrl,
  onPress,
  onPreviewLoad,
  onPreviewError,
  accessibilityLabel,
  state = 'loading',
  loadingLabel = defaultMessage(messages.loadingSnapshot),
  unavailableLabel = defaultMessage(messages.snapshotUnavailable),
}) => {
  const tokens = useDesignTokens();
  const interactive = Boolean(onPress);
  const media = (
    <MediaSurface
      testID="camera-card-media"
      style={[
        height
          ? {height, aspectRatio: undefined}
          : undefined,
        {position: 'relative'},
      ]}
    >
      {!imageUrl && state === 'loading' && (
        <View
          testID="camera-card-media-skeleton"
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={loadingLabel}
          style={[
            styles.skeleton,
            {backgroundColor: tokens.colors.surfaceElevated},
          ]}
        />
      )}
      {!imageUrl && state === 'error' && (
        <View
          testID="camera-card-media-error"
          accessible
          accessibilityRole="image"
          accessibilityLabel={unavailableLabel}
          style={[
            styles.skeleton,
            {backgroundColor: tokens.colors.surfaceElevated},
          ]}
        />
      )}
      {imageUrl && (
        <ZoomableImage
          key={imageUrl}
          source={{
            uri: imageUrl,
          }}
          style={styles.image}
          fadeDuration={0}
          resizeMode="contain"
          resizeMethod="scale"
          onLoad={() => onPreviewLoad?.(imageUrl)}
          onError={() => onPreviewError?.(imageUrl)}
        />
      )}
    </MediaSurface>
  );

  if (!interactive) {
    return (
      <View
        pointerEvents="none"
        accessible={Boolean(accessibilityLabel)}
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
        style={{minHeight: tokens.geometry.minimumTouchTarget}}
      >
        {media}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={interactive ? 'button' : 'image'}
      accessibilityLabel={accessibilityLabel}
      style={{minHeight: tokens.geometry.minimumTouchTarget}}
    >
      {media}
    </Pressable>
  );
};
