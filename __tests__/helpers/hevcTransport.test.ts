jest.mock('../../helpers/rest', () => ({
  authorizationHeader: jest.fn(() => ({Authorization: 'Basic redacted'})),
  buildServerApiUrl: jest.fn(() => 'https://server.invalid/api'),
  executeServerRequest: jest.fn(),
}));

const mockProtectedMediaProfileId = jest.fn();
jest.mock('../../helpers/protectedMedia', () => ({
  protectedMediaProfileId: (...args: unknown[]) =>
    mockProtectedMediaProfileId(...args),
}));

import {
  decideTransportEligibility,
  deviceCodecCapabilityFromNative,
  fetchStreamMetadata,
  invalidateStreamMetadataCache,
  parseStreamMetadata,
  parseStreamMetadataJson,
  planProtectedLiveStreams,
  probeProtectedMseContract,
  protectedMseProbeEnabled,
  protectedMseProbeFailure,
} from '../../helpers/hevcTransport';
import {executeServerRequest} from '../../helpers/rest';
import {NativeModules, Platform} from 'react-native';

const request = executeServerRequest as jest.Mock;

const device = (
  available: 'supported' | 'unsupported' | 'unknown' = 'supported',
) =>
  deviceCodecCapabilityFromNative({
    hevcDecoderAvailable:
      available === 'unknown' ? undefined : available === 'supported',
    hevcHardwareDecoderAvailable: available === 'supported',
    hevcSoftwareDecoderAvailable: false,
    maxWidth: 3840,
    maxHeight: 2160,
    maxFrameRate: 60,
  });

