import {Buffer} from 'buffer';
import {NativeModules, Platform} from 'react-native';
import type {Server} from '../store/settings';
import {protectedMediaProfileId} from './protectedMedia';
import {
  authorizationHeader,
  buildServerApiUrl,
  executeServerRequest,
} from './rest';

export const MAX_STREAM_METADATA_BYTES = 64 * 1024;
const MAX_METADATA_DEPTH = 16;
const MAX_METADATA_DESCRIPTORS = 128;

export type CodecFamily =
  | 'h264'
  | 'h265'
  | 'vp8'
  | 'vp9'
  | 'av1'
  | 'aac'
  | 'opus'
  | 'pcma'
  | 'pcmu'
  | 'unknown';

export type MediaKind = 'video' | 'audio' | 'unknown';

export interface MediaDescriptor {
  readonly kind: MediaKind;
  readonly codec: CodecFamily;
  readonly profile?: string | number;
  readonly level?: number;
  readonly bitDepth?: number;
  readonly chroma?: string;
  readonly frameRate?: number;
  readonly width?: number;
  readonly height?: number;
  readonly hdr?: boolean;
}

export interface StreamMetadata {
  readonly video: readonly MediaDescriptor[];
  readonly audio: readonly MediaDescriptor[];
  readonly unknown: readonly MediaDescriptor[];
  readonly malformed: boolean;
  readonly source: 'protected-go2rtc-metadata';
  readonly transport: 'unknown';
}

export interface DeviceCodecCapability {
  readonly codec: 'h265';
  readonly availability: 'supported' | 'unsupported' | 'unknown';
  readonly hardware: 'supported' | 'unsupported' | 'unknown';
  readonly software: 'supported' | 'unsupported' | 'unknown';
  readonly profiles: readonly {profile: number; level: number}[];
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly maxFrameRate?: number;
}

export interface WebRtcCodecEligibility {
  readonly h264: boolean;
  readonly vp8: boolean;
  readonly vp9: boolean;
  /**
   * Observational only in Phase A; this never selects a new playback path.
   */
  readonly h265: boolean;
}

export type CapabilityDecision = 'supported' | 'unsupported' | 'unknown';

export interface TransportEligibility {
  readonly decision: CapabilityDecision;
  readonly codec: CodecFamily;
  readonly reason:
    | 'advertised'
    | 'not-advertised'
    | 'malformed-metadata'
    | 'device-supported'
    | 'device-unsupported'
    | 'device-unknown'
    | 'webrtc-unproven'
    | 'constraint-mismatch'
    | 'constraint-unknown';
  readonly existingWebRtcEligible: boolean;
  readonly experimentEligible: boolean;
  readonly transport: 'existing-webrtc' | 'existing-fallback';
}

export type LiveStreamSelection =
  | {readonly mode: 'auto'}
  | {readonly mode: 'manual'; readonly streamName: string};

export interface LiveStreamMetadata {
  readonly name: string;
  readonly metadata?: StreamMetadata;
}

export interface PlannedLiveStream {
  readonly name: string;
  readonly codec: CodecFamily;
  readonly transport: 'mse' | 'webrtc';
}

export interface ProtectedMseProbeResult {
  readonly mimeH265: boolean;
  readonly ftyp: boolean;
  readonly moov: boolean;
  readonly moof: boolean;
  readonly mdat: boolean;
  readonly bytesObserved: number;
}

export type ProtectedMseProbeFailure =
  | 'disabled'
  | 'open'
  | 'send'
  | 'protocol'
  | 'control-invalid'
  | 'media-before-mime'
  | 'message-too-large'
  | 'server'
  | 'codec-unavailable'
  | 'budget'
  | 'closed'
  | 'auth'
  | 'connection'
  | 'timeout'
  | 'cancelled'
  | 'unknown';

