import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';

interface MockTrack {
  id?: string;
  kind: 'audio' | 'video';
  enabled: boolean;
  muted?: boolean;
  readyState?: 'live' | 'ended';
  onended?: () => void;
  onmute?: () => void;
  onunmute?: () => void;
  stop: jest.Mock;
}

class MockMediaStream {
  private tracks: MockTrack[];
  onaddtrack?: (event: {track: MockTrack}) => void;
  onremovetrack?: (event: {track: MockTrack}) => void;

  constructor(tracks: MockTrack[] = []) {
    this.tracks = tracks;
  }

  addTrack(track: MockTrack) {
    if (!this.tracks.includes(track)) {
      this.tracks.push(track);
      this.onaddtrack?.({track});
    }
  }

  removeTrack(track: MockTrack) {
    this.tracks = this.tracks.filter(existing => existing !== track);
    this.onremovetrack?.({track});
  }

  getTracks() {
    return [...this.tracks];
  }

  getAudioTracks() {
    return this.tracks.filter(track => track.kind === 'audio');
  }

  getVideoTracks() {
    return this.tracks.filter(track => track.kind === 'video');
  }

  toURL() {
    return 'mock-stream';
  }
}

class MockPeerConnection {
  static latest: MockPeerConnection;
  connectionState = 'new';
  localDescription?: {type: string; sdp: string};
  remoteDescription?: {type: string; sdp: string};
  ontrack?: (event: {
    streams?: MockMediaStream[];
    track?: MockTrack;
  }) => void;
  onicecandidate?: (event: {candidate: null}) => void;
  onconnectionstatechange?: () => void;
  receivers: Array<{track: MockTrack}>;
  stats = new Map<string, Record<string, unknown>>();
  statsPromise?: Promise<Map<string, Record<string, unknown>>>;
  getStatsCalls = 0;

  constructor() {
    MockPeerConnection.latest = this;
    this.receivers = [];
  }

  addTransceiver() {
    return undefined;
  }

  createOffer() {
    return Promise.resolve({type: 'offer', sdp: 'offer'});
  }

  setLocalDescription(description: {type: string; sdp: string}) {
    this.localDescription = description;
    return Promise.resolve();
  }

  setRemoteDescription() {
    this.remoteDescription = {type: 'answer', sdp: 'answer'};
    return Promise.resolve();
  }

  getReceivers() {
    return this.receivers;
  }

  getStats() {
    this.getStatsCalls += 1;
    return this.statsPromise || Promise.resolve(this.stats);
  }

  addIceCandidate() {
    return Promise.resolve();
  }

  close() {
    return undefined;
  }
}

const mockOnMessage = jest.fn();
const mockAcquireProtectedAudio = jest.fn();
const mockReleaseProtectedAudio = jest.fn();
const mockAddFocusLostListener = jest.fn();
const mockSocket = {
  ready: Promise.resolve(),
  send: jest.fn((_message: string) => Promise.resolve()),
  close: jest.fn(),
};
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>(nextResolve => {
    resolve = nextResolve;
  });
  return {promise, resolve};
};
const flushAsyncWork = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
jest.mock('react-native-webrtc', () => {
  const ReactModule = require('react');
  const {View} = require('react-native');
  return {
    MediaStream: MockMediaStream,
    RTCIceCandidate: class {
      candidate: string;
      constructor(value: {candidate: string}) {
        this.candidate = value.candidate;
      }
    },
    RTCPeerConnection: MockPeerConnection,
    RTCSessionDescription: class {
      type: string;
      sdp: string;
      constructor(value: {type: string; sdp: string}) {
        this.type = value.type;
        this.sdp = value.sdp;
      }
    },
    ['RTCView']: (props: Record<string, unknown>) =>
      ReactModule.createElement(View, {...props, testID: 'protected-rtc-view'}),
  };
});

jest.mock('../../../helpers/protectedLive', () => {
  const actual = jest.requireActual('../../../helpers/protectedLive');
  return {
    ...actual,
    openProtectedLiveSocket: jest.fn(async (_server, _stream, callbacks) => {
      mockOnMessage.mockImplementation(callbacks.onMessage);
      return mockSocket;
    }),
  };
});

jest.mock('../../../helpers/protectedAudio', () => ({
  acquireProtectedAudio: (...args: unknown[]) =>
    mockAcquireProtectedAudio(...args),
  addProtectedAudioFocusLostListener: (...args: unknown[]) =>
    mockAddFocusLostListener(...args),
  releaseProtectedAudio: (token: string) =>
    mockReleaseProtectedAudio(token) || Promise.resolve(),
}));

jest.mock('../../../helpers/secureLogger', () => ({
  SecureLogger: {logError: jest.fn(), logInfo: jest.fn()},
}));

const {ProtectedWebRTCPlayer, WEBRTC_FIRST_FRAME_TIMEOUT_MS, AUDIO_ACTIVATION_TIMEOUT_MS} =
  require('../../../components/media/ProtectedWebRTCPlayer') as typeof import('../../../components/media/ProtectedWebRTCPlayer');

