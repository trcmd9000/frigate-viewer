import React, {
  ForwardedRef,
  forwardRef,
  useImperativeHandle,
  useRef,
} from 'react';
import {StyleProp, ViewStyle} from 'react-native';
import VLCPlayer, {State} from '@lunarr/vlc-player';
import {
  MediaPlayerHandle,
  MediaProgress,
  PlayableMedia,
} from './PlayableMedia';

interface VlcMediaPlayerProps {
  media: PlayableMedia;
  paused: boolean;
  style: StyleProp<ViewStyle>;
  onProgress: (progress: MediaProgress) => void;
  onEnd: () => void;
  onStopped: () => void;
}

const VlcMediaPlayerComponent = (
  {
    media,
    paused,
    style,
    onProgress,
    onEnd,
    onStopped,
  }: VlcMediaPlayerProps,
  ref: ForwardedRef<MediaPlayerHandle>,
) => {
  const player = useRef<VLCPlayer>(null);

  useImperativeHandle(ref, () => ({
    seek: positionSeconds => {
      player.current?.seek(positionSeconds);
    },
    resume: () => {
      player.current?.resume(true);
    },
  }));

  return (
    <VLCPlayer
      ref={player}
      paused={paused}
      source={{uri: media.uri}}
      style={style}
      onProgress={(state: State) => onProgress(state)}
      onStopped={onStopped}
      onEnd={onEnd}
    />
  );
};

export const VlcMediaPlayer = forwardRef<
  MediaPlayerHandle,
  VlcMediaPlayerProps
>(VlcMediaPlayerComponent);