const MSE_PROBE_FAILURES: Readonly<Record<string, ProtectedMseProbeFailure>> = {
  MSE_PROBE_DISABLED: 'disabled',
  MSE_PROBE_OPEN_FAILED: 'open',
  MSE_PROBE_SEND_FAILED: 'send',
  MSE_PROBE_PROTOCOL_ERROR: 'protocol',
  MSE_PROBE_CONTROL_INVALID: 'control-invalid',
  MSE_PROBE_MEDIA_BEFORE_MIME: 'media-before-mime',
  MSE_PROBE_MESSAGE_TOO_LARGE: 'message-too-large',
  MSE_PROBE_SERVER_ERROR: 'server',
  MSE_PROBE_CODEC_UNAVAILABLE: 'codec-unavailable',
  MSE_PROBE_BYTE_BUDGET: 'budget',
  MSE_PROBE_CLOSED: 'closed',
  MSE_PROBE_AUTH_FAILED: 'auth',
  MSE_PROBE_CONNECTION_FAILED: 'connection',
  MSE_PROBE_TIMEOUT: 'timeout',
  MSE_PROBE_CANCELLED: 'cancelled',
};

export const protectedMseProbeFailure = (
  error: unknown,
): ProtectedMseProbeFailure => {
  const code = asRecord(error)?.code;
  return typeof code === 'string'
    ? MSE_PROBE_FAILURES[code] || 'unknown'
    : 'unknown';
};

const UNKNOWN_DESCRIPTOR: MediaDescriptor = Object.freeze({
  kind: 'unknown',
  codec: 'unknown',
});

const emptyMetadata = (malformed: boolean): StreamMetadata => ({
  video: [],
  audio: [],
  unknown: malformed ? [UNKNOWN_DESCRIPTOR] : [],
  malformed,
  source: 'protected-go2rtc-metadata',
  transport: 'unknown',
});

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const utf8ByteLength = (value: string): number =>
  Buffer.byteLength(value, 'utf8');

const stringValue = (
  record: Record<string, unknown>,
  key: string,
): string | undefined =>
  typeof record[key] === 'string' && record[key].trim()
    ? record[key].trim()
    : undefined;

const safeProfileLabel = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > 64 ||
    !/^(?:main(?: ?(?:10|12)| still picture)?|main10|main12|high|baseline|constrained baseline|rext|\d+(?:\.\d+)?)$/i.test(
      trimmed,
    )
  ) {
    return undefined;
  }
  return trimmed;
};

const safeChromaLabel = (value: string): string | undefined => {
  const trimmed = value.trim();
  return /^\d+(?::\d+){1,2}$/.test(trimmed) ? trimmed : undefined;
};

const profileValue = (
  record: Record<string, unknown>,
): string | number | undefined => {
  const value = record.profile;
  if (
    (typeof value === 'string' && safeProfileLabel(value) !== undefined) ||
    (typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= Number.MAX_SAFE_INTEGER)
  ) {
    return typeof value === 'string' ? safeProfileLabel(value) : value;
  }
  return undefined;
};

const numberValue = (
  record: Record<string, unknown>,
  key: string,
): number | undefined => {
  const value = record[key];
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER
  ) {
    return undefined;
  }
  return value;
};

const boolValue = (
  record: Record<string, unknown>,
  key: string,
): boolean | undefined =>
  typeof record[key] === 'boolean' ? record[key] : undefined;

const codecFromText = (value: string): CodecFamily => {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/^(h264|avc1?|avc3)$/.test(normalized)) {
    return 'h264';
  }
  if (/^(h265|hevc|hev1|hvc1)$/.test(normalized)) {
    return 'h265';
  }
  if (normalized === 'vp8') {
    return 'vp8';
  }
  if (normalized === 'vp9' || normalized === 'vp09') {
    return 'vp9';
  }
  if (normalized === 'av1' || normalized === 'av01') {
    return 'av1';
  }
  if (normalized === 'aac' || normalized.startsWith('mp4a')) {
    return 'aac';
  }
  if (normalized === 'opus') {
    return 'opus';
  }
  if (normalized === 'pcma' || normalized === 'g711alaw') {
    return 'pcma';
  }
  if (normalized === 'pcmu' || normalized === 'g711ulaw') {
    return 'pcmu';
  }
  return 'unknown';
};

const kindFromText = (value: string | undefined): MediaKind => {
  const normalized = value?.toLowerCase() || '';
  if (normalized.includes('video')) {
    return 'video';
  }
  if (normalized.includes('audio')) {
    return 'audio';
  }
  return 'unknown';
};

