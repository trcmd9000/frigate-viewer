const socketId = '0123456789abcdef0123456789abcdef';
const mockOpenSocket = jest.fn();
const mockSendMessage = jest.fn();
const mockCloseSocket = jest.fn();
const mockProtectedMediaProfileId = jest.fn();
const mockListeners = new Map<string, Set<(event: unknown) => void>>();

const emit = (eventName: string, event: unknown) => {
  mockListeners.get(eventName)?.forEach(listener => listener(event));
};

jest.mock('react-native', () => ({
  NativeModules: {
    ClientCertModule: {
      openProtectedLiveSocket: (...args: unknown[]) => mockOpenSocket(...args),
      sendProtectedLiveSocketMessage: (...args: unknown[]) =>
        mockSendMessage(...args),
      closeProtectedLiveSocket: (...args: unknown[]) => mockCloseSocket(...args),
    },
  },
  NativeEventEmitter: class {
    addListener(eventName: string, listener: (event: unknown) => void) {
      const eventListeners = mockListeners.get(eventName) || new Set();
      eventListeners.add(listener);
      mockListeners.set(eventName, eventListeners);
      return {
        remove: () => eventListeners.delete(listener),
      };
    }
  },
  Platform: {OS: 'android'},
}));

jest.mock('../../helpers/protectedMedia', () => ({
  protectedMediaProfileId: (...args: unknown[]) =>
    mockProtectedMediaProfileId(...args),
}));

import type {Server} from '../../store/settings';
import {
  hasAcceptedAudioMedia,
  hasAcceptedVideoMedia,
  openProtectedLiveSocket,
  selectProtectedLiveStream,
  selectProtectedLiveStreamOptions,
  selectProtectedLiveStreams,
  summarizeAudioMedia,
  summarizeVideoMedia,
} from '../../helpers/protectedLive';

const server = {} as Server;

