import React, {createRef} from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {Media3MediaPlayer} from '../../../components/media/Media3MediaPlayer';
import type {
  MediaPlayerHandle,
  PlayableMedia,
} from '../../../components/media/PlayableMedia';

const mockSeek = jest.fn();
const mockResume = jest.fn();

jest.mock(
  'react-native-video',
  () => {
    const ReactModule = require('react');
    const {View} = require('react-native');

    const Video = ReactModule.forwardRef(
      (
        props: Record<string, unknown>,
        ref: React.Ref<{seek: typeof mockSeek; resume: typeof mockResume}>,
      ) => {
        ReactModule.useImperativeHandle(ref, () => ({
          seek: mockSeek,
          resume: mockResume,
        }));

        return ReactModule.createElement(View, {
          ...props,
          testID: 'media3-video',
        });
      },
    );
    return {
      __esModule: true,
      default: Video,
      ViewType: {TEXTURE: 0},
    };
  },
);

const makeMedia = (overrides: Partial<PlayableMedia> = {}): PlayableMedia => ({
  uri: 'file:///data/user/0/com.frigate.viewer/files/clip.mp4',
  mimeType: 'video/mp4',
  mode: 'local',
  ...overrides,
});

const renderPlayer = (
  props: Partial<React.ComponentProps<typeof Media3MediaPlayer>> = {},
) =>
  render(
    <Media3MediaPlayer
      media={makeMedia()}
      paused={false}
      style={{}}
      onProgress={jest.fn()}
      onEnd={jest.fn()}
      onError={jest.fn()}
      {...props}
    />,
  );