const firstCodec = (value: string | undefined): CodecFamily => {
  if (!value) {
    return 'unknown';
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim())) {
    return 'unknown';
  }
  const tokens = value.split(/[\s,;|/]+/).filter(Boolean);
  for (const token of tokens) {
    const codec = codecFromText(token);
    if (codec !== 'unknown') {
      return codec;
    }
  }
  return codecFromText(value);
};

const descriptorFromRecord = (
  record: Record<string, unknown>,
  inheritedKind: MediaKind = 'unknown',
): MediaDescriptor => {
  const kind =
    kindFromText(
      stringValue(record, 'kind') ||
        stringValue(record, 'type') ||
        stringValue(record, 'mime') ||
        stringValue(record, 'media'),
    ) !== 'unknown'
      ? kindFromText(
          stringValue(record, 'kind') ||
            stringValue(record, 'type') ||
            stringValue(record, 'mime') ||
            stringValue(record, 'media'),
        )
      : inheritedKind;
  const codec = firstCodec(
    stringValue(record, 'codec') ||
      stringValue(record, 'encoding') ||
      stringValue(record, 'mime'),
  );
  const profile = profileValue(record);
  const level = numberValue(record, 'level');
  const bitDepth = numberValue(record, 'bitDepth');
  const chromaValue = stringValue(record, 'chroma');
  const chroma = chromaValue ? safeChromaLabel(chromaValue) : undefined;
  const frameRate =
    numberValue(record, 'frameRate') ?? numberValue(record, 'fps');
  const width = numberValue(record, 'width');
  const height = numberValue(record, 'height');
  const hdr = boolValue(record, 'hdr');
  return {
    kind: kind === 'unknown' ? inheritedKind : kind,
    codec,
    ...(profile !== undefined ? {profile} : {}),
    ...(level !== undefined ? {level} : {}),
    ...(bitDepth !== undefined ? {bitDepth} : {}),
    ...(chroma ? {chroma} : {}),
    ...(frameRate !== undefined ? {frameRate} : {}),
    ...(width !== undefined ? {width} : {}),
    ...(height !== undefined ? {height} : {}),
    ...(hdr !== undefined ? {hdr} : {}),
  };
};

const descriptorsFromMediaText = (
  value: string,
  inheritedKind: MediaKind = 'unknown',
): MediaDescriptor[] => {
  const tokens = value
    .split(/[,;]+/)
    .map(token => token.trim())
    .filter(Boolean);
  let kind: MediaKind = inheritedKind;
  const descriptors: MediaDescriptor[] = [];
  let lastDescriptor = -1;
  const updateLastDescriptor = (fields: Partial<MediaDescriptor>): void => {
    if (lastDescriptor >= 0) {
      descriptors[lastDescriptor] = {
        ...descriptors[lastDescriptor],
        ...fields,
      };
    }
  };
  for (const token of tokens) {
    const tokenKind = kindFromText(token);
    if (tokenKind !== 'unknown') {
      kind = tokenKind;
    }
    const codec = firstCodec(token);
    if (codec !== 'unknown') {
      descriptors.push({kind, codec});
      lastDescriptor = descriptors.length - 1;
      continue;
    }
    const dimensions = /^(\d{1,5})x(\d{1,5})$/i.exec(token);
    if (dimensions) {
      updateLastDescriptor({
        width: Number(dimensions[1]),
        height: Number(dimensions[2]),
      });
      continue;
    }
    const frameRate = /^(\d{1,4}(?:\.\d+)?)\s*fps$/i.exec(token);
    if (frameRate) {
      updateLastDescriptor({frameRate: Number(frameRate[1])});
      continue;
    }
    const bitDepth = /^(\d{1,2})\s*(?:-|\s)?bit(?:depth)?$/i.exec(token);
    if (bitDepth) {
      updateLastDescriptor({bitDepth: Number(bitDepth[1])});
      continue;
    }
    const level = /^level[\s:=_-]*(\d+(?:\.\d+)?)$/i.exec(token);
    if (level) {
      updateLastDescriptor({level: Number(level[1])});
      continue;
    }
  }
  return descriptors.length > 0 ? descriptors : [{kind, codec: 'unknown'}];
};