describe('protected live signaling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListeners.clear();
    mockProtectedMediaProfileId.mockResolvedValue('profile-id');
    mockOpenSocket.mockResolvedValue(socketId);
    mockSendMessage.mockResolvedValue(undefined);
  });

  it('recognizes only enabled video media sections in an SDP answer', () => {
    expect(
      hasAcceptedVideoMedia(
        'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n',
      ),
    ).toBe(true);
    expect(
      hasAcceptedVideoMedia(
        'v=0\r\nm=video 0 UDP/TLS/RTP/SAVPF 96\r\n',
      ),
    ).toBe(false);
    expect(
      hasAcceptedVideoMedia(
        'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=recvonly\r\n',
      ),
    ).toBe(false);
    expect(
      hasAcceptedVideoMedia(
        'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=inactive\r\n',
      ),
    ).toBe(false);
    expect(
      hasAcceptedVideoMedia(
        'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendonly\r\n',
      ),
    ).toBe(true);
    expect(hasAcceptedVideoMedia('v=0\r\nm=video\r\n')).toBe(false);
  });

  it('recognizes an accepted audio section separately from video', () => {
    expect(
      hasAcceptedAudioMedia(
        'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n',
      ),
    ).toBe(true);
    expect(
      hasAcceptedAudioMedia(
        'v=0\r\nm=audio 0 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n',
      ),
    ).toBe(false);
    expect(
      hasAcceptedAudioMedia(
        'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=recvonly\r\n',
      ),
    ).toBe(false);
    expect(
      hasAcceptedAudioMedia(
        'v=0\r\na=recvonly\r\nm=audio 9/2 UDP/TLS/RTP/SAVPF 111\r\n',
      ),
    ).toBe(false);
    expect(
      hasAcceptedAudioMedia(
        'v=0\r\nm=audio 9/2 UDP/TLS/RTP/SAVPF 111\r\na=sendonly\r\n',
      ),
    ).toBe(true);
  });

  it('summarizes only safe audio SDP capability fields', () => {
    expect(
      summarizeAudioMedia(
        'v=0\r\na=recvonly\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111 0\r\na=rtpmap:111 opus/48000/2\r\na=rtpmap:0 PCMU/8000\r\n',
      ),
    ).toEqual({
      present: true,
      portAccepted: true,
      direction: 'recvonly',
      opus: true,
      pcma: false,
      pcmu: true,
    });
    expect(
      summarizeAudioMedia(
        'v=0\r\nm=audio 0 RTP/AVP 8\r\na=inactive\r\na=rtpmap:8 PCMA/8000\r\n',
      ),
    ).toEqual({
      present: true,
      portAccepted: false,
      direction: 'inactive',
      opus: false,
      pcma: true,
      pcmu: false,
    });
  });

  it('summarizes only safe video SDP capability fields', () => {
    expect(
      summarizeVideoMedia(
        'v=0\r\na=recvonly\r\nm=video 9 UDP/TLS/RTP/SAVPF 96 98 100\r\na=rtpmap:96 H265/90000\r\na=rtpmap:98 H264/90000\r\na=rtpmap:100 VP9/90000\r\n',
      ),
    ).toEqual({
      present: true,
      portAccepted: true,
      direction: 'recvonly',
      h264: true,
      h265: true,
      vp8: false,
      vp9: true,
      av1: false,
    });
    expect(
      summarizeVideoMedia(
        'v=0\r\nm=video 0 RTP/AVP 96\r\na=inactive\r\na=rtpmap:96 VP8/90000\r\n',
      ),
    ).toEqual({
      present: true,
      portAccepted: false,
      direction: 'inactive',
      h264: false,
      h265: false,
      vp8: true,
      vp9: false,
      av1: false,
    });
  });

  it('selects only configured go2rtc streams for the requested camera', () => {
    expect(
      selectProtectedLiveStream(
        {
          cameras: {
            front: {
              live: {
                streams: {
                  Main: 'front_main',
                  Sub: 'front_sub',
                },
              },
            },
          },
          go2rtc: {
            streams: {
              front_main: {},
              unrelated: {},
            },
          },
        },
        'front',
      ),
    ).toBe('front_main');
    expect(
      selectProtectedLiveStreams(
        {
          cameras: {
            front: {
              live: {
                streams: {
                  Main: 'front_main',
                  Sub: 'front_sub',
                  Duplicate: 'front_main',
                },
              },
            },
          },
          go2rtc: {
            streams: {
              front_main: {},
              front_sub: {},
              front: {},
            },
          },
        },
        'front',
      ),
    ).toEqual(['front_main', 'front_sub', 'front']);
    expect(
      selectProtectedLiveStream(
        {go2rtc: {streams: {front: {}}}},
        'front',
      ),
    ).toBe('front');
    expect(
      selectProtectedLiveStream(
        {go2rtc: {streams: {unrelated: {}}}},
        'front',
      ),
    ).toBeUndefined();
  });

  it('preserves configured live-stream labels and order without duplicates', () => {
    expect(
      selectProtectedLiveStreamOptions(
        {
          cameras: {
            front: {
              live: {
                streams: {
                  Compatible: 'front_sub',
                  Original: 'front_main',
                  Duplicate: 'front_sub',
                },
              },
            },
          },
          go2rtc: {streams: {front_sub: {}, front_main: {}}},
        },
        'front',
      ),
    ).toEqual([
      {name: 'front_sub', label: 'Compatible'},
      {name: 'front_main', label: 'Original'},
    ]);
  });

  it('buffers an opening event emitted before the native identifier resolves', async () => {
    const onState = jest.fn();
    const onMessage = jest.fn();
    mockOpenSocket.mockImplementation(async () => {
      emit('protectedLiveSocketState', {
        socketId,
        state: 'open',
        statusCode: 101,
      });
      return socketId;
    });

    const socket = await openProtectedLiveSocket(server, 'front_main', {
      onState,
      onMessage,
    });
    await socket.ready;
    emit('protectedLiveSocketMessage', {socketId, message: '{"type":"test"}'});
    await socket.send('{"type":"webrtc/offer"}');

    expect(mockOpenSocket).toHaveBeenCalledWith('profile-id', 'front_main');
    expect(onState).toHaveBeenCalledWith({state: 'open', statusCode: 101});
    expect(onMessage).toHaveBeenCalledWith('{"type":"test"}');
    expect(mockSendMessage).toHaveBeenCalledWith(
      socketId,
      '{"type":"webrtc/offer"}',
    );

    socket.close();
    expect(mockCloseSocket).toHaveBeenCalledWith(socketId);
  });

  it('rejects invalid stream names before registering a native profile', async () => {
    await expect(
      openProtectedLiveSocket(server, '../front', {
        onState: jest.fn(),
        onMessage: jest.fn(),
      }),
    ).rejects.toThrow('stream name is invalid');

    expect(mockProtectedMediaProfileId).not.toHaveBeenCalled();
    expect(mockOpenSocket).not.toHaveBeenCalled();
  });

  it('closes a native socket that returns an invalid opaque identifier', async () => {
    mockOpenSocket.mockResolvedValue('invalid');

    await expect(
      openProtectedLiveSocket(server, 'front', {
        onState: jest.fn(),
        onMessage: jest.fn(),
      }),
    ).rejects.toThrow('invalid identifier');

    expect(mockCloseSocket).toHaveBeenCalledWith('invalid');
    expect(mockListeners.get('protectedLiveSocketState')?.size || 0).toBe(0);
    expect(mockListeners.get('protectedLiveSocketMessage')?.size || 0).toBe(0);
  });

  it('rejects readiness when native signaling fails before opening', async () => {
    const onState = jest.fn();
    const socket = await openProtectedLiveSocket(server, 'front', {
      onState,
      onMessage: jest.fn(),
    });

    emit('protectedLiveSocketState', {
      socketId,
      state: 'error',
      statusCode: 401,
    });

    await expect(socket.ready).rejects.toThrow('HTTP 401');
    expect(onState).toHaveBeenCalledWith({state: 'error', statusCode: 401});
    socket.close();
  });
});