describe('HEVC transport observation model', () => {
  beforeEach(() => {
    invalidateStreamMetadataCache();
    request.mockReset();
    mockProtectedMediaProfileId.mockReset();
    NativeModules.ClientCertModule = NativeModules.ClientCertModule || {};
    delete NativeModules.ClientCertModule.isProtectedMseProbeEnabled;
    delete NativeModules.ClientCertModule.probeProtectedMse;
  });

  it('parses H264 and audio descriptors without copying producer URLs', () => {
    const result = parseStreamMetadataJson(
      JSON.stringify({
        producers: [
          {
            url: 'https://public.invalid/producer',
            medias: 'video, sendonly, H264, audio, AAC',
          },
        ],
      }),
    );
    expect(result.video.map(item => item.codec)).toEqual(['h264']);
    expect(result.audio.map(item => item.codec)).toEqual(['aac']);
    expect(JSON.stringify(result)).not.toContain('public.invalid');
  });

  it('accepts H265 aliases and mixed codecs deterministically', () => {
    const result = parseStreamMetadataJson(
      JSON.stringify({
        producers: [
          {medias: 'video, HEVC'},
          {medias: 'video, hvc1'},
          {medias: 'video, VP9, audio, OPUS'},
        ],
        ignored: {url: 'https://public.invalid/ignored'},
      }),
    );
    expect(result.video.map(item => item.codec)).toEqual([
      'h265',
      'h265',
      'vp9',
    ]);
    expect(result.audio.map(item => item.codec)).toEqual(['opus']);
    expect(JSON.stringify(result)).not.toContain('public.invalid');
  });

  it('accepts direct video/audio fields and MIME-shaped codec values', () => {
    const result = parseStreamMetadataJson(
      JSON.stringify({
        video: 'video/H.265, 3840x2160, 30 FPS, 10-bit',
        audio: 'audio/mp4a.40.2',
      }),
    );
    expect(result.video[0]).toMatchObject({
      kind: 'video',
      codec: 'h265',
      width: 3840,
      height: 2160,
      frameRate: 30,
      bitDepth: 10,
    });
    expect(result.audio.map(item => item.codec)).toEqual(['aac']);
  });

  it('makes malformed and oversized input explicitly unknown', () => {
    expect(parseStreamMetadataJson('{not-json')).toMatchObject({
      malformed: true,
      unknown: [{codec: 'unknown'}],
    });
    expect(parseStreamMetadataJson(' '.repeat(64 * 1024 + 1))).toMatchObject({
      malformed: true,
      unknown: [{codec: 'unknown'}],
    });
    expect(
      parseStreamMetadataJson(`{"video":"${'é'.repeat(32768)}"}`),
    ).toMatchObject({
      malformed: true,
      unknown: [{codec: 'unknown'}],
    });
    let deeplyNested: unknown = {codec: 'HEVC', type: 'video'};
    for (let index = 0; index < 40; index += 1) {
      deeplyNested = {tracks: deeplyNested};
    }
    expect(parseStreamMetadata({producers: [deeplyNested]})).toMatchObject({
      video: [],
    });
  });

  it('ignores unknown fields and does not optimistically advertise support', () => {
    const result = parseStreamMetadataJson(
      JSON.stringify({
        producers: [{codec: 'future-codec', secret: 'redacted'}],
      }),
    );
    expect(result.video).toEqual([]);
    expect(result.unknown).toEqual([{kind: 'unknown', codec: 'unknown'}]);
  });

  it('does not retain untrusted profile labels or metadata text', () => {
    const result = parseStreamMetadataJson(
      JSON.stringify({
        producers: [
          {
            type: 'video',
            codec: 'HEVC',
            profile: 'Main',
            chroma: 'https://host.invalid/?token=secret',
            ignored: 'raw-body-secret',
          },
          {
            type: 'video',
            codec: 'https://host.invalid/H264?token=secret',
          },
        ],
        token: 'raw-body-secret',
      }),
    );
    expect(result.video).toEqual([
      {kind: 'video', codec: 'h265', profile: 'Main'},
    ]);
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('host.invalid');
    expect(result.unknown).toEqual([{kind: 'video', codec: 'unknown'}]);
  });

  it('separates server advertisement, device support and WebRTC proof', () => {
    const metadata = parseStreamMetadataJson(
      JSON.stringify({producers: [{medias: 'video, HEVC'}]}),
    );
    expect(
      decideTransportEligibility({
        metadata,
        device: device(),
        experimentEnabled: false,
      }),
    ).toMatchObject({
      decision: 'unknown',
      experimentEligible: false,
      existingWebRtcEligible: false,
      transport: 'existing-fallback',
      reason: 'webrtc-unproven',
    });
    expect(
      decideTransportEligibility({
        metadata,
        device: device(),
        experimentEnabled: true,
      }),
    ).toMatchObject({
      decision: 'supported',
      experimentEligible: true,
      transport: 'existing-fallback',
    });
    expect(
      decideTransportEligibility({
        metadata,
        device: device('unsupported'),
        experimentEnabled: true,
      }),
    ).toMatchObject({decision: 'unsupported', reason: 'device-unsupported'});
    expect(
      decideTransportEligibility({
        metadata,
        device: device('unknown'),
        experimentEnabled: true,
      }),
    ).toMatchObject({decision: 'unknown', reason: 'device-unknown'});
  });

  it('keeps the existing H264/VP8/VP9 WebRTC path eligible', () => {
    for (const codec of ['H264', 'VP8', 'VP9']) {
      const result = decideTransportEligibility({
        metadata: parseStreamMetadataJson(
          JSON.stringify({producers: [{medias: `video, ${codec}`}]}),
        ),
        device: device('unknown'),
      });
      expect(result).toMatchObject({
        decision: 'supported',
        existingWebRtcEligible: true,
        transport: 'existing-webrtc',
      });
    }
  });

  it('prefers a non-primary eligible HEVC stream in Auto mode', () => {
    const plan = planProtectedLiveStreams({
      streams: [
        {
          name: 'compatible-a',
          metadata: parseStreamMetadata({video: 'H264', audio: 'AAC, Opus'}),
        },
        {
          name: 'compatible-b',
          metadata: parseStreamMetadata({video: 'H264', audio: 'AAC, Opus'}),
        },
        {
          name: 'original',
          metadata: parseStreamMetadata({video: 'H265', audio: 'AAC, Opus'}),
        },
      ],
      device: device(),
      selection: {mode: 'auto'},
      mseEnabled: true,
    });

    expect(plan).toEqual([
      {name: 'original', codec: 'h265', transport: 'mse'},
      {name: 'compatible-a', codec: 'h264', transport: 'webrtc'},
      {name: 'compatible-b', codec: 'h264', transport: 'webrtc'},
    ]);
  });

  it('prefers protected HEVC for a stream advertising H264 and H265', () => {
    expect(
      planProtectedLiveStreams({
        streams: [{
          name: 'hybrid',
          metadata: parseStreamMetadata({video: 'H264, H265'}),
        }],
        device: device(),
        selection: {mode: 'auto'},
        mseEnabled: true,
      }),
    ).toEqual([{name: 'hybrid', codec: 'h265', transport: 'mse'}]);
  });

  it('keeps a manual stream first and falls back only to compatible streams', () => {
    const streams = [
      {
        name: 'compatible',
        metadata: parseStreamMetadata({video: 'H264', audio: 'AAC, Opus'}),
      },
      {
        name: 'original',
        metadata: parseStreamMetadata({video: 'H265', audio: 'AAC, Opus'}),
      },
    ];

    expect(
      planProtectedLiveStreams({
        streams,
        device: device(),
        selection: {mode: 'manual', streamName: 'compatible'},
        mseEnabled: true,
      }),
    ).toEqual([
      {name: 'compatible', codec: 'h264', transport: 'webrtc'},
    ]);
    expect(
      planProtectedLiveStreams({
        streams,
        device: device(),
        selection: {mode: 'manual', streamName: 'original'},
        mseEnabled: true,
      }),
    ).toEqual([
      {name: 'original', codec: 'h265', transport: 'mse'},
      {name: 'compatible', codec: 'h264', transport: 'webrtc'},
    ]);
  });

  it('does not plan HEVC when native capability is unknown', () => {
    expect(
      planProtectedLiveStreams({
        streams: [
          {
            name: 'compatible',
            metadata: parseStreamMetadata({video: 'H264'}),
          },
          {
            name: 'original',
            metadata: parseStreamMetadata({video: 'H265'}),
          },
        ],
        device: device('unknown'),
        selection: {mode: 'auto'},
        mseEnabled: true,
      }),
    ).toEqual([{name: 'compatible', codec: 'h264', transport: 'webrtc'}]);
  });

  it('rejects HEVC dimensions and rates above observed device limits', () => {
    const metadata = parseStreamMetadataJson(
      JSON.stringify({
        producers: [
          {type: 'video', codec: 'HEVC', width: 7680, height: 4320, fps: 120},
        ],
      }),
    );
    expect(
      decideTransportEligibility({
        metadata,
        device: device(),
        experimentEnabled: true,
      }),
    ).toMatchObject({decision: 'unsupported', reason: 'constraint-mismatch'});
  });

  it('rejects an advertised HEVC profile or level outside device capabilities', () => {
    const metadata = parseStreamMetadataJson(
      JSON.stringify({
        producers: [{type: 'video', codec: 'HEVC', profile: 2, level: 153}],
      }),
    );
    const limitedDevice = deviceCodecCapabilityFromNative({
      hevcDecoderAvailable: true,
      profileLevels: [{profile: 1, level: 120}],
    });
    expect(
      decideTransportEligibility({
        metadata,
        device: limitedDevice,
        experimentEnabled: true,
      }),
    ).toMatchObject({decision: 'unsupported', reason: 'constraint-mismatch'});
  });

  it('lets an available decoder with unreported limits reach the MSE probe', () => {
    const metadata = parseStreamMetadataJson(
      JSON.stringify({
        producers: [{type: 'video', codec: 'HEVC', width: 3840}],
      }),
    );
    expect(
      decideTransportEligibility({
        metadata,
        device: deviceCodecCapabilityFromNative({
          hevcDecoderAvailable: true,
        }),
        experimentEnabled: true,
      }),
    ).toMatchObject({
      decision: 'supported',
      reason: 'device-supported',
      experimentEligible: true,
      transport: 'existing-fallback',
    });
  });

  it('uses the existing authenticated request stack and URL-encodes the name', async () => {
    request.mockResolvedValue({
      status: 200,
      body: '{"producers":[{"medias":"video, H264","url":"https://public.invalid"}]}',
      text: async () =>
        '{"producers":[{"medias":"video, H264","url":"https://public.invalid"}]}',
    });
    const metadata = await fetchStreamMetadata(
      {
        protocol: 'https',
        host: 'server.invalid',
        port: 443,
        path: '',
        auth: 'none',
        credentials: {username: '', password: ''},
      },
      'camera name',
    );
    expect(metadata.video[0].codec).toBe('h264');
    expect(request).toHaveBeenCalledWith(
      expect.anything(),
      'https://server.invalid/api/go2rtc/streams/camera%20name',
      expect.objectContaining({method: 'GET'}),
    );
    expect(JSON.stringify(metadata)).not.toContain('public.invalid');
  });

  it('briefly reuses validated metadata for the same server and stream', async () => {
    request.mockResolvedValue({
      status: 200,
      text: async () => '{"producers":[{"medias":"video, H265"}]}',
    });
    const server = {
      profileId: 'metadata-cache-test',
      protocol: 'https' as const,
      host: 'server.invalid',
      port: 443,
      path: '',
      auth: 'none' as const,
      credentials: {username: '', password: ''},
    };

    const first = await fetchStreamMetadata(server, 'camera');
    const second = await fetchStreamMetadata({...server}, 'camera');

    expect(first.video[0].codec).toBe('h265');
    expect(second).toBe(first);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('serves stale metadata immediately while one refresh is in flight', async () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1_000);
    request.mockResolvedValueOnce({
      status: 200,
      text: async () => '{"producers":[{"medias":"video, H265"}]}',
    });
    const server = {
      profileId: 'metadata-stale-test',
      protocol: 'https' as const,
      host: 'server.invalid',
      port: 443,
      path: '',
      auth: 'none' as const,
      credentials: {username: '', password: ''},
    };
    const first = await fetchStreamMetadata(server, 'camera');
    let resolveRefresh!: (response: unknown) => void;
    request.mockReturnValueOnce(new Promise(resolve => {
      resolveRefresh = resolve;
    }));
    now.mockReturnValue(6 * 60_000);

    const stale = await fetchStreamMetadata(server, 'camera');
    const duplicate = await fetchStreamMetadata(server, 'camera');

    expect(stale).toBe(first);
    expect(duplicate).toBe(first);
    expect(request).toHaveBeenCalledTimes(2);

    resolveRefresh({
      status: 200,
      text: async () => '{"producers":[{"medias":"video, H264"}]}',
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const refreshed = await fetchStreamMetadata(server, 'camera');
    expect(refreshed.video[0].codec).toBe('h264');
    now.mockRestore();
  });

  it('treats an unexpected response content type as unknown without retaining it', async () => {
    request.mockResolvedValue({
      status: 200,
      headers: {'Content-Type': 'text/html'},
      text: async () => '<html>token=secret</html>',
    });
    const metadata = await fetchStreamMetadata(
      {
        protocol: 'https',
        host: 'server.invalid',
        port: 443,
        path: '',
        auth: 'none',
        credentials: {username: '', password: ''},
      },
      'camera',
    );
    expect(metadata).toMatchObject({
      malformed: true,
      unknown: [{codec: 'unknown'}],
    });
    expect(JSON.stringify(metadata)).not.toContain('secret');
  });

  it('keeps the protected MSE probe disabled without invoking native code', async () => {
    const nativeProbe = jest.fn();
    NativeModules.ClientCertModule.isProtectedMseProbeEnabled = () => false;
    NativeModules.ClientCertModule.probeProtectedMse = nativeProbe;

    expect(protectedMseProbeEnabled()).toBe(false);
    await expect(
      probeProtectedMseContract({} as never, 'camera'),
    ).rejects.toThrow('disabled');
    expect(nativeProbe).not.toHaveBeenCalled();
    expect(mockProtectedMediaProfileId).not.toHaveBeenCalled();
  });

  it('uses an opaque profile and validates the bounded MSE result', async () => {
    const previousPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', {configurable: true, value: 'android'});
    NativeModules.ClientCertModule.isProtectedMseProbeEnabled = () => true;
    NativeModules.ClientCertModule.probeProtectedMse = jest.fn().mockResolvedValue({
      mimeH265: true,
      ftyp: true,
      moov: true,
      moof: true,
      mdat: true,
      bytesObserved: 4096,
      ignored: 'secret',
    });
    mockProtectedMediaProfileId.mockResolvedValue(
      '0123456789abcdef0123456789abcdef',
    );

    await expect(
      probeProtectedMseContract({} as never, 'front:main'),
    ).resolves.toEqual({
      mimeH265: true,
      ftyp: true,
      moov: true,
      moof: true,
      mdat: true,
      bytesObserved: 4096,
    });
    expect(NativeModules.ClientCertModule.probeProtectedMse).toHaveBeenCalledWith(
      '0123456789abcdef0123456789abcdef',
      'front:main',
    );
    await probeProtectedMseContract({} as never, 'front:main');
    expect(NativeModules.ClientCertModule.probeProtectedMse).toHaveBeenCalledTimes(1);

    NativeModules.ClientCertModule.probeProtectedMse = jest.fn().mockResolvedValue({
      bytesObserved: 2 * 1024 * 1024 + 1,
    });
    await expect(
      probeProtectedMseContract({} as never, 'front:invalid'),
    ).rejects.toThrow('invalid result');
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: previousPlatform,
    });
  });

  it('retries an MSE contract that did not fully pass', async () => {
    const previousPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', {configurable: true, value: 'android'});
    NativeModules.ClientCertModule.isProtectedMseProbeEnabled = () => true;
    NativeModules.ClientCertModule.probeProtectedMse = jest.fn()
      .mockResolvedValueOnce({
        mimeH265: true,
        ftyp: true,
        moov: false,
        moof: false,
        mdat: false,
        bytesObserved: 512,
      })
      .mockResolvedValueOnce({
        mimeH265: true,
        ftyp: true,
        moov: true,
        moof: true,
        mdat: true,
        bytesObserved: 4096,
      });
    mockProtectedMediaProfileId.mockResolvedValue(
      'fedcba9876543210fedcba9876543210',
    );

    await probeProtectedMseContract({} as never, 'front:retry');
    await probeProtectedMseContract({} as never, 'front:retry');

    expect(NativeModules.ClientCertModule.probeProtectedMse).toHaveBeenCalledTimes(2);
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: previousPlatform,
    });
  });

  it('reduces MSE probe errors to an allow-listed reason', () => {
    expect(
      protectedMseProbeFailure({
        code: 'MSE_PROBE_CODEC_UNAVAILABLE',
        message: 'private endpoint and token',
      }),
    ).toBe('codec-unavailable');
    expect(
      protectedMseProbeFailure({code: 'MSE_PROBE_CONTROL_INVALID'}),
    ).toBe('control-invalid');
    expect(
      protectedMseProbeFailure({code: 'MSE_PROBE_MEDIA_BEFORE_MIME'}),
    ).toBe('media-before-mime');
    expect(
      protectedMseProbeFailure({code: 'MSE_PROBE_MESSAGE_TOO_LARGE'}),
    ).toBe('message-too-large');
    expect(
      protectedMseProbeFailure({
        code: 'UNTRUSTED_PRIVATE_VALUE',
        message: 'secret',
      }),
    ).toBe('unknown');
    expect(protectedMseProbeFailure('secret')).toBe('unknown');
  });
});