const descriptorsFromValue = (
  value: unknown,
  inheritedKind: MediaKind = 'unknown',
  depth = 0,
): MediaDescriptor[] => {
  if (depth > MAX_METADATA_DEPTH) {
    return [UNKNOWN_DESCRIPTOR];
  }
  if (typeof value === 'string') {
    return descriptorsFromMediaText(value, inheritedKind);
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_METADATA_DESCRIPTORS)
      .flatMap(item => descriptorsFromValue(item, inheritedKind, depth + 1))
      .slice(0, MAX_METADATA_DESCRIPTORS);
  }
  const record = asRecord(value);
  if (!record) {
    return [];
  }
  const descriptor = descriptorFromRecord(record, inheritedKind);
  const nested = ['medias', 'media', 'tracks', 'video', 'audio'].flatMap(
    key => {
      if (record[key] === undefined) {
        return [];
      }
      const declaredKind = kindFromText(
        stringValue(record, 'type') ||
          stringValue(record, 'kind') ||
          stringValue(record, 'media'),
      );
      const nestedKind =
        key === 'video'
          ? 'video'
          : key === 'audio'
          ? 'audio'
          : declaredKind !== 'unknown'
          ? declaredKind
          : inheritedKind;
      return descriptorsFromValue(record[key], nestedKind, depth + 1);
    },
  );
  return nested.length > 0
    ? nested.slice(0, MAX_METADATA_DESCRIPTORS)
    : [descriptor];
};

/**
 * Parses the small, public shape of go2rtc stream metadata. Producer URLs and
 * all fields not explicitly listed here are deliberately never copied.
 */
export const parseStreamMetadata = (
  input: unknown,
  inputIsJson = false,
): StreamMetadata => {
  if (
    typeof input === 'string' &&
    utf8ByteLength(input) > MAX_STREAM_METADATA_BYTES
  ) {
    return emptyMetadata(true);
  }
  let value: unknown = input;
  if (inputIsJson) {
    if (typeof input !== 'string') {
      return emptyMetadata(true);
    }
    try {
      value = JSON.parse(input) as unknown;
    } catch {
      return emptyMetadata(true);
    }
  }
  const root = asRecord(value);
  if (!root) {
    return emptyMetadata(true);
  }

  const descriptors: MediaDescriptor[] = [];
  for (const [key, kind] of [
    ['producers', 'unknown'],
    ['streams', 'unknown'],
    ['medias', 'unknown'],
    ['media', 'unknown'],
    ['video', 'video'],
    ['audio', 'audio'],
  ] as const) {
    if (root[key] !== undefined) {
      descriptors.push(...descriptorsFromValue(root[key], kind as MediaKind));
      if (descriptors.length >= MAX_METADATA_DESCRIPTORS) {
        break;
      }
    }
  }
  descriptors.splice(MAX_METADATA_DESCRIPTORS);
  if (descriptors.length === 0) {
    descriptors.push(descriptorFromRecord(root));
  }
  const videoCodecs = new Set<CodecFamily>([
    'h264',
    'h265',
    'vp8',
    'vp9',
    'av1',
  ]);
  const audioCodecs = new Set<CodecFamily>(['aac', 'opus', 'pcma', 'pcmu']);
  const video = descriptors.filter(
    descriptor =>
      descriptor.kind === 'video' && videoCodecs.has(descriptor.codec),
  );
  const audio = descriptors.filter(
    descriptor =>
      descriptor.kind === 'audio' && audioCodecs.has(descriptor.codec),
  );
  const unknown = descriptors.filter(
    descriptor =>
      descriptor.codec === 'unknown' ||
      descriptor.kind === 'unknown' ||
      (descriptor.kind === 'video' && !videoCodecs.has(descriptor.codec)) ||
      (descriptor.kind === 'audio' && !audioCodecs.has(descriptor.codec)),
  );
  return {
    video,
    audio,
    unknown,
    malformed: false,
    source: 'protected-go2rtc-metadata',
    transport: 'unknown',
  };
};

export const parseStreamMetadataJson = (body: string): StreamMetadata =>
  parseStreamMetadata(body, true);

