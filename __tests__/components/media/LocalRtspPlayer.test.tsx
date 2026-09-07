import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {LocalRtspPlayer} from '../../../components/media/LocalRtspPlayer';

jest.mock('../../../components/media/Media3MediaPlayer', () => {
  const ReactModule = require('react');
  const {View} = require('react-native');
  return {
    ['Media3MediaPlayer']: (props: Record<string, unknown>) =>
      ReactModule.createElement(View, {
        ...props,
        testID: 'local-rtsp-video',
      }),
  };
});

const media = {
  uri: 'frigate-media://0123456789abcdef0123456789abcdef/rtsp/0123456789abcdef0123456789abcdef',
  mimeType: 'application/x-rtsp' as const,
  mode: 'direct' as const,
};

const mockReleaseProtectedMediaUri = jest.fn();
jest.mock('../../../helpers/protectedMedia', () => ({
  releaseProtectedMediaUri: (...args: unknown[]) =>
    mockReleaseProtectedMediaUri(...args),
}));

describe('LocalRtspPlayer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockReleaseProtectedMediaUri.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts muted and reports the bounded first-frame timeout', () => {
    const onError = jest.fn();
    const {getByTestId} = render(
      <LocalRtspPlayer
        media={media}
        active
        muted
        style={{}}
        onPlaying={jest.fn()}
        onError={onError}
      />,
    );
    expect(getByTestId('local-rtsp-video').props.muted).toBe(true);
    jest.advanceTimersByTime(15_000);
    expect(onError).toHaveBeenCalledWith('first-frame-timeout');
  });

  it('uses one overall 15-second deadline from transport start', () => {
    const onError = jest.fn();
    const {getByTestId, rerender} = render(
      <LocalRtspPlayer
        media={media}
        active
        muted
        style={{}}
        onPlaying={jest.fn()}
        onError={() => onError('first-frame-timeout')}
      />,
    );

    // Give Media3 its short UDP-to-TCP fallback window. No preparation event
    // may extend the outer deadline.
    jest.advanceTimersByTime(5_000);
    rerender(
      <LocalRtspPlayer
        media={media}
        active
        muted
        style={{}}
        onPlaying={jest.fn()}
        onError={() => onError('first-frame-timeout')}
      />,
    );
    jest.advanceTimersByTime(9_999);
    expect(onError).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('first-frame-timeout');

    // Native UDP/TCP fallback may still report a late callback, but cannot
    // create a second deadline or callback.
    fireEvent(getByTestId('local-rtsp-video'), 'onError');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('unmounts the native player when playback is inactive', () => {
    const {queryByTestId, rerender} = render(
      <LocalRtspPlayer
        media={media}
        active
        muted
        style={{}}
        onPlaying={jest.fn()}
        onError={jest.fn()}
      />,
    );
    rerender(
      <LocalRtspPlayer
        media={media}
        active={false}
        muted
        style={{}}
        onPlaying={jest.fn()}
        onError={jest.fn()}
      />,
    );
    expect(queryByTestId('local-rtsp-video')).toBeNull();
  });

  it('passes controlled mute state through to the native player', () => {
    const {getByTestId, rerender} = render(
      <LocalRtspPlayer
        media={media}
        active
        muted
        style={{}}
        onPlaying={jest.fn()}
        onError={jest.fn()}
      />,
    );
    expect(getByTestId('local-rtsp-video').props.muted).toBe(true);
    rerender(
      <LocalRtspPlayer
        media={media}
        active
        muted={false}
        style={{}}
        onPlaying={jest.fn()}
        onError={jest.fn()}
      />,
    );
    expect(getByTestId('local-rtsp-video').props.muted).toBe(false);
  });

  it('releases an unconsumed opaque URI exactly once during teardown', () => {
    const {rerender} = render(
      <LocalRtspPlayer
        media={media}
        active
        muted
        style={{}}
        onPlaying={jest.fn()}
        onError={jest.fn()}
      />,
    );
    rerender(
      <LocalRtspPlayer
        media={media}
        active={false}
        muted
        style={{}}
        onPlaying={jest.fn()}
        onError={jest.fn()}
      />,
    );
    expect(mockReleaseProtectedMediaUri).toHaveBeenCalledTimes(1);
    expect(mockReleaseProtectedMediaUri).toHaveBeenCalledWith(media.uri);
  });

  it('does not release a URI after native preparation consumes it', () => {
    const {getByTestId, rerender} = render(
      <LocalRtspPlayer
        media={media}
        active
        muted
        style={{}}
        onPlaying={jest.fn()}
        onError={jest.fn()}
      />,
    );
    fireEvent(getByTestId('local-rtsp-video'), 'onPrepared');
    rerender(
      <LocalRtspPlayer
        media={media}
        active={false}
        muted
        style={{}}
        onPlaying={jest.fn()}
        onError={jest.fn()}
      />,
    );
    expect(mockReleaseProtectedMediaUri).not.toHaveBeenCalled();
  });

  it('releases an unconsumed URI on native failure without double release', () => {
    const {getByTestId, rerender} = render(
      <LocalRtspPlayer
        media={media}
        active
        muted
        style={{}}
        onPlaying={jest.fn()}
        onError={jest.fn()}
      />,
    );
    fireEvent(getByTestId('local-rtsp-video'), 'onError');
    rerender(
      <LocalRtspPlayer
        media={media}
        active={false}
        muted
        style={{}}
        onPlaying={jest.fn()}
        onError={jest.fn()}
      />,
    );
    expect(mockReleaseProtectedMediaUri).toHaveBeenCalledTimes(1);
  });

  it('requires positive decoded dimensions before handing off', () => {
    const onPlaying = jest.fn();
    const {getByTestId} = render(
      <LocalRtspPlayer
        media={media}
        active
        muted
        style={{}}
        onPlaying={onPlaying}
        onError={jest.fn()}
      />,
    );
    const player = getByTestId('local-rtsp-video');
    fireEvent(player, 'onFirstFrame', {
      nativeEvent: {width: 0, height: 360},
    });
    expect(onPlaying).not.toHaveBeenCalled();
    fireEvent(player, 'onFirstFrame', {
      nativeEvent: {width: 640, height: 360},
    });
    expect(onPlaying).toHaveBeenCalledTimes(1);
  });
});