describe('Media3MediaPlayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps local media and enables native video controls', () => {
    const media = makeMedia();
    const {getByTestId} = renderPlayer({media, controls: true});
    const video = getByTestId('media3-video');

    expect(video.props.source).toEqual({
      uri: media.uri,
      type: 'mp4',
    });
    expect(video.props.controls).toBe(true);
    expect(video.props.playInBackground).toBe(false);
    expect(video.props.playWhenInactive).toBe(false);
  });

  it('passes validated event speed to Media3 while preserving audio pitch', () => {
    const {getByTestId, rerender} = renderPlayer({playbackRate: 1.5});
    expect(getByTestId('media3-video').props.rate).toBe(1.5);

    rerender(
      <Media3MediaPlayer
        media={makeMedia()}
        paused={false}
        playbackRate={1.1}
        style={{}}
        onProgress={jest.fn()}
        onEnd={jest.fn()}
        onError={jest.fn()}
      />,
    );
    expect(getByTestId('media3-video').props.rate).toBe(1);
  });

  it('uses the HLS extension and disables native disk retries for protected media', () => {
    const media = makeMedia({
      uri: 'frigate-media://0123456789abcdef0123456789abcdef/vod/event/e/master.m3u8',
      mimeType: 'application/x-mpegURL',
      mode: 'direct',
    });
    const {getByTestId} = renderPlayer({media});
    const video = getByTestId('media3-video');

    expect(video.props.source).toEqual({
      uri: media.uri,
      type: 'm3u8',
    });
    expect(video.props.minLoadRetryCount).toBe(0);
    expect(video.props.viewType).toBe(0);
  });

  it('selects the Media3 RTSP extension for opaque local handles', () => {
    const media = makeMedia({
      uri: 'frigate-media://0123456789abcdef0123456789abcdef/rtsp/handle',
      mimeType: 'application/x-rtsp',
      mode: 'direct',
    });
    const {getByTestId} = renderPlayer({media});
    expect(getByTestId('media3-video').props.source).toEqual({
      uri: media.uri,
      type: 'rtsp',
    });
    expect(getByTestId('media3-video').props.minLoadRetryCount).toBe(0);
  });

  it('forwards the paused prop when it changes', () => {
    const {getByTestId, rerender} = renderPlayer({paused: true});

    expect(getByTestId('media3-video').props.paused).toBe(true);

    rerender(
      <Media3MediaPlayer
        media={makeMedia()}
        paused={false}
        style={{}}
        onProgress={jest.fn()}
        onEnd={jest.fn()}
        onError={jest.fn()}
      />,
    );

    expect(getByTestId('media3-video').props.paused).toBe(false);
  });

  it('forwards muted state to the native player', () => {
    const {getByTestId, rerender} = renderPlayer({muted: true});
    expect(getByTestId('media3-video').props.muted).toBe(true);

    rerender(
      <Media3MediaPlayer
        media={makeMedia()}
        paused={false}
        muted={false}
        style={{}}
        onProgress={jest.fn()}
        onEnd={jest.fn()}
        onError={jest.fn()}
      />,
    );
    expect(getByTestId('media3-video').props.muted).toBe(false);
  });

  it('reports loaded duration and updates it from seekable progress', () => {
    const onProgress = jest.fn();
    const {getByTestId} = renderPlayer({onProgress});
    const video = getByTestId('media3-video');

    fireEvent(video, 'onLoad', {currentTime: 4, duration: 120});
    expect(onProgress).toHaveBeenLastCalledWith({
      currentTime: 4,
      duration: 120,
    });

    fireEvent(video, 'onProgress', {
      currentTime: 130,
      seekableDuration: 125,
    });
    expect(onProgress).toHaveBeenLastCalledWith({
      currentTime: 125,
      duration: 125,
    });
  });

  it('restores the last position when Media3 reloads the same media', () => {
    const onProgress = jest.fn();
    const {getByTestId} = renderPlayer({onProgress});
    const video = getByTestId('media3-video');

    fireEvent(video, 'onLoad', {currentTime: 0, duration: 38});
    fireEvent(video, 'onProgress', {
      currentTime: 17,
      seekableDuration: 38,
    });
    fireEvent(video, 'onLoad', {currentTime: 0, duration: 38});

    expect(mockSeek).toHaveBeenLastCalledWith(17);
    expect(mockResume).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenLastCalledWith({
      currentTime: 17,
      duration: 38,
    });
  });

  it('does not resume a paused player while restoring its position', () => {
    const {getByTestId} = renderPlayer({paused: true});
    const video = getByTestId('media3-video');

    fireEvent(video, 'onLoad', {currentTime: 0, duration: 38});
    fireEvent(video, 'onProgress', {
      currentTime: 17,
      seekableDuration: 38,
    });
    fireEvent(video, 'onLoad', {currentTime: 0, duration: 38});

    expect(mockSeek).toHaveBeenLastCalledWith(17);
    expect(mockResume).not.toHaveBeenCalled();
  });

  it('seeks to a saved position when a new Media3 instance loads', () => {
    const {getByTestId} = renderPlayer({
      initialPosition: 17,
    });
    const video = getByTestId('media3-video');

    fireEvent(video, 'onLoad', {currentTime: 0, duration: 38});

    expect(mockSeek).toHaveBeenLastCalledWith(17);
    expect(mockResume).toHaveBeenCalledTimes(1);
  });

  it('keeps duration unavailable when native duration values are invalid', () => {
    const onProgress = jest.fn();
    const {getByTestId} = renderPlayer({onProgress});
    const video = getByTestId('media3-video');

    fireEvent(video, 'onLoad', {
      currentTime: -5,
      duration: Number.NaN,
    });
    expect(onProgress).toHaveBeenLastCalledWith({
      currentTime: 0,
      duration: 0,
    });

    fireEvent(video, 'onProgress', {
      currentTime: 10,
      seekableDuration: -9223372036854.775,
    });
    expect(onProgress).toHaveBeenLastCalledWith({
      currentTime: 10,
      duration: 0,
    });
  });

  it('does not replace a known duration with an unavailable progress duration', () => {
    const onProgress = jest.fn();
    const {getByTestId} = renderPlayer({onProgress});
    const video = getByTestId('media3-video');

    fireEvent(video, 'onLoad', {currentTime: 2, duration: 90});
    fireEvent(video, 'onProgress', {
      currentTime: 100,
      seekableDuration: Number.POSITIVE_INFINITY,
    });

    expect(onProgress).toHaveBeenLastCalledWith({
      currentTime: 90,
      duration: 90,
    });
  });

  it('forwards MediaPlayerHandle seek and resume calls to the native player', () => {
    const player = createRef<MediaPlayerHandle>();
    renderPlayer({ref: player});

    player.current?.seek(12.5);
    player.current?.resume();

    expect(mockSeek).toHaveBeenCalledWith(12.5);
    expect(mockResume).toHaveBeenCalledTimes(1);
  });

  it('forwards end and error callbacks', () => {
    const onEnd = jest.fn();
    const onError = jest.fn();
    const {getByTestId} = renderPlayer({onEnd, onError});
    const video = getByTestId('media3-video');

    fireEvent(video, 'onEnd');
    fireEvent(video, 'onError');

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
