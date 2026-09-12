export type ProtectedLiveFailureReason =
  | 'codec'
  | 'ice'
  | 'track'
  | 'muted'
  | 'packets'
  | 'decode'
  | 'renderer'
  | 'timeout';

export type ProtectedLiveDiagnosticsStage =
  | 'answer'
  | 'frame-ready'
  | 'post-answer'
  | 'post-frame'
  | 'timeout';

export interface ProtectedLiveDiagnostics {
  connectionState: string;
  iceConnectionState: string;
  videoTrackCount: number;
  mutedVideoTrackCount: number;
  endedVideoTrackCount: number;
  acceptedAudio?: boolean;
  receiverAudioTrackCount?: number;
  streamAudioTrackCount?: number;
  audioTrackCount?: number;
  readyAudioTrackCount?: number;
  mutedAudioTrackCount?: number;
  enabledAudioTrackCount?: number;
  endedAudioTrackCount?: number;
  inboundVideoPackets?: number;
  inboundVideoFrames?: number;
  inboundAudioPackets?: number;
  inboundAudioBytes?: number;
}

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
  stage: ProtectedLiveDiagnosticsStage = 'timeout',
): string => {
  const fields = [
    `stage=${stage}`,
    `videoTracks=${safeNumber(diagnostics.videoTrackCount) ?? 0}`,
    `mutedVideoTracks=${safeNumber(diagnostics.mutedVideoTrackCount) ?? 0}`,
    `endedVideoTracks=${safeNumber(diagnostics.endedVideoTrackCount) ?? 0}`,
  ];
  if (diagnostics.acceptedAudio !== undefined) {
    fields.push(`acceptedAudio=${diagnostics.acceptedAudio}`);
  }
  const receiverAudioTracks = safeNumber(
    diagnostics.receiverAudioTrackCount,
  );
  const streamAudioTracks = safeNumber(diagnostics.streamAudioTrackCount);
  if (diagnostics.audioTrackCount !== undefined) {
    fields.push(`audioTracks=${safeNumber(diagnostics.audioTrackCount) ?? 0}`);
  }
  if (receiverAudioTracks !== undefined) {
    fields.push(`receiverAudioTracks=${receiverAudioTracks}`);
  }
  if (streamAudioTracks !== undefined) {
    fields.push(`streamAudioTracks=${streamAudioTracks}`);
  }
  const readyAudioTracks = safeNumber(diagnostics.readyAudioTrackCount);
  if (readyAudioTracks !== undefined) {
    fields.push(`readyAudioTracks=${readyAudioTracks}`);
  }
  if (diagnostics.mutedAudioTrackCount !== undefined) {
    fields.push(
      `mutedAudioTracks=${safeNumber(diagnostics.mutedAudioTrackCount) ?? 0}`,
    );
  }
  const enabledAudioTracks = safeNumber(diagnostics.enabledAudioTrackCount);
  if (enabledAudioTracks !== undefined) {
    fields.push(`enabledAudioTracks=${enabledAudioTracks}`);
  }
  if (diagnostics.endedAudioTrackCount !== undefined) {
    fields.push(
      `endedAudioTracks=${safeNumber(diagnostics.endedAudioTrackCount) ?? 0}`,
    );
  }
  const packets = safeNumber(diagnostics.inboundVideoPackets);
  const frames = safeNumber(diagnostics.inboundVideoFrames);
  if (packets !== undefined) {
    fields.push(`videoPackets=${packets}`);
  }
  if (frames !== undefined) {
    fields.push(`videoFrames=${frames}`);
  }
  const audioPackets = safeNumber(diagnostics.inboundAudioPackets);
  const audioBytes = safeNumber(diagnostics.inboundAudioBytes);
  if (audioPackets !== undefined) {
    fields.push(`audioPackets=${audioPackets}`);
  }
  if (audioBytes !== undefined) {
    fields.push(`audioBytes=${audioBytes}`);
  }
  return fields.join(', ');
};