export const deviceCodecCapabilityFromNative = (
  value: unknown,
): DeviceCodecCapability => {
  const record = asRecord(value);
  if (!record) {
    return {
      codec: 'h265',
      availability: 'unknown',
      hardware: 'unknown',
      software: 'unknown',
      profiles: [],
    };
  }
  const availability =
    record.hevcDecoderAvailable === true
      ? 'supported'
      : record.hevcDecoderAvailable === false
      ? 'unsupported'
      : 'unknown';
  const classification = (
    key: string,
  ): 'supported' | 'unsupported' | 'unknown' =>
    record[key] === true
      ? 'supported'
      : record[key] === false
      ? 'unsupported'
      : 'unknown';
  const profiles = Array.isArray(record.profileLevels)
    ? record.profileLevels.flatMap(item => {
        const profile = asRecord(item);
        const nativeProfile = profile?.profile;
        const level = profile?.level;
        return typeof nativeProfile === 'number' &&
          Number.isFinite(nativeProfile) &&
          nativeProfile >= 0 &&
          typeof level === 'number' &&
          Number.isFinite(level) &&
          level >= 0
          ? [{profile: nativeProfile, level}]
          : [];
      })
    : [];
  const uniqueProfiles = Array.from(
    new Map<string, {profile: number; level: number}>(
      profiles.map(
        profile =>
          [`${profile.profile}:${profile.level}`, profile] as [
            string,
            {profile: number; level: number},
          ],
      ),
    ).values(),
  ).sort(
    (left, right) => left.profile - right.profile || left.level - right.level,
  );
  const finiteCapability = (key: string): number | undefined => {
    const capability = record[key];
    return typeof capability === 'number' &&
      Number.isFinite(capability) &&
      capability >= 0 &&
      capability <= Number.MAX_SAFE_INTEGER
      ? capability
      : undefined;
  };
  return {
    codec: 'h265',
    availability,
    hardware: classification('hevcHardwareDecoderAvailable'),
    software: classification('hevcSoftwareDecoderAvailable'),
    profiles: uniqueProfiles,
    ...(finiteCapability('maxWidth') !== undefined
      ? {maxWidth: finiteCapability('maxWidth')}
      : {}),
    ...(finiteCapability('maxHeight') !== undefined
      ? {maxHeight: finiteCapability('maxHeight')}
      : {}),
    ...(finiteCapability('maxFrameRate') !== undefined
      ? {maxFrameRate: finiteCapability('maxFrameRate')}
      : {}),
  };
};

const nativeCodecModule = ():
  | {
      probeMediaCodecCapabilities?: () => Promise<unknown>;
      isProtectedMseProbeEnabled?: () => boolean;
      probeProtectedMse?: (
        profileId: string,
        streamName: string,
      ) => Promise<unknown>;
    }
  | undefined =>
  NativeModules.ClientCertModule as
    | {probeMediaCodecCapabilities?: () => Promise<unknown>}
    | undefined;

export const probeDeviceCodecCapability =
  async (): Promise<DeviceCodecCapability> => {
    const native = nativeCodecModule();
    if (Platform.OS !== 'android' || !native?.probeMediaCodecCapabilities) {
      return deviceCodecCapabilityFromNative(undefined);
    }
    const result = await native.probeMediaCodecCapabilities();
    return deviceCodecCapabilityFromNative(result);
  };

export const protectedMseProbeEnabled = (): boolean => {
  const native = nativeCodecModule();
  return Platform.OS === 'android' &&
    native?.isProtectedMseProbeEnabled?.() === true;
};

export const probeProtectedMseContract = async (
  server: Server,
  streamName: string,
): Promise<ProtectedMseProbeResult> => {
  const native = nativeCodecModule();
  if (
    Platform.OS !== 'android' ||
    native?.isProtectedMseProbeEnabled?.() !== true ||
    !native.probeProtectedMse
  ) {
    throw new Error('The protected MSE probe is disabled');
  }
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(streamName)) {
    throw new Error('The protected MSE stream name is invalid');
  }
  const profileId = await protectedMediaProfileId(server);
  const value = asRecord(await native.probeProtectedMse(profileId, streamName));
  const bool = (key: string): boolean => value?.[key] === true;
  const bytesObserved = value?.bytesObserved;
  if (
    !value ||
    typeof bytesObserved !== 'number' ||
    !Number.isFinite(bytesObserved) ||
    bytesObserved < 0 ||
    bytesObserved > 2 * 1024 * 1024
  ) {
    throw new Error('The protected MSE probe returned an invalid result');
  }
  return {
    mimeH265: bool('mimeH265'),
    ftyp: bool('ftyp'),
    moov: bool('moov'),
    moof: bool('moof'),
    mdat: bool('mdat'),
    bytesObserved,
  };
};

