jest.mock('../../helpers/rest', () => ({
  authorizationHeader: jest.fn(() => ({Authorization: 'Basic redacted'})),
  buildServerApiUrl: jest.fn(() => 'https://server.invalid/api'),
  executeServerRequest: jest.fn(),
}));

import {
  decideTransportEligibility,
  deviceCodecCapabilityFromNative,
  fetchStreamMetadata,
  parseStreamMetadata,
  parseStreamMetadataJson,
} from '../../helpers/hevcTransport';
import {executeServerRequest} from '../../helpers/rest';

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
    request.mockReset();
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

  it('keeps unknown stream constraints unknown instead of claiming support', () => {
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
      decision: 'unknown',
      reason: 'constraint-unknown',
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
});
