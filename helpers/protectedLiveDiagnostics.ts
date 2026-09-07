export type ProtectedLiveFailureReason =
  | 'codec'
  | 'ice'
  | 'track'
  | 'muted'
  | 'packets'
  | 'decode'
  | 'renderer'
  | 'timeout';

export interface ProtectedLiveDiagnostics {
  connectionState: string;
  iceConnectionState: string;
  videoTrackCount: number;
  mutedVideoTrackCount: number;
  endedVideoTrackCount: number;
  inboundVideoPackets?: number;
  inboundVideoFrames?: number;
  codec?: string;
  candidateType?: string;
  candidateProtocol?: string;
}

const safeState = (value: unknown): string =>
  typeof value === 'string' && /^[a-z-]{1,32}$/i.test(value) ? value : 'unknown';

const safeNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;

export const classifyProtectedLiveTimeout = (
  diagnostics: ProtectedLiveDiagnostics,
): ProtectedLiveFailureReason => {
  if (
    diagnostics.connectionState === 'failed' ||
    diagnostics.iceConnectionState === 'failed' ||
    diagnostics.iceConnectionState === 'disconnected'
  ) {
    return 'ice';
  }
  if (diagnostics.videoTrackCount === 0) {
    return 'track';
  }
  if (
    diagnostics.mutedVideoTrackCount === diagnostics.videoTrackCount ||
    diagnostics.endedVideoTrackCount === diagnostics.videoTrackCount
  ) {
    return 'muted';
  }
  if (diagnostics.inboundVideoPackets === 0) {
    return 'packets';
  }
  if (
    diagnostics.inboundVideoPackets !== undefined &&
    diagnostics.inboundVideoPackets > 0 &&
    diagnostics.inboundVideoFrames === 0
  ) {
    return 'decode';
  }
  if (
    diagnostics.inboundVideoFrames !== undefined &&
    diagnostics.inboundVideoFrames > 0
  ) {
    return 'renderer';
  }
  return 'timeout';
};

export const formatProtectedLiveDiagnostics = (
  diagnostics: ProtectedLiveDiagnostics,
): string => {
  const fields = [
    `connection=${safeState(diagnostics.connectionState)}`,
    `ice=${safeState(diagnostics.iceConnectionState)}`,
    `videoTracks=${diagnostics.videoTrackCount}`,
    `mutedVideoTracks=${diagnostics.mutedVideoTrackCount}`,
    `endedVideoTracks=${diagnostics.endedVideoTrackCount}`,
  ];
  const packets = safeNumber(diagnostics.inboundVideoPackets);
  const frames = safeNumber(diagnostics.inboundVideoFrames);
  if (packets !== undefined) {
    fields.push(`videoPackets=${packets}`);
  }
  if (frames !== undefined) {
    fields.push(`videoFrames=${frames}`);
  }
  if (diagnostics.codec) {
    fields.push(`codec=${diagnostics.codec}`);
  }
  if (diagnostics.candidateType) {
    fields.push(`candidateType=${diagnostics.candidateType}`);
  }
  if (diagnostics.candidateProtocol) {
    fields.push(`candidateProtocol=${diagnostics.candidateProtocol}`);
  }
  return fields.join(', ');
};
