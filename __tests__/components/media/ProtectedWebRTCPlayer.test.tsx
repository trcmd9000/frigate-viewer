import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';

interface MockTrack {
  id?: string;
  kind: 'audio' | 'video';
  enabled: boolean;
  stop: jest.Mock;
}

class MockMediaStream {
  private tracks: MockTrack[];

  constructor(tracks: MockTrack[] = []) {
    this.tracks = tracks;
  }

  addTrack(track: MockTrack) {
    if (!this.tracks.includes(track)) {
      this.tracks.push(track);
    }
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

  addIceCandidate() {
    return Promise.resolve();
  }

  close() {
    return undefined;
  }
}

const mockOnMessage = jest.fn();
const mockSocket = {
  ready: Promise.resolve(),
  send: jest.fn((_message: string) => Promise.resolve()),
  close: jest.fn(),
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

jest.mock('../../../helpers/protectedLive', () => ({
  hasAcceptedVideoMedia: (sdp: string) => sdp.includes('m=video 9'),
  openProtectedLiveSocket: jest.fn(async (_server, _stream, callbacks) => {
    mockOnMessage.mockImplementation(callbacks.onMessage);
    return mockSocket;
  }),
}));

jest.mock('../../../helpers/secureLogger', () => ({
  SecureLogger: {logError: jest.fn()},
}));

const {ProtectedWebRTCPlayer} =
  require('../../../components/media/ProtectedWebRTCPlayer') as typeof import('../../../components/media/ProtectedWebRTCPlayer');

describe('ProtectedWebRTCPlayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnMessage.mockReset();
    mockSocket.send.mockClear();
    mockSocket.send.mockImplementation(() => {
      return Promise.resolve();
    });
    mockSocket.close.mockClear();
  });

  it('waits for a track event before deciding an accepted video answer failed', async () => {
    const onError = jest.fn();
    const onPlaying = jest.fn();
    const {queryByTestId, getByTestId} = render(
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

    const view = getByTestId('protected-rtc-view');
    fireEvent(view, 'onDimensionsChange', {
      nativeEvent: {width: 640, height: 360},
    });
    expect(onPlaying).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });
});