const renderAudioReadyPlayer = async () => {
  const props = {
    server: {} as never, streamName: 'front', style: {},
    onPlaying: jest.fn(), onError: jest.fn(),
    onAudioActivationChange: jest.fn(), onAudioStatusChange: jest.fn(),
  };
  const view = render(<ProtectedWebRTCPlayer {...props} muted />);
  const audio: MockTrack = {id: 'audio', kind: 'audio', enabled: false, readyState: 'live', stop: jest.fn()};
  const video: MockTrack = {id: 'video', kind: 'video', enabled: true, readyState: 'live', stop: jest.fn()};
  const stream = new MockMediaStream([audio, video]);
  await act(async () => {
    await flushAsyncWork();
    MockPeerConnection.latest.receivers = [{track: audio}, {track: video}];
    mockOnMessage(JSON.stringify({type: 'webrtc/answer', value: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n'}));
    MockPeerConnection.latest.ontrack?.({streams: [stream], track: video});
    await flushAsyncWork();
  });
  fireEvent(view.getByTestId('protected-rtc-view'), 'onDimensionsChange', {nativeEvent: {width: 640, height: 360}});
  return {...props, view, audio, stream, setMuted: (muted: boolean) => view.rerender(<ProtectedWebRTCPlayer {...props} muted={muted} />)};
};

describe('ProtectedWebRTCPlayer', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnMessage.mockReset();
    mockSocket.send.mockClear();
    mockSocket.send.mockImplementation(() => {
      return Promise.resolve();
    });
    mockSocket.close.mockClear();
    mockAcquireProtectedAudio.mockReset();
    mockAcquireProtectedAudio.mockImplementation(() =>
      Promise.resolve('owner-token-123456'),
    );
    mockReleaseProtectedAudio.mockClear();
    mockAddFocusLostListener.mockReset();
    mockAddFocusLostListener.mockReturnValue({remove: jest.fn()});
  });

  it.each(['focus-denied', 'native'] as const)('reports %s independently of initial false and retries only on new intent', async reason => {
    if (reason === 'focus-denied') {
      mockAcquireProtectedAudio.mockResolvedValueOnce(null);
    } else {
      mockAcquireProtectedAudio.mockRejectedValueOnce(new Error('native failure'));
    }
    const player = await renderAudioReadyPlayer();
    expect(mockAcquireProtectedAudio).not.toHaveBeenCalled();
    player.setMuted(false);
    expect(player.onAudioStatusChange).toHaveBeenLastCalledWith({state: 'pending'});
    await act(flushAsyncWork);
    expect(player.onAudioStatusChange).toHaveBeenLastCalledWith({state: 'failed', reason});
    expect(player.onAudioActivationChange.mock.calls).toEqual([[false]]);
    expect(player.audio.enabled).toBe(false);
    await act(async () => { player.audio.onmute?.(); await flushAsyncWork(); });
    expect(mockAcquireProtectedAudio).toHaveBeenCalledTimes(1);
    player.setMuted(true);
    player.setMuted(false);
    await act(flushAsyncWork);
    expect(player.audio.enabled).toBe(true);
    expect(player.onAudioStatusChange).toHaveBeenLastCalledWith({state: 'active'});
    player.view.unmount();
  });

  it('bounds pending at five seconds, serializes retry and releases a late token', async () => {
    jest.useFakeTimers();
    const acquire = deferred<string | null>();
    mockAcquireProtectedAudio.mockReturnValueOnce(acquire.promise);
    const player = await renderAudioReadyPlayer();
    player.setMuted(false);
    await act(async () => { jest.advanceTimersByTime(AUDIO_ACTIVATION_TIMEOUT_MS - 1); await flushAsyncWork(); });
    expect(player.onAudioStatusChange).toHaveBeenLastCalledWith({state: 'pending'});
    expect(mockAcquireProtectedAudio).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(1); await flushAsyncWork(); });
    expect(player.onAudioStatusChange).toHaveBeenLastCalledWith({state: 'failed', reason: 'timeout'});
    expect(player.audio.enabled).toBe(false);
    player.setMuted(true);
    player.setMuted(false);
    expect(mockAcquireProtectedAudio).toHaveBeenCalledTimes(1);
    expect(player.onAudioStatusChange).toHaveBeenLastCalledWith({state: 'pending'});
    await act(async () => { acquire.resolve('late-owner-token'); await flushAsyncWork(); });
    expect(mockReleaseProtectedAudio).toHaveBeenCalledWith('late-owner-token');
    expect(mockAcquireProtectedAudio).toHaveBeenCalledTimes(2);
    expect(player.audio.enabled).toBe(true);
    expect(player.onAudioStatusChange).toHaveBeenLastCalledWith({state: 'active'});
    player.view.unmount();
  });

  it('cancels pending without spawning concurrent focus, then ignores its old deadline', async () => {
    jest.useFakeTimers();
    const acquire = deferred<string | null>();
    mockAcquireProtectedAudio.mockReturnValueOnce(acquire.promise);
    const player = await renderAudioReadyPlayer();
    player.setMuted(false);
    player.setMuted(true);
    expect(player.onAudioStatusChange).toHaveBeenLastCalledWith({state: 'inactive'});
    player.setMuted(false);
    expect(mockAcquireProtectedAudio).toHaveBeenCalledTimes(1);
    await act(async () => { acquire.resolve('cancelled-owner-token'); await flushAsyncWork(); });
    expect(mockReleaseProtectedAudio).toHaveBeenCalledWith('cancelled-owner-token');
    expect(mockAcquireProtectedAudio).toHaveBeenCalledTimes(2);
    await act(async () => { jest.advanceTimersByTime(AUDIO_ACTIVATION_TIMEOUT_MS); await flushAsyncWork(); });
    expect(player.onAudioStatusChange).toHaveBeenLastCalledWith({state: 'active'});
    expect(player.audio.enabled).toBe(true);
    player.view.unmount();
  });

  it('does not report an old timeout or completion into a remounted connection', async () => {
    jest.useFakeTimers();
    const acquire = deferred<string | null>();
    mockAcquireProtectedAudio.mockReturnValueOnce(acquire.promise);
    const player = await renderAudioReadyPlayer();
    player.setMuted(false);
    player.view.rerender(<ProtectedWebRTCPlayer server={player.server} streamName="next" muted style={{}} onPlaying={player.onPlaying} onError={player.onError} onAudioStatusChange={player.onAudioStatusChange} />);
    player.onAudioStatusChange.mockClear();
    await act(async () => {
      jest.advanceTimersByTime(AUDIO_ACTIVATION_TIMEOUT_MS);
      acquire.resolve('old-connection-token');
      await flushAsyncWork();
    });
    expect(player.onAudioStatusChange).not.toHaveBeenCalled();
    expect(mockReleaseProtectedAudio).toHaveBeenCalledWith('old-connection-token');
    player.view.unmount();
  });

  it('reuses a valid routed lease on duplicate sync but reasserts routing for a new track', async () => {
    jest.useFakeTimers();
    const player = await renderAudioReadyPlayer();
    player.setMuted(false);
    await act(flushAsyncWork);
    await act(async () => {
      player.audio.onmute?.();
      player.audio.onunmute?.();
      jest.advanceTimersByTime(1600);
      await flushAsyncWork();
    });
    expect(mockAcquireProtectedAudio).toHaveBeenCalledTimes(1);
    const replacement: MockTrack = {id: 'replacement', kind: 'audio', enabled: false, readyState: 'live', stop: jest.fn()};
    await act(async () => { player.stream.addTrack(replacement); await flushAsyncWork(); });
    expect(mockAcquireProtectedAudio).toHaveBeenCalledTimes(2);
    expect(mockAcquireProtectedAudio).toHaveBeenLastCalledWith('owner-token-123456');
    expect(replacement.enabled).toBe(true);
    expect(player.audio.enabled).toBe(true);
    player.view.unmount();
  });

  it('waits for a track event before deciding an accepted video answer failed', async () => {
    const onError = jest.fn();
    const onPlaying = jest.fn();
    const onAudioAvailabilityChange = jest.fn();
    const player = render(
      <ProtectedWebRTCPlayer
        server={{} as never}
        streamName="front"
        muted
        style={{}}
        onPlaying={onPlaying}
        onError={onError}
        onAudioAvailabilityChange={onAudioAvailabilityChange}
      />,
    );
    const {queryByTestId, getByTestId} = player;

    await act(async () => {
      await flushAsyncWork();
    });
    expect(mockSocket.send).toHaveBeenCalledWith(
      expect.stringContaining('"webrtc/offer"'),
    );
    await act(async () => {
      mockOnMessage(
        JSON.stringify({
          type: 'webrtc/answer',
          value: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n',
        }),
      );
    });
    await act(async () => {
      await flushAsyncWork();
    });
    expect(MockPeerConnection.latest.remoteDescription).toBeDefined();
    expect(onAudioAvailabilityChange).toHaveBeenCalledWith(false);

    expect(onError).not.toHaveBeenCalled();
    expect(queryByTestId('protected-rtc-view')).toBeNull();

    const audioTrack: MockTrack = {
      kind: 'audio',
      enabled: true,
      stop: jest.fn(),
    };
    const stream = new MockMediaStream([audioTrack]);
    await act(async () => {
      MockPeerConnection.latest.ontrack?.({
        streams: [stream],
        track: audioTrack,
      });
    });
    expect(queryByTestId('protected-rtc-view')).toBeNull();

    const videoTrack: MockTrack = {
      kind: 'video',
      enabled: true,
      stop: jest.fn(),
    };
    const videoStream = new MockMediaStream([videoTrack]);
    await act(async () => {
      MockPeerConnection.latest.ontrack?.({
        streams: [videoStream],
        track: videoTrack,
      });
    });

    const view = getByTestId('protected-rtc-view');
    fireEvent(view, 'onDimensionsChange', {
      nativeEvent: {width: 640, height: 360},
    });
    expect(onPlaying).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    player.unmount();
  });

  it('uses receiver tracks when the native peer omits the video track event', async () => {
    const onError = jest.fn();
    const onPlaying = jest.fn();
    const {getByTestId} = render(
      <ProtectedWebRTCPlayer
        server={{} as never}
        streamName="front"
        muted
        style={{}}
        onPlaying={onPlaying}
        onError={onError}
      />,
    );
    await waitFor(() => {
      expect(mockSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"webrtc/offer"'),
      );
    });
    const videoTrack: MockTrack = {
      id: 'receiver-video',
      kind: 'video',
      enabled: true,
      stop: jest.fn(),
    };
    MockPeerConnection.latest.receivers = [{track: videoTrack}];
    await act(async () => {
      mockOnMessage(
        JSON.stringify({
          type: 'webrtc/answer',
          value: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n',
        }),
      );
    });
    await waitFor(() =>
      expect(MockPeerConnection.latest.remoteDescription).toBeDefined(),
    );

    const videoView = getByTestId('protected-rtc-view');
    fireEvent(videoView, 'onDimensionsChange', {
      nativeEvent: {width: 640, height: 360},
    });
    expect(onPlaying).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('accepts initially muted remote audio when receiver RTP is present', async () => {
    const audioTrack: MockTrack = {
      kind: 'audio',
      enabled: true,
      muted: true,
      readyState: 'live',
      stop: jest.fn(),
    };
    const videoTrack: MockTrack = {
      kind: 'video',
      enabled: true,
      readyState: 'live',
      stop: jest.fn(),
    };
    const onAudioAvailabilityChange = jest.fn();
    const onAudioActivationChange = jest.fn();
    const onPlaying = jest.fn();
    const onError = jest.fn();
    const server = {} as never;
    const view = render(
      <ProtectedWebRTCPlayer
        server={server}
        streamName="front"
        muted
        style={{}}
        onPlaying={onPlaying}
        onError={onError}
        onAudioAvailabilityChange={onAudioAvailabilityChange}
        onAudioActivationChange={onAudioActivationChange}
      />,
    );
    MockPeerConnection.latest.receivers = [
      {track: audioTrack},
      {track: videoTrack},
    ];
    MockPeerConnection.latest.stats.set('audio', {
      type: 'inbound-rtp',
      kind: 'audio',
      packetsReceived: 4,
      bytesReceived: 160,
    });
    await act(async () => {
      mockOnMessage(
        JSON.stringify({
          type: 'webrtc/answer',
          value:
            'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n',
        }),
      );
      await flushAsyncWork();
    });
    expect(onAudioAvailabilityChange).toHaveBeenLastCalledWith(true);
    expect(audioTrack.enabled).toBe(false);
    expect(view.queryByTestId('protected-rtc-view')).toBeTruthy();

    view.rerender(
      <ProtectedWebRTCPlayer
        server={server}
        streamName="front"
        muted={false}
        style={{}}
        onPlaying={onPlaying}
        onError={onError}
        onAudioAvailabilityChange={onAudioAvailabilityChange}
        onAudioActivationChange={onAudioActivationChange}
      />,
    );
    await waitFor(() => expect(view.queryByTestId('protected-rtc-view')).toBeTruthy());
    fireEvent(view.getByTestId('protected-rtc-view'), 'onDimensionsChange', {
      nativeEvent: {width: 640, height: 360},
    });
    await waitFor(() => expect(audioTrack.enabled).toBe(true));
    expect(onAudioActivationChange).toHaveBeenLastCalledWith(true);
    view.unmount();
  });

  it('handles ontrack audio when the event has no associated streams', async () => {
    const audioTrack: MockTrack = {
      kind: 'audio',
      enabled: true,
      readyState: 'live',
      stop: jest.fn(),
    };
    const videoTrack: MockTrack = {
      kind: 'video',
      enabled: true,
      readyState: 'live',
      stop: jest.fn(),
    };
    const onAudioAvailabilityChange = jest.fn();
    const view = render(
      <ProtectedWebRTCPlayer
        server={{} as never}
        streamName="front"
        muted
        style={{}}
        onPlaying={jest.fn()}
        onError={jest.fn()}
        onAudioAvailabilityChange={onAudioAvailabilityChange}
      />,
    );
    MockPeerConnection.latest.receivers = [{track: videoTrack}];
    await act(async () => {
      mockOnMessage(
        JSON.stringify({
          type: 'webrtc/answer',
          value:
            'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n',
        }),
      );
      await flushAsyncWork();
    });
    await act(async () => {
      MockPeerConnection.latest.ontrack?.({
        streams: [],
        track: audioTrack,
      });
      await flushAsyncWork();
    });
    expect(onAudioAvailabilityChange).toHaveBeenLastCalledWith(true);
    await waitFor(() => expect(view.queryByTestId('protected-rtc-view')).toBeTruthy());
    fireEvent(view.getByTestId('protected-rtc-view'), 'onDimensionsChange', {
      nativeEvent: {width: 640, height: 360},
    });
    expect(audioTrack.enabled).toBe(false);
    view.unmount();
  });

  it('finds a late receiver audio track during bounded post-answer checks', async () => {
    jest.useFakeTimers();
    const audioTrack: MockTrack = {
      kind: 'audio',
      enabled: true,
      readyState: 'live',
      stop: jest.fn(),
    };
    const videoTrack: MockTrack = {
      kind: 'video',
      enabled: true,
      readyState: 'live',
      stop: jest.fn(),
    };
    const onAudioAvailabilityChange = jest.fn();
    const view = render(
      <ProtectedWebRTCPlayer
        server={{} as never}
        streamName="front"
        muted
        style={{}}
        onPlaying={jest.fn()}
        onError={jest.fn()}
        onAudioAvailabilityChange={onAudioAvailabilityChange}
      />,
    );
    MockPeerConnection.latest.receivers = [{track: videoTrack}];
    await act(async () => {
      mockOnMessage(
        JSON.stringify({
          type: 'webrtc/answer',
          value:
            'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n',
        }),
      );
      await flushAsyncWork();
    });
    expect(onAudioAvailabilityChange).not.toHaveBeenCalledWith(true);
    MockPeerConnection.latest.receivers = [
      {track: videoTrack},
      {track: audioTrack},
    ];
    await act(async () => {
      jest.advanceTimersByTime(100);
      await flushAsyncWork();
    });
    expect(onAudioAvailabilityChange).toHaveBeenLastCalledWith(true);
    view.unmount();
  });

  it('keeps ended audio unavailable with stale receivers and cumulative stats', async () => {
    jest.useFakeTimers();
    const audioTrack: MockTrack = {
      kind: 'audio',
      enabled: true,
      readyState: 'live',
      stop: jest.fn(),
    };
    const videoTrack: MockTrack = {
      kind: 'video',
      enabled: true,
      readyState: 'live',
      stop: jest.fn(),
    };
    const stream = new MockMediaStream([audioTrack, videoTrack]);
    const onAudioAvailabilityChange = jest.fn();
    const onAudioActivationChange = jest.fn();
    const onPlaying = jest.fn();
    const onError = jest.fn();
    const server = {} as never;
    const view = render(
      <ProtectedWebRTCPlayer
        server={server}
        streamName="front"
        muted
        style={{}}
        onPlaying={onPlaying}
        onError={onError}
        onAudioAvailabilityChange={onAudioAvailabilityChange}
        onAudioActivationChange={onAudioActivationChange}
      />,
    );
    MockPeerConnection.latest.receivers = [
      {track: audioTrack},
      {track: videoTrack},
    ];
    MockPeerConnection.latest.stats.set('audio', {
      type: 'inbound-rtp',
      kind: 'audio',
      packetsReceived: 100,
      bytesReceived: 1_000,
    });
    await act(async () => {
      mockOnMessage(
        JSON.stringify({
          type: 'webrtc/answer',
          value:
            'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n',
        }),
      );
      await flushAsyncWork();
    });
    expect(onAudioAvailabilityChange).toHaveBeenLastCalledWith(true);
    await waitFor(() =>
      expect(view.queryByTestId('protected-rtc-view')).toBeTruthy(),
    );
    await act(async () => {
      MockPeerConnection.latest.ontrack?.({
        streams: [stream],
        track: audioTrack,
      });
      await flushAsyncWork();
    });
    expect(audioTrack.enabled).toBe(false);
    view.rerender(
      <ProtectedWebRTCPlayer
        server={server}
        streamName="front"
        muted={false}
        style={{}}
        onPlaying={onPlaying}
        onError={onError}
        onAudioAvailabilityChange={onAudioAvailabilityChange}
        onAudioActivationChange={onAudioActivationChange}
      />,
    );
    await waitFor(() =>
      expect(view.queryByTestId('protected-rtc-view')).toBeTruthy(),
    );
    fireEvent(view.getByTestId('protected-rtc-view'), 'onDimensionsChange', {
      nativeEvent: {width: 640, height: 360},
    });
    expect(onPlaying).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(mockAcquireProtectedAudio).toHaveBeenCalled(),
    );
    await waitFor(() => expect(audioTrack.enabled).toBe(true));
    const initialAcquireCount = mockAcquireProtectedAudio.mock.calls.length;
    expect(initialAcquireCount).toBeGreaterThan(0);
    expect(onAudioActivationChange).toHaveBeenLastCalledWith(true);

    audioTrack.readyState = 'ended';
    audioTrack.onended?.();
    stream.removeTrack(audioTrack);
    MockPeerConnection.latest.receivers = [
      {track: audioTrack},
      {track: videoTrack},
    ];
    await act(async () => {
      jest.advanceTimersByTime(100);
      await flushAsyncWork();
    });
    expect(onAudioAvailabilityChange).toHaveBeenLastCalledWith(false);
    expect(onAudioAvailabilityChange).not.toHaveBeenLastCalledWith(true);
    expect(onAudioActivationChange).toHaveBeenLastCalledWith(false);
    expect(mockAcquireProtectedAudio).toHaveBeenCalledTimes(initialAcquireCount);
    expect(audioTrack.enabled).toBe(false);
    expect(stream.getAudioTracks()).toEqual([]);
    view.unmount();
  });

  it('does not fail when pending timeout diagnostics finish after the first frame', async () => {
    jest.useFakeTimers();
    const pendingStats = deferred<Map<string, Record<string, unknown>>>();
    const videoTrack: MockTrack = {
      kind: 'video',
      enabled: true,
      readyState: 'live',
      stop: jest.fn(),
    };
    const stream = new MockMediaStream([videoTrack]);
    const onError = jest.fn();
    const view = render(
      <ProtectedWebRTCPlayer
        server={{} as never}
        streamName="front"
        muted
        style={{}}
        onPlaying={jest.fn()}
        onError={onError}
        onAudioAvailabilityChange={jest.fn()}
      />,
    );
    MockPeerConnection.latest.receivers = [{track: videoTrack}];
    MockPeerConnection.latest.statsPromise = pendingStats.promise;
    await act(async () => {
      mockOnMessage(
        JSON.stringify({
          type: 'webrtc/answer',
          value: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n',
        }),
      );
      await flushAsyncWork();
      MockPeerConnection.latest.ontrack?.({
        streams: [stream],
        track: videoTrack,
      });
      await flushAsyncWork();
    });
    expect(view.queryByTestId('protected-rtc-view')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(WEBRTC_FIRST_FRAME_TIMEOUT_MS);
      await flushAsyncWork();
    });
    fireEvent(view.getByTestId('protected-rtc-view'), 'onDimensionsChange', {
      nativeEvent: {width: 640, height: 360},
    });
    pendingStats.resolve(new Map());
    await act(async () => {
      await flushAsyncWork();
    });
    expect(onError).not.toHaveBeenCalled();
    view.unmount();
  });

  it('ignores diagnostics completing from a previous connection generation', async () => {
    const pendingStats = deferred<Map<string, Record<string, unknown>>>();
    const pendingAcquire = deferred<string>();
    mockAcquireProtectedAudio.mockImplementationOnce(() => pendingAcquire.promise);
    const oldOnError = jest.fn();
    const oldOnPlaying = jest.fn();
    const oldOnAudioAvailabilityChange = jest.fn();
    const oldOnAudioActivationChange = jest.fn();
    const oldAudioTrack: MockTrack = {
      kind: 'audio',
      enabled: true,
      readyState: 'live',
      stop: jest.fn(),
    };
    const oldVideoTrack: MockTrack = {
      kind: 'video',
      enabled: true,
      readyState: 'live',
      stop: jest.fn(),
    };
    const oldView = render(
      <ProtectedWebRTCPlayer
        server={{} as never}
        streamName="front"
        muted={false}
        style={{}}
        onPlaying={oldOnPlaying}
        onError={oldOnError}
        onAudioAvailabilityChange={oldOnAudioAvailabilityChange}
        onAudioActivationChange={oldOnAudioActivationChange}
      />,
    );
    const oldPeer = MockPeerConnection.latest;
    oldPeer.receivers = [
      {track: oldAudioTrack},
      {track: oldVideoTrack},
    ];
    oldPeer.statsPromise = pendingStats.promise;
    await act(async () => {
      mockOnMessage(
        JSON.stringify({
          type: 'webrtc/answer',
          value:
            'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n',
        }),
      );
      await flushAsyncWork();
    });
    expect(oldPeer.getStatsCalls).toBeGreaterThan(0);
    fireEvent(oldView.getByTestId('protected-rtc-view'), 'onDimensionsChange', {
      nativeEvent: {width: 640, height: 360},
    });
    expect(mockAcquireProtectedAudio).toHaveBeenCalledTimes(1);
    oldOnAudioAvailabilityChange.mockClear();
    oldOnAudioActivationChange.mockClear();
    mockAcquireProtectedAudio.mockClear();
    oldView.unmount();

    const newOnError = jest.fn();
    const newOnPlaying = jest.fn();
    const newOnAudioAvailabilityChange = jest.fn();
    const newOnAudioActivationChange = jest.fn();
    const newView = render(
      <ProtectedWebRTCPlayer
        server={{} as never}
        streamName="back"
        muted
        style={{}}
        onPlaying={newOnPlaying}
        onError={newOnError}
        onAudioAvailabilityChange={newOnAudioAvailabilityChange}
        onAudioActivationChange={newOnAudioActivationChange}
      />,
    );
    mockAcquireProtectedAudio.mockClear();
    newOnAudioAvailabilityChange.mockClear();
    newOnAudioActivationChange.mockClear();
    pendingStats.resolve(
      new Map([
        [
          'audio',
          {
            type: 'inbound-rtp',
            kind: 'audio',
            packetsReceived: 64,
            bytesReceived: 2_048,
          },
        ],
      ]),
    );
    pendingAcquire.resolve('stale-owner-token');
    await act(async () => {
      await flushAsyncWork();
    });
    expect(oldOnAudioAvailabilityChange).not.toHaveBeenCalledWith(true);
    expect(oldOnAudioActivationChange).not.toHaveBeenCalledWith(true);
    expect(newOnError).not.toHaveBeenCalled();
    expect(newOnAudioAvailabilityChange).not.toHaveBeenCalledWith(true);
    expect(newOnAudioActivationChange).not.toHaveBeenCalledWith(true);
    expect(mockAcquireProtectedAudio).not.toHaveBeenCalled();
    newView.unmount();
  });

  it('keeps audio unavailable when the accepted answer has no audio evidence', async () => {
    const onAudioAvailabilityChange = jest.fn();
    const view = render(
      <ProtectedWebRTCPlayer
        server={{} as never}
        streamName="front"
        muted
        style={{}}
        onPlaying={jest.fn()}
        onError={jest.fn()}
        onAudioAvailabilityChange={onAudioAvailabilityChange}
      />,
    );
    MockPeerConnection.latest.stats.set('audio', {
      type: 'inbound-rtp',
      kind: 'audio',
      packetsReceived: 50,
      bytesReceived: 500,
    });
    await act(async () => {
      mockOnMessage(
        JSON.stringify({
          type: 'webrtc/answer',
          value:
            'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n',
        }),
      );
      await flushAsyncWork();
    });
    expect(onAudioAvailabilityChange).not.toHaveBeenCalledWith(true);
    view.unmount();
  });

  it('keeps remote audio disabled until a native focus grant follows an audio track', async () => {
    const onAudioAvailabilityChange = jest.fn();
    const onAudioActivationChange = jest.fn();
    const onPlaying = jest.fn();
    const onError = jest.fn();
    const server = {} as never;
    const view = render(
      <ProtectedWebRTCPlayer
        server={server}
        streamName="front"
        muted
        style={{}}
        onPlaying={onPlaying}
        onError={onError}
        onAudioAvailabilityChange={onAudioAvailabilityChange}
        onAudioActivationChange={onAudioActivationChange}
      />,
    );

    await waitFor(() => {
      expect(mockSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"webrtc/offer"'),
      );
    });
    await act(async () => {
      mockOnMessage(
        JSON.stringify({
          type: 'webrtc/answer',
          value:
            'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n',
        }),
      );
    });
    const audioTrack: MockTrack = {
      kind: 'audio',
      enabled: true,
      stop: jest.fn(),
    };
    const videoTrack: MockTrack = {
      kind: 'video',
      enabled: true,
      stop: jest.fn(),
    };
    const stream = new MockMediaStream([audioTrack, videoTrack]);
    await act(async () => {
      MockPeerConnection.latest.ontrack?.({
        streams: [stream],
        track: audioTrack,
      });
      MockPeerConnection.latest.ontrack?.({
        streams: [stream],
        track: videoTrack,
      });
    });

    expect(onAudioAvailabilityChange).toHaveBeenCalledWith(true);
    expect(audioTrack.enabled).toBe(false);

    const player = view.getByTestId('protected-rtc-view');
    fireEvent(player, 'onDimensionsChange', {
      nativeEvent: {width: 640, height: 360},
    });
    expect(onPlaying).toHaveBeenCalledTimes(1);

    view.rerender(
      <ProtectedWebRTCPlayer
        server={server}
        streamName="front"
        muted={false}
        style={{}}
        onPlaying={onPlaying}
        onError={onError}
        onAudioAvailabilityChange={onAudioAvailabilityChange}
        onAudioActivationChange={onAudioActivationChange}
      />,
    );
    await waitFor(() => expect(audioTrack.enabled).toBe(true));
    expect(mockAcquireProtectedAudio).toHaveBeenCalledWith(undefined);
    expect(onAudioActivationChange).toHaveBeenCalledWith(true);

    const focusLost = mockAddFocusLostListener.mock.calls[0]?.[0] as
      | (() => void)
      | undefined;
    focusLost?.();
    await waitFor(() => expect(audioTrack.enabled).toBe(false));
    expect(onAudioActivationChange).toHaveBeenCalledWith(false);

    view.rerender(
      <ProtectedWebRTCPlayer
        server={server}
        streamName="front"
        muted
        style={{}}
        onPlaying={onPlaying}
        onError={onError}
        onAudioAvailabilityChange={onAudioAvailabilityChange}
        onAudioActivationChange={onAudioActivationChange}
      />,
    );
    await waitFor(() => expect(audioTrack.enabled).toBe(false));
    view.unmount();

    render(
      <ProtectedWebRTCPlayer
        server={server}
        streamName="front"
        muted
        style={{}}
        onPlaying={onPlaying}
        onError={onError}
        onAudioAvailabilityChange={onAudioAvailabilityChange}
        onAudioActivationChange={onAudioActivationChange}
      />,
    );
    expect(mockAddFocusLostListener).toHaveBeenCalledTimes(2);
  });

  it('activates audio when the unmute request precedes track arrival', async () => {
    const onAudioActivationChange = jest.fn();
    const onError = jest.fn();
    const onPlaying = jest.fn();
    const view = render(
      <ProtectedWebRTCPlayer
        server={{} as never}
        streamName="front"
        muted={false}
        style={{}}
        onPlaying={onPlaying}
        onError={onError}
        onAudioActivationChange={onAudioActivationChange}
      />,
    );

    await waitFor(() =>
      expect(mockSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"webrtc/offer"'),
      ),
    );
    await act(async () => {
      mockOnMessage(
        JSON.stringify({
          type: 'webrtc/answer',
          value:
            'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n',
        }),
      );
    });
    const audioTrack: MockTrack = {
      kind: 'audio',
      enabled: true,
      stop: jest.fn(),
    };
    const videoTrack: MockTrack = {
      kind: 'video',
      enabled: true,
      stop: jest.fn(),
    };
    const stream = new MockMediaStream([audioTrack, videoTrack]);
    await act(async () => {
      MockPeerConnection.latest.ontrack?.({
        streams: [stream],
        track: audioTrack,
      });
      MockPeerConnection.latest.ontrack?.({
        streams: [stream],
        track: videoTrack,
      });
    });
    fireEvent(view.getByTestId('protected-rtc-view'), 'onDimensionsChange', {
      nativeEvent: {width: 640, height: 360},
    });
    await waitFor(() => expect(audioTrack.enabled).toBe(true));
    expect(onAudioActivationChange).toHaveBeenCalledWith(true);
  });

  it('tombstones a pending acquire after another owner takes focus', async () => {
    const pendingAcquire = deferred<string | null>();
    mockAcquireProtectedAudio.mockReturnValueOnce(pendingAcquire.promise);
    const onAudioActivationChange = jest.fn();
    const audioTrack: MockTrack = {
      kind: 'audio',
      enabled: true,
      readyState: 'live',
      stop: jest.fn(),
    };
    const videoTrack: MockTrack = {
      kind: 'video',
      enabled: true,
      readyState: 'live',
      stop: jest.fn(),
    };
    const stream = new MockMediaStream([audioTrack, videoTrack]);
    const view = render(
      <ProtectedWebRTCPlayer
        server={{} as never}
        streamName="front"
        muted={false}
        style={{}}
        onPlaying={jest.fn()}
        onError={jest.fn()}
        onAudioActivationChange={onAudioActivationChange}
      />,
    );
    await act(async () => {
      mockOnMessage(
        JSON.stringify({
          type: 'webrtc/answer',
          value:
            'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n',
        }),
      );
      MockPeerConnection.latest.ontrack?.({streams: [stream], track: audioTrack});
      MockPeerConnection.latest.ontrack?.({streams: [stream], track: videoTrack});
    });
    fireEvent(view.getByTestId('protected-rtc-view'), 'onDimensionsChange', {
      nativeEvent: {width: 640, height: 360},
    });
    await waitFor(() => expect(mockAcquireProtectedAudio).toHaveBeenCalled());

    const focusLost = mockAddFocusLostListener.mock.calls[0]?.[0] as
      | ((ownerToken: string) => void)
      | undefined;
    focusLost?.('owner-b-lease');
    await act(async () => {
      pendingAcquire.resolve('owner-a-lease');
      await pendingAcquire.promise;
    });

    expect(audioTrack.enabled).toBe(false);
    expect(onAudioActivationChange).not.toHaveBeenCalledWith(true);
    expect(mockReleaseProtectedAudio).toHaveBeenCalledWith('owner-a-lease');
    view.unmount();
  });

  it('ignores a pending acquire completed after mute or unmount', async () => {
    const pendingAcquire = deferred<string | null>();
    mockAcquireProtectedAudio.mockReturnValueOnce(pendingAcquire.promise);
    const onAudioActivationChange = jest.fn();
    const audioTrack: MockTrack = {
      kind: 'audio',
      enabled: true,
      readyState: 'live',
      stop: jest.fn(),
    };
    const videoTrack: MockTrack = {
      kind: 'video',
      enabled: true,
      readyState: 'live',
      stop: jest.fn(),
    };
    const stream = new MockMediaStream([audioTrack, videoTrack]);
    const view = render(
      <ProtectedWebRTCPlayer
        server={{} as never}
        streamName="front"
        muted={false}
        style={{}}
        onPlaying={jest.fn()}
        onError={jest.fn()}
        onAudioActivationChange={onAudioActivationChange}
      />,
    );
    await act(async () => {
      mockOnMessage(
        JSON.stringify({
          type: 'webrtc/answer',
          value:
            'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n',
        }),
      );
      MockPeerConnection.latest.ontrack?.({streams: [stream], track: audioTrack});
      MockPeerConnection.latest.ontrack?.({streams: [stream], track: videoTrack});
    });
    fireEvent(view.getByTestId('protected-rtc-view'), 'onDimensionsChange', {
      nativeEvent: {width: 640, height: 360},
    });
    await waitFor(() => expect(mockAcquireProtectedAudio).toHaveBeenCalled());

    view.rerender(
      <ProtectedWebRTCPlayer
        server={{} as never}
        streamName="front"
        muted
        style={{}}
        onPlaying={jest.fn()}
        onError={jest.fn()}
        onAudioActivationChange={onAudioActivationChange}
      />,
    );
    await act(async () => {
      pendingAcquire.resolve('muted-owner-lease');
      await pendingAcquire.promise;
    });
    expect(audioTrack.enabled).toBe(false);
    expect(onAudioActivationChange).not.toHaveBeenCalledWith(true);
    expect(mockReleaseProtectedAudio).toHaveBeenCalledWith('muted-owner-lease');
    view.unmount();
  });

  it('ignores a pending acquire completed after unmount', async () => {
    const pendingAcquire = deferred<string | null>();
    mockAcquireProtectedAudio.mockReturnValueOnce(pendingAcquire.promise);
    const onAudioActivationChange = jest.fn();
    const audioTrack: MockTrack = {
      kind: 'audio',
      enabled: true,
      readyState: 'live',
      stop: jest.fn(),
    };
    const videoTrack: MockTrack = {
      kind: 'video',
      enabled: true,
      readyState: 'live',
      stop: jest.fn(),
    };
    const stream = new MockMediaStream([audioTrack, videoTrack]);
    const view = render(
      <ProtectedWebRTCPlayer
        server={{} as never}
        streamName="front"
        muted={false}
        style={{}}
        onPlaying={jest.fn()}
        onError={jest.fn()}
        onAudioActivationChange={onAudioActivationChange}
      />,
    );
    await act(async () => {
      mockOnMessage(
        JSON.stringify({
          type: 'webrtc/answer',
          value:
            'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n',
        }),
      );
      MockPeerConnection.latest.ontrack?.({streams: [stream], track: audioTrack});
      MockPeerConnection.latest.ontrack?.({streams: [stream], track: videoTrack});
    });
    fireEvent(view.getByTestId('protected-rtc-view'), 'onDimensionsChange', {
      nativeEvent: {width: 640, height: 360},
    });
    await waitFor(() => expect(mockAcquireProtectedAudio).toHaveBeenCalled());

    view.unmount();
    await act(async () => {
      pendingAcquire.resolve('unmounted-owner-lease');
      await pendingAcquire.promise;
    });
    expect(audioTrack.enabled).toBe(false);
    expect(onAudioActivationChange).not.toHaveBeenCalledWith(true);
    expect(mockReleaseProtectedAudio).toHaveBeenCalledWith(
      'unmounted-owner-lease',
    );
  });

  it('tracks remote audio mute, removal, and replacement lifecycle', async () => {
    const onAudioAvailabilityChange = jest.fn();
    const onAudioActivationChange = jest.fn();
    const view = render(
      <ProtectedWebRTCPlayer
        server={{} as never}
        streamName="front"
        muted={false}
        style={{}}
        onPlaying={jest.fn()}
        onError={jest.fn()}
        onAudioAvailabilityChange={onAudioAvailabilityChange}
        onAudioActivationChange={onAudioActivationChange}
      />,
    );
    await act(async () => {
      mockOnMessage(
        JSON.stringify({
          type: 'webrtc/answer',
          value:
            'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n',
        }),
      );
    });
    const audioTrack: MockTrack = {
      kind: 'audio',
      enabled: true,
      readyState: 'live',
      stop: jest.fn(),
    };
    const videoTrack: MockTrack = {
      kind: 'video',
      enabled: true,
      readyState: 'live',
      stop: jest.fn(),
    };
    const stream = new MockMediaStream([audioTrack, videoTrack]);
    await act(async () => {
      MockPeerConnection.latest.ontrack?.({streams: [stream], track: audioTrack});
      MockPeerConnection.latest.ontrack?.({streams: [stream], track: videoTrack});
    });
    fireEvent(view.getByTestId('protected-rtc-view'), 'onDimensionsChange', {
      nativeEvent: {width: 640, height: 360},
    });
    await waitFor(() => expect(audioTrack.enabled).toBe(true));

    audioTrack.muted = true;
    await act(async () => {
      audioTrack.onmute?.();
    });
    expect(audioTrack.enabled).toBe(true);
    expect(onAudioAvailabilityChange).toHaveBeenLastCalledWith(true);
    expect(onAudioActivationChange).toHaveBeenLastCalledWith(true);

    audioTrack.muted = false;
    await act(async () => {
      audioTrack.onunmute?.();
    });
    await waitFor(() => expect(audioTrack.enabled).toBe(true));

    audioTrack.readyState = 'ended';
    await act(async () => {
      audioTrack.onended?.();
    });
    expect(audioTrack.enabled).toBe(false);
    expect(onAudioAvailabilityChange).toHaveBeenLastCalledWith(false);

    await act(async () => {
      stream.removeTrack(audioTrack);
    });
    expect(onAudioAvailabilityChange).toHaveBeenLastCalledWith(false);

    const replacement: MockTrack = {
      kind: 'audio',
      enabled: false,
      readyState: 'live',
      stop: jest.fn(),
    };
    await act(async () => {
      stream.addTrack(replacement);
    });
    await waitFor(() => expect(replacement.enabled).toBe(true));
    expect(onAudioAvailabilityChange).toHaveBeenLastCalledWith(true);
    view.unmount();
  });
});
