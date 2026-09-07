import {
  classifyProtectedLiveTimeout,
  formatProtectedLiveDiagnostics,
} from '../../helpers/protectedLiveDiagnostics';

const diagnostics = (
  overrides: Partial<
    import('../../helpers/protectedLiveDiagnostics').ProtectedLiveDiagnostics
  > = {},
) => ({
  connectionState: 'connected',
  iceConnectionState: 'connected',
  videoTrackCount: 1,
  mutedVideoTrackCount: 0,
  endedVideoTrackCount: 0,
  ...overrides,
});

describe('protectedLiveDiagnostics', () => {
  it('distinguishes ICE failure from a decoder stall', () => {
    expect(
      classifyProtectedLiveTimeout(
        diagnostics({iceConnectionState: 'failed'}),
      ),
    ).toBe('ice');
    expect(
      classifyProtectedLiveTimeout(
        diagnostics({inboundVideoPackets: 100, inboundVideoFrames: 0}),
      ),
    ).toBe('decode');
  });

  it('classifies a decoded stream with no renderer frame separately', () => {
    expect(
      classifyProtectedLiveTimeout({
        ...diagnostics(),
        inboundVideoPackets: 100,
        inboundVideoFrames: 40,
      }),
    ).toBe('renderer');
  });

  it('formats only privacy-safe diagnostic fields', () => {
    expect(
      formatProtectedLiveDiagnostics(
        diagnostics({
          inboundVideoPackets: 10,
          inboundVideoFrames: 2,
          codec: 'H264',
          candidateType: 'host',
          candidateProtocol: 'udp',
        }),
      ),
    ).toContain('codec=H264');
  });
});