const hasCodec = (
  metadata: StreamMetadata,
  codec: CodecFamily,
): MediaDescriptor | undefined =>
  [...metadata.video, ...metadata.audio].find(
    descriptor => descriptor.codec === codec,
  );

const constraintsMatch = (
  descriptor: MediaDescriptor,
  device: DeviceCodecCapability,
): 'supported' | 'unsupported' | 'unknown' => {
  if (
    descriptor.width !== undefined &&
    (device.maxWidth === undefined || descriptor.width > device.maxWidth)
  ) {
    return device.maxWidth === undefined ? 'unknown' : 'unsupported';
  }
  if (
    descriptor.height !== undefined &&
    (device.maxHeight === undefined || descriptor.height > device.maxHeight)
  ) {
    return device.maxHeight === undefined ? 'unknown' : 'unsupported';
  }
  if (
    descriptor.frameRate !== undefined &&
    (device.maxFrameRate === undefined ||
      descriptor.frameRate > device.maxFrameRate)
  ) {
    return device.maxFrameRate === undefined ? 'unknown' : 'unsupported';
  }
  if (descriptor.profile !== undefined && device.profiles.length > 0) {
    const numericProfile =
      typeof descriptor.profile === 'number'
        ? descriptor.profile
        : Number(descriptor.profile);
    if (!Number.isFinite(numericProfile)) {
      return 'unknown';
    }
    const matchingProfiles = device.profiles.filter(
      profile => profile.profile === numericProfile,
    );
    if (matchingProfiles.length === 0) {
      return 'unsupported';
    }
    const descriptorLevel = descriptor.level;
    if (
      descriptorLevel !== undefined &&
      !matchingProfiles.some(profile => profile.level >= descriptorLevel)
    ) {
      return 'unsupported';
    }
  }
  return 'supported';
};

export const decideTransportEligibility = (input: {
  metadata: StreamMetadata;
  device: DeviceCodecCapability;
  webRtc?: WebRtcCodecEligibility;
  experimentEnabled?: boolean;
}): TransportEligibility => {
  const webRtc: WebRtcCodecEligibility = input.webRtc || {
    h264: true,
    vp8: true,
    vp9: true,
    h265: false,
  };
  if (input.metadata.malformed) {
    return {
      decision: 'unknown',
      codec: 'unknown',
      reason: 'malformed-metadata',
      existingWebRtcEligible: false,
      experimentEligible: false,
      transport: 'existing-fallback',
    };
  }
  const descriptor =
    hasCodec(input.metadata, 'h264') ||
    hasCodec(input.metadata, 'vp8') ||
    hasCodec(input.metadata, 'vp9') ||
    hasCodec(input.metadata, 'h265');
  if (!descriptor) {
    return {
      decision: 'unknown',
      codec: 'unknown',
      reason: 'not-advertised',
      existingWebRtcEligible: false,
      experimentEligible: false,
      transport: 'existing-fallback',
    };
  }
  if (descriptor.codec !== 'h265') {
    const eligible =
      descriptor.codec === 'h264'
        ? webRtc.h264
        : descriptor.codec === 'vp8'
        ? webRtc.vp8
        : webRtc.vp9;
    return {
      decision: eligible ? 'supported' : 'unknown',
      codec: descriptor.codec,
      reason: eligible ? 'advertised' : 'webrtc-unproven',
      existingWebRtcEligible: eligible,
      experimentEligible: false,
      transport: eligible ? 'existing-webrtc' : 'existing-fallback',
    };
  }
  if (input.device.availability === 'unknown') {
    return {
      decision: 'unknown',
      codec: 'h265',
      reason: 'device-unknown',
      existingWebRtcEligible: false,
      experimentEligible: false,
      transport: 'existing-fallback',
    };
  }
  if (input.device.availability === 'unsupported') {
    return {
      decision: 'unsupported',
      codec: 'h265',
      reason: 'device-unsupported',
      existingWebRtcEligible: false,
      experimentEligible: false,
      transport: 'existing-fallback',
    };
  }
  const constraints = constraintsMatch(descriptor, input.device);
  if (constraints === 'unsupported') {
    return {
      decision: 'unsupported',
      codec: 'h265',
      reason: 'constraint-mismatch',
      existingWebRtcEligible: false,
      experimentEligible: false,
      transport: 'existing-fallback',
    };
  }
  if (constraints === 'unknown') {
    return {
      decision: 'unknown',
      codec: 'h265',
      reason: 'constraint-unknown',
      existingWebRtcEligible: false,
      experimentEligible: false,
      transport: 'existing-fallback',
    };
  }
  const experimentEligible = input.experimentEnabled === true;
  return {
    decision: experimentEligible ? 'supported' : 'unknown',
    codec: 'h265',
    reason: experimentEligible ? 'device-supported' : 'webrtc-unproven',
    existingWebRtcEligible: false,
    experimentEligible,
    transport: 'existing-fallback',
  };
};

