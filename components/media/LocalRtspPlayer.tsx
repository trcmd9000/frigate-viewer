import React, {useEffect, useRef} from 'react';
import {StyleProp, ViewStyle} from 'react-native';
import {Media3MediaPlayer} from './Media3MediaPlayer';
import type {PlayableMedia} from './PlayableMedia';
import {releaseProtectedMediaUri} from '../../helpers/protectedMedia';

export const RTSP_FIRST_FRAME_TIMEOUT_MS = 15_000;

export type LocalRtspFailure = 'first-frame-timeout' | 'native';

interface LocalRtspPlayerProps {
  media: PlayableMedia;
  active: boolean;
  muted: boolean;
  style: StyleProp<ViewStyle>;
  onPlaying: () => void;
  onError: (reason: LocalRtspFailure) => void;
}

/**
 * Small lifecycle adapter around the existing Media3 player. It deliberately
 * starts muted and reports native/first-frame failures. The live-state
 * coordinator chooses fallback without owning native sockets.
 */
export const LocalRtspPlayer = ({
  media,
  active,
  muted,
  style,
  onPlaying,
  onError,
}: LocalRtspPlayerProps) => {
  const reported = useRef(false);
  const firstFrameTimer = useRef<ReturnType<typeof setTimeout>>();
  const consumed = useRef(false);
  const released = useRef(false);
  const onPlayingRef = useRef(onPlaying);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onPlayingRef.current = onPlaying;
    onErrorRef.current = onError;
  }, [onError, onPlaying]);

  useEffect(() => {
    if (!active) {
      return;
    }
    reported.current = false;
    consumed.current = false;
    released.current = false;
    if (firstFrameTimer.current) {
      clearTimeout(firstFrameTimer.current);
    }
    // This deadline belongs to the transport, not route discovery. The
    // component is mounted only after the native route has been validated.
    firstFrameTimer.current = setTimeout(() => {
      if (!reported.current) {
        reported.current = true;
        if (!consumed.current && !released.current) {
          released.current = true;
          releaseProtectedMediaUri(media.uri);
        }
        onErrorRef.current('first-frame-timeout');
      }
    }, RTSP_FIRST_FRAME_TIMEOUT_MS);
    return () => {
      if (firstFrameTimer.current) {
        clearTimeout(firstFrameTimer.current);
        firstFrameTimer.current = undefined;
      }
      if (!consumed.current && !released.current) {
        released.current = true;
        releaseProtectedMediaUri(media.uri);
      }
    };
  }, [active, media.uri]);

  const prepared = () => {
    consumed.current = true;
  };

  const firstFrame = (event?: {
    nativeEvent?: {
      width?: number;
      height?: number;
      naturalSize?: {width?: number; height?: number};
    };
    naturalSize?: {width?: number; height?: number};
  }) => {
    if (!active || reported.current) {
      return;
    }
    const dimensions =
      event?.naturalSize ||
      event?.nativeEvent?.naturalSize ||
      event?.nativeEvent;
    const width = Number(dimensions?.width);
    const height = Number(dimensions?.height);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return;
    }
    reported.current = true;
    consumed.current = true;
    if (firstFrameTimer.current) {
      clearTimeout(firstFrameTimer.current);
      firstFrameTimer.current = undefined;
    }
    onPlayingRef.current();
  };

  const nativeFailure = () => {
    if (!reported.current) {
      reported.current = true;
      if (!consumed.current && !released.current) {
        released.current = true;
        releaseProtectedMediaUri(media.uri);
      }
      onErrorRef.current('native');
    }
  };

  if (!active) {
    return null;
  }

  return (
    <Media3MediaPlayer
      media={media}
      paused={!active}
      muted={muted}
      style={style}
      onProgress={() => undefined}
      onEnd={nativeFailure}
      onError={nativeFailure}
      onPrepared={prepared}
      onFirstFrame={firstFrame}
    />
  );
};
