import React, {
  ForwardedRef,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import {StyleProp, ViewStyle} from 'react-native';
import Video, {OnLoadData, OnProgressData, VideoRef} from 'react-native-video';
import {MediaPlayerHandle, MediaProgress, PlayableMedia} from './PlayableMedia';
import {
  DEFAULT_EVENT_PLAYBACK_SPEED,
  validateEventPlaybackSpeed,
} from '../../helpers/playbackSpeed';

const MAX_PLAYBACK_DURATION_SECONDS = 7 * 24 * 60 * 60;

const validDuration = (duration: number) =>
  Number.isFinite(duration) &&
  duration >= 0 &&
  duration <= MAX_PLAYBACK_DURATION_SECONDS
    ? duration
    : undefined;

const validCurrentTime = (currentTime: number) =>
  Number.isFinite(currentTime) && currentTime >= 0 ? currentTime : 0;

interface Media3MediaPlayerProps {
  media: PlayableMedia;
  paused: boolean;
  controls?: boolean;
  initialPosition?: number;
  style: StyleProp<ViewStyle>;
  onProgress: (progress: MediaProgress) => void;
  onEnd: () => void;
  onError: () => void;
  onPrepared?: () => void;
  onFirstFrame?: () => void;
  muted?: boolean;
  playbackRate?: number;
  rate?: number;
}

const Media3MediaPlayerComponent = (
  {
    media,
    paused,
    controls = false,
    initialPosition = 0,
    style,
    onProgress,
    onEnd,
    onError,
    onPrepared,
    onFirstFrame,
    muted = false,
    playbackRate = DEFAULT_EVENT_PLAYBACK_SPEED,
    rate,
  }: Media3MediaPlayerProps,
  ref: ForwardedRef<MediaPlayerHandle>,
) => {
  const player = useRef<VideoRef>(null);
  const duration = useRef(0);
  const lastPosition = useRef(0);

  useEffect(() => {
    duration.current = 0;
    lastPosition.current = 0;
  }, [media.uri]);

  useImperativeHandle(ref, () => ({
    seek: positionSeconds => {
      player.current?.seek(positionSeconds);
    },
    resume: () => {
      player.current?.resume();
    },
  }));

  const onLoad = (event: OnLoadData) => {
    duration.current = validDuration(event.duration) ?? 0;
    const loadedTime = validCurrentTime(event.currentTime);
    const position = Math.min(
      Math.max(lastPosition.current, validCurrentTime(initialPosition)),
      duration.current || Number.POSITIVE_INFINITY,
    );
    const restoringPosition = position > loadedTime + 0.5;
    if (restoringPosition) {
      player.current?.seek(position);
      lastPosition.current = position;
    } else {
      lastPosition.current = loadedTime;
    }
    if (restoringPosition && !paused) {
      player.current?.resume();
    }
    onProgress({
      currentTime: restoringPosition ? position : loadedTime,
      duration: duration.current,
    });
    onPrepared?.();
  };

  const onPlaybackProgress = (event: OnProgressData) => {
    const seekableDuration = validDuration(event.seekableDuration);
    if (seekableDuration !== undefined) {
      duration.current = seekableDuration;
    }

    const currentTime = Math.min(
      validCurrentTime(event.currentTime),
      duration.current || validCurrentTime(event.currentTime),
    );
    lastPosition.current = currentTime;
    onProgress({
      currentTime,
      duration: duration.current,
    });
  };

  const sourceType =
    media.mimeType === 'application/x-mpegURL'
      ? 'm3u8'
      : media.mimeType === 'video/mp4'
      ? 'mp4'
      : media.mimeType === 'application/x-rtsp'
      ? 'rtsp'
      : undefined;
  const validatedPlaybackRate =
    validateEventPlaybackSpeed(rate ?? playbackRate) ??
    DEFAULT_EVENT_PLAYBACK_SPEED;

  return (
    <Video
      ref={player}
      source={{
        uri: media.uri,
        ...(sourceType ? {type: sourceType} : {}),
      }}
      paused={paused}
      style={style}
      resizeMode="contain"
      controls={controls}
      muted={muted}
      playInBackground={false}
      playWhenInactive={false}
      // react-native-video's Media3 implementation uses pitch=1f with rate,
      // keeping speech and other audio at its original pitch.
      rate={validatedPlaybackRate}
      minLoadRetryCount={media.mode === 'direct' ? 0 : undefined}
      progressUpdateInterval={250}
      onLoad={onLoad}
      onReadyForDisplay={onFirstFrame}
      onProgress={onPlaybackProgress}
      onEnd={onEnd}
      onError={onError}
    />
  );
};

export const Media3MediaPlayer = forwardRef<
  MediaPlayerHandle,
  Media3MediaPlayerProps
>(Media3MediaPlayerComponent);