export const planProtectedLiveStreams = (input: {
  streams: readonly LiveStreamMetadata[];
  device: DeviceCodecCapability;
  selection: LiveStreamSelection;
  mseEnabled: boolean;
  webRtc?: WebRtcCodecEligibility;
}): PlannedLiveStream[] => {
  const planned: PlannedLiveStream[] = [];
  input.streams.forEach(stream => {
    if (!stream.metadata) {
      return;
    }
    const eligibility = decideTransportEligibility({
      metadata: stream.metadata,
      device: input.device,
      webRtc: input.webRtc,
      experimentEnabled: input.mseEnabled,
    });
    if (eligibility.codec === 'h265' && eligibility.experimentEligible) {
      planned.push({name: stream.name, codec: 'h265', transport: 'mse'});
      return;
    }
    if (eligibility.existingWebRtcEligible) {
      planned.push({
        name: stream.name,
        codec: eligibility.codec,
        transport: 'webrtc',
      });
    }
  });
  const mseCandidates = planned.filter(candidate => candidate.transport === 'mse');
  const webRtcCandidates = planned.filter(
    candidate => candidate.transport === 'webrtc',
  );
  const selection = input.selection;
  if (selection.mode === 'manual') {
    const selected = planned.find(
      candidate => candidate.name === selection.streamName,
    );
    return selected
      ? [
          selected,
          ...webRtcCandidates.filter(candidate => candidate !== selected),
        ]
      : webRtcCandidates;
  }
  return [...mseCandidates, ...webRtcCandidates];
};

export const fetchStreamMetadata = async (
  server: Server,
  streamName: string,
): Promise<StreamMetadata> => {
  if (
    typeof streamName !== 'string' ||
    streamName.trim().length === 0 ||
    streamName.length > 128 ||
    [...streamName].some(
      character =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  ) {
    throw new Error('The stream name is invalid');
  }
  let encodedStreamName: string;
  try {
    encodedStreamName = encodeURIComponent(streamName);
  } catch {
    throw new Error('The stream name is invalid');
  }
  const baseUrl = buildServerApiUrl(server);
  if (!baseUrl) {
    throw new Error('The configured server endpoint is invalid');
  }
  const response = await executeServerRequest(
    server,
    `${baseUrl}/go2rtc/streams/${encodedStreamName}`,
    {method: 'GET', headers: authorizationHeader(server)},
  );
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Stream metadata returned HTTP ${response.status}`);
  }
  const body = await response.text();
  if (
    typeof body !== 'string' ||
    utf8ByteLength(body) > MAX_STREAM_METADATA_BYTES
  ) {
    return emptyMetadata(true);
  }
  const contentType = Object.entries(response.headers || {}).find(
    ([name]) => name.toLowerCase() === 'content-type',
  )?.[1];
  if (
    (contentType !== undefined && typeof contentType !== 'string') ||
    (typeof contentType === 'string' && contentType.length > 256)
  ) {
    return emptyMetadata(true);
  }
  if (
    contentType &&
    !/^(?:application\/json|application\/[\w.+-]*\+json)(?:\s*;|$)/i.test(
      contentType.trim(),
    )
  ) {
    return emptyMetadata(true);
  }
  return parseStreamMetadataJson(body);
};
