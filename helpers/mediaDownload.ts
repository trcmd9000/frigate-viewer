import RNBlobUtil from 'react-native-blob-util';
import {Platform} from 'react-native';
import type {Server} from '../store/settings';
import {
  HttpStatusError,
  httpClientWithCert,
  missingClientCertificateError,
} from './httpWithClientCert';
import {
  authorizationHeader,
  loginServer,
  profileTransportOptions,
  requestServerIdentity,
} from './rest';
import {
  nativeRouteCertificatePin,
  serverIdentity,
  serverUsesClientCertificate,
} from './serverIdentity';
import {assertRemoteHttps} from './remoteHttpPolicy';

export const MEDIA_CACHE_DIRECTORY = 'frigate-media';
export const MAX_MEDIA_BYTES = 256 * 1024 * 1024;
export const MAX_IMAGE_MEDIA_BYTES = 32 * 1024 * 1024;
export const MAX_MEDIA_FILES = 40;
export const MEDIA_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const MEDIA_DISPLAY_HANDOFF_GRACE_MS = 1000;
export const MEDIA_SHARE_GRACE_MS = 5 * 60 * 1000;
export const MAX_CONCURRENT_MEDIA_DOWNLOADS = 4;

const managedName =
  /^(?:fetch|media|download)-[A-Za-z0-9_-]+(?:\.[A-Za-z0-9]{1,8})?$/;
const temporaryMediaName = /^download-(?:(\d+)-)?([A-Za-z0-9_-]+)\.part$/;

const activeNativeTemporary = (name: string): boolean => {
  const match = temporaryMediaName.exec(name);
  return match?.[1] !== undefined && mediaReservations.has(Number(match[1]));
};

const mediaCacheDirectory = () =>
  `${RNBlobUtil.fs.dirs.CacheDir}/${MEDIA_CACHE_DIRECTORY}`;

export const isManagedMediaPath = (path: string): boolean => {
  if (typeof path !== 'string' || !path) {
    return false;
  }
  const directory = mediaCacheDirectory().replace(/\\/g, '/');
  const normalizedPath = path.replace(/\\/g, '/');
  if (!normalizedPath.startsWith(`${directory}/`)) {
    return false;
  }
  const name = normalizedPath.slice(directory.length + 1);
  return !name.includes('/') && managedName.test(name);
};

/**
 * HTML and JSON are authentication/error responses, not media. Unknown
 * content types remain valid because Frigate installations may use custom
 * media types.
 */
export const isUnexpectedMediaContentType = (
  contentType: string | undefined,
): boolean => {
  if (!contentType) {
    return false;
  }
  return (
    contentType === 'application/json' ||
    contentType === 'application/problem+json' ||
    contentType === 'text/html' ||
    contentType.startsWith('text/')
  );
};

type MediaLeaseKind = 'display' | 'share';

interface MediaLeaseCounts {
  display: number;
  share: number;
}

const activeLeases = new Map<string, MediaLeaseCounts>();
const releasedAt = new Map<string, number>();
const releasedGrace = new Map<string, number>();
const releaseTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingPaths = new Set<string>();
interface MediaReservation {
  id: number;
  maxBytes: number;
}

const mediaReservations = new Map<number, MediaReservation>();
let nextReservationId = 1;
let admissionQueue: Promise<void> = Promise.resolve();
let mediaDirectoryInitialization: Promise<void> | undefined;

/**
 * Keep the complete admission snapshot/calculation and every reservation
 * transition in one serialized critical section. In particular, a commit
 * cannot remove its reservation while another admission is between its
 * filesystem snapshot and capacity calculation.
 */
const enqueueAdmission = <T>(operation: () => Promise<T> | T): Promise<T> => {
  const run = admissionQueue.then(operation);
  admissionQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
};

export const getMediaReservationCount = (): number => mediaReservations.size;

export const getReservedMediaBytes = (): number =>
  [...mediaReservations.values()].reduce(
    (total, reservation) => total + reservation.maxBytes,
    0,
  );

export const getMediaLeaseCount = (path: string): number =>
  (activeLeases.get(path)?.display || 0) + (activeLeases.get(path)?.share || 0);

export const retainDownloadedMedia = (
  path: string,
  kind: MediaLeaseKind = 'display',
): void => {
  if (!isManagedMediaPath(path)) {
    return;
  }
  const leases = activeLeases.get(path) || {display: 0, share: 0};
  leases[kind] += 1;
  activeLeases.set(path, leases);
  releasedAt.delete(path);
  const timer = releaseTimers.get(path);
  if (timer) {
    clearTimeout(timer);
    releaseTimers.delete(path);
  }
};

export const releaseDownloadedMedia = async (
  path?: string,
  kind: MediaLeaseKind = 'display',
): Promise<void> => {
  if (!path || !isManagedMediaPath(path)) {
    return;
  }
  const leases = activeLeases.get(path);
  if (!leases || leases[kind] === 0) {
    return;
  }
  leases[kind] -= 1;
  releasedGrace.set(
    path,
    Math.max(
      releasedGrace.get(path) || 0,
      kind === 'share' ? MEDIA_SHARE_GRACE_MS : MEDIA_DISPLAY_HANDOFF_GRACE_MS,
    ),
  );
  const count = leases.display + leases.share;
  if (count > 0) {
    activeLeases.set(path, leases);
    return;
  }
  if (count === 0) {
    activeLeases.delete(path);
    releasedAt.set(path, Date.now());
    const grace = releasedGrace.get(path) || 0;
    releasedGrace.set(path, grace);
    if (!releaseTimers.has(path)) {
      const timer = setTimeout(() => {
        releaseTimers.delete(path);
        void cleanupMediaCache().catch(() => undefined);
      }, grace);
      if (
        typeof timer === 'object' &&
        timer !== null &&
        'unref' in timer &&
        typeof timer.unref === 'function'
      ) {
        timer.unref();
      }
      releaseTimers.set(path, timer);
    }
  }
};

const clearReleasedState = (path: string): void => {
  releasedAt.delete(path);
  releasedGrace.delete(path);
  const timer = releaseTimers.get(path);
  if (timer) {
    clearTimeout(timer);
    releaseTimers.delete(path);
  }
};

const isMediaPathProtected = (path: string, protectedPath?: string): boolean =>
  path === protectedPath ||
  pendingPaths.has(path) ||
  getMediaLeaseCount(path) > 0;

const isReleaseGraceActive = (path: string, now: number): boolean => {
  const time = releasedAt.get(path);
  const grace = releasedGrace.get(path) || 0;
  return time !== undefined && now - time < grace;
};

const cleanupMediaCacheNow = async (
  protectedPath?: string,
  requiredFileSlots = 0,
  requiredBytes = 0,
): Promise<void> => {
  const directory = mediaCacheDirectory();
  if (!(await RNBlobUtil.fs.exists(directory))) {
    return;
  }

  const now = Date.now();
  const entries = await RNBlobUtil.fs.ls(directory);
  const files: Array<{
    path: string;
    size: number;
    lastModified: number;
    name: string;
  }> = [];

  for (const name of entries) {
    if (!managedName.test(name)) {
      continue;
    }
    const path = `${directory}/${name}`;
    let stat: {size: number; lastModified: number};
    try {
      stat = await RNBlobUtil.fs.stat(path);
    } catch {
      // A file can disappear between ls and stat when a stale handoff is
      // released. Treat that race as already-cleaned, but fail closed for
      // files that still exist or whose existence cannot be checked.
      let exists: boolean;
      try {
        exists = await RNBlobUtil.fs.exists(path);
      } catch {
        throw new Error(
          'Media cache metadata is unavailable; refusing to admit new media',
        );
      }
      if (!exists) {
        continue;
      }
      throw new Error(
        'Media cache metadata is unavailable; refusing to admit new media',
      );
    }
    try {
      const size = Number(stat.size);
      const lastModified = Number(stat.lastModified);
      if (
        !Number.isFinite(size) ||
        size < 0 ||
        !Number.isFinite(lastModified) ||
        lastModified < 0
      ) {
        throw new Error('Media cache metadata is invalid');
      }
      const isActiveTemporary = activeNativeTemporary(name);
      if (now - lastModified > MEDIA_MAX_AGE_MS) {
        if (
          !isMediaPathProtected(path, protectedPath) &&
          !isReleaseGraceActive(path, now) &&
          !isActiveTemporary
        ) {
          try {
            await RNBlobUtil.fs.unlink(path);
            clearReleasedState(path);
            continue;
          } catch {
            // Keep the successfully-statted file in accounting below.
          }
        }
      }
      // Native writers keep download-*.part files until JS validates and
      // renames them. Pending output and its reservation already account for
      // its bounded size, so neither state must be double-counted.
      if (isActiveTemporary || pendingPaths.has(path)) {
        continue;
      }
      files.push({
        path,
        size,
        lastModified,
        name,
      });
    } catch {
      throw new Error(
        'Media cache metadata is unavailable; refusing to admit new media',
      );
    }
  }

  files.sort((left, right) => left.lastModified - right.lastModified);
  let totalBytes = files.reduce((total, file) => total + file.size, 0);
  const reservedBytes = getReservedMediaBytes();
  let remainingFiles = files.length + mediaReservations.size;
  totalBytes += reservedBytes;
  while (
    (remainingFiles + requiredFileSlots > MAX_MEDIA_FILES ||
      totalBytes + requiredBytes > MAX_MEDIA_BYTES) &&
    files.length > 0
  ) {
    const oldest = files.shift();
    if (!oldest) {
      break;
    }
    if (
      isMediaPathProtected(oldest.path, protectedPath) ||
      (isReleaseGraceActive(oldest.path, now) &&
        requiredFileSlots === 0 &&
        requiredBytes === 0)
    ) {
      continue;
    }
    try {
      await RNBlobUtil.fs.unlink(oldest.path);
      clearReleasedState(oldest.path);
      remainingFiles -= 1;
      totalBytes -= oldest.size;
    } catch {
      // Cleanup is best effort and must not interrupt a media request.
    }
  }
  if (
    remainingFiles + requiredFileSlots > MAX_MEDIA_FILES ||
    totalBytes + requiredBytes > MAX_MEDIA_BYTES
  ) {
    throw new Error(
      `Media cache is full (${remainingFiles} files, ${totalBytes} bytes, ` +
        `${mediaReservations.size} reservations; requires ` +
        `${requiredFileSlots} file and ${requiredBytes} bytes)`,
    );
  }
};

let cleanupQueue: Promise<void> = Promise.resolve();

export const cleanupMediaCache = async (
  protectedPath?: string,
  requiredFileSlots = 0,
  requiredBytes = 0,
): Promise<void> => {
  const run = cleanupQueue.then(() =>
    cleanupMediaCacheNow(protectedPath, requiredFileSlots, requiredBytes),
  );
  cleanupQueue = run.catch(() => undefined);
  return run;
};

const removePathImmediately = async (path: string): Promise<void> => {
  if (!isManagedMediaPath(path) || isMediaPathProtected(path)) {
    return;
  }
  clearReleasedState(path);
  try {
    if (await RNBlobUtil.fs.exists(path)) {
      if (isMediaPathProtected(path)) {
        return;
      }
      await RNBlobUtil.fs.unlink(path);
    }
  } catch {
    // Request errors are reported by callers; cleanup remains best effort.
  }
};

const mediaExtensionForContentType = (contentType: string): string => {
  const normalized = contentType.split(';', 1)[0].trim().toLowerCase();
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') {
    return 'jpg';
  }
  if (normalized === 'image/png') {
    return 'png';
  }
  if (normalized === 'image/webp') {
    return 'webp';
  }
  if (normalized === 'image/gif') {
    return 'gif';
  }
  if (normalized === 'video/mp4' || normalized === 'application/mp4') {
    return 'mp4';
  }
  if (normalized === 'video/webm') {
    return 'webm';
  }
  if (normalized === 'video/quicktime') {
    return 'mov';
  }
  return 'bin';
};

export const removeDownloadedMedia = async (path?: string): Promise<void> => {
  if (!path) {
    return;
  }
  await enqueueAdmission(() => removePathImmediately(path));
};

interface MediaCacheUsage {
  fileCount: number;
  totalBytes: number;
}

const readMediaCacheUsage = async (): Promise<MediaCacheUsage> => {
  const directory = mediaCacheDirectory();
  if (!(await RNBlobUtil.fs.exists(directory))) {
    return {fileCount: 0, totalBytes: 0};
  }
  const entries = await RNBlobUtil.fs.ls(directory);
  let fileCount = 0;
  let totalBytes = 0;
  for (const name of entries) {
    if (!managedName.test(name)) {
      continue;
    }
    const path = `${directory}/${name}`;
    if (activeNativeTemporary(name) || pendingPaths.has(path)) {
      continue;
    }
    let stat: {size: number};
    try {
      stat = await RNBlobUtil.fs.stat(path);
    } catch {
      let exists: boolean;
      try {
        exists = await RNBlobUtil.fs.exists(path);
      } catch {
        throw new Error(
          'Media cache metadata is unavailable; refusing to admit new media',
        );
      }
      if (!exists) {
        continue;
      }
      throw new Error(
        'Media cache metadata is unavailable; refusing to admit new media',
      );
    }
    const size = Number(stat.size);
    if (!Number.isFinite(size) || size < 0) {
      throw new Error(
        'Media cache metadata is unavailable; refusing to admit new media',
      );
    }
    fileCount += 1;
    totalBytes += size;
  }
  return {fileCount, totalBytes};
};

const pendingDownloadWaiters: Array<() => void> = [];
let activeDownloads = 0;

const acquireDownloadSlot = async (): Promise<void> => {
  if (activeDownloads < MAX_CONCURRENT_MEDIA_DOWNLOADS) {
    activeDownloads += 1;
    return;
  }
  await new Promise<void>(resolve => {
    pendingDownloadWaiters.push(() => {
      activeDownloads += 1;
      resolve();
    });
  });
};

const releaseDownloadSlot = (): void => {
  activeDownloads -= 1;
  pendingDownloadWaiters.shift()?.();
};

const requestedMediaBytes = (url: string): number => {
  const path = url.split(/[?#]/, 1)[0].toLowerCase();
  if (/\.(?:gif|jpe?g|png|webp)$/.test(path)) {
    return MAX_IMAGE_MEDIA_BYTES;
  }
  return MAX_MEDIA_BYTES;
};

const mediaServerIdentity = (server: Server): string =>
  typeof requestServerIdentity === 'function'
    ? requestServerIdentity(server)
    : serverIdentity(
        server,
        serverUsesClientCertificate(server)
          ? server.clientCertConfig?.alias
          : undefined,
      );

const reserveMediaCapacity = async (
  requestedBytes: number,
): Promise<MediaReservation> => {
  return enqueueAdmission(async () => {
    // Make room for a bounded reservation without requiring the full clip
    // maximum up front. Inactive display files may be evicted under pressure.
    await cleanupMediaCache(undefined, 1, 1);
    const usage = await readMediaCacheUsage();
    const reservedBytes = getReservedMediaBytes();
    const availableFiles =
      MAX_MEDIA_FILES - usage.fileCount - mediaReservations.size;
    const availableBytes = MAX_MEDIA_BYTES - usage.totalBytes - reservedBytes;
    const maxBytes = Math.floor(Math.min(requestedBytes, availableBytes));
    if (availableFiles <= 0 || maxBytes <= 0) {
      throw new Error(
        'Media cache is full; release active media before downloading',
      );
    }
    const reservation = {id: nextReservationId++, maxBytes};
    mediaReservations.set(reservation.id, reservation);
    return reservation;
  });
};

const releaseMediaCapacity = async (
  reservation: MediaReservation,
): Promise<void> => {
  await enqueueAdmission(() => {
    mediaReservations.delete(reservation.id);
  });
};

const commitMediaReservation = (
  reservation: MediaReservation,
  path: string,
  size: number,
): Promise<void> => {
  return enqueueAdmission(() => {
    if (mediaReservations.get(reservation.id) !== reservation) {
      throw new Error('Media reservation was lost');
    }
    if (size > reservation.maxBytes) {
      throw new Error('Media download exceeded its reserved byte budget');
    }
    pendingPaths.delete(path);
    mediaReservations.delete(reservation.id);
  });
};

const finalizeNativeMedia = async (
  reservation: MediaReservation,
  response: {statusCode: number; path: string; contentType?: string},
): Promise<string> => {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new HttpStatusError(
      response.statusCode,
      `Media download returned HTTP ${response.statusCode}`,
    );
  }
  if (!isManagedMediaPath(response.path)) {
    throw new Error('Media download returned an invalid local path');
  }
  const name = response.path.slice(response.path.lastIndexOf('/') + 1);
  const temporaryMatch = temporaryMediaName.exec(name);
  if (!temporaryMatch) {
    throw new Error('Media download returned an invalid temporary path');
  }
  const finalPath = `${mediaCacheDirectory()}/media-${
    temporaryMatch[2]
  }.${mediaExtensionForContentType(response.contentType || '')}`;

  pendingPaths.add(response.path);
  pendingPaths.add(finalPath);
  try {
    if (isUnexpectedMediaContentType(response.contentType)) {
      throw new Error('Media download returned an unexpected content type');
    }
    if (!(await RNBlobUtil.fs.exists(response.path))) {
      throw new Error('Media download did not create a local file');
    }
    const stat = await RNBlobUtil.fs.stat(response.path);
    const size = Number(stat.size) || 0;
    if (!size) {
      throw new Error('Media download returned an empty body');
    }
    if (size > reservation.maxBytes) {
      throw new Error('Media download exceeded its reserved byte budget');
    }
    await RNBlobUtil.fs.mv(response.path, finalPath);
    await commitMediaReservation(reservation, finalPath, size);
    return finalPath;
  } catch (error) {
    pendingPaths.delete(response.path);
    pendingPaths.delete(finalPath);
    await removePathImmediately(response.path);
    await removePathImmediately(finalPath);
    await releaseMediaCapacity(reservation);
    throw error;
  } finally {
    pendingPaths.delete(response.path);
    pendingPaths.delete(finalPath);
  }
};

const headerValue = (
  headers: Record<string, string> | undefined,
  name: string,
): string | undefined => {
  const entry = Object.entries(headers || {}).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return entry?.[1];
};

const ensureMediaCacheDirectory = (): Promise<void> => {
  if (!mediaDirectoryInitialization) {
    const directory = mediaCacheDirectory();
    mediaDirectoryInitialization = (async () => {
      if (!(await RNBlobUtil.fs.exists(directory))) {
        await RNBlobUtil.fs.mkdir(directory);
      }
    })().catch(async error => {
      mediaDirectoryInitialization = undefined;
      if (await RNBlobUtil.fs.exists(directory)) {
        return;
      }
      throw error;
    });
  }
  return mediaDirectoryInitialization;
};

const downloadMediaWithBlobUtil = async (
  server: Server,
  url: string,
  reservation: MediaReservation,
): Promise<string> => {
  const directory = mediaCacheDirectory();
  await ensureMediaCacheDirectory();
  const temporaryPath = `${directory}/download-${
    reservation.id
  }-ios-${reservation.id}-${Date.now().toString(36)}.part`;

  try {
    let budgetExceeded = false;
    const request = RNBlobUtil.config({
      fileCache: true,
      path: temporaryPath,
    }).fetch('GET', url, authorizationHeader(server));
    request.progress({interval: 0}, (received, total) => {
      if (
        received > reservation.maxBytes ||
        (total > 0 && total > reservation.maxBytes)
      ) {
        budgetExceeded = true;
        request.cancel();
      }
    });
    let response;
    try {
      response = await request;
    } catch (error) {
      if (budgetExceeded) {
        throw new Error('Media download exceeded its reserved byte budget');
      }
      throw error;
    }
    const info = response.info();
    const contentType = headerValue(info.headers, 'content-type');
    const contentLength = Number(headerValue(info.headers, 'content-length'));
    if (
      budgetExceeded ||
      (Number.isFinite(contentLength) &&
        contentLength > reservation.maxBytes)
    ) {
      throw new Error('Media download exceeded its reserved byte budget');
    }
    if (
      info.status >= 200 &&
      info.status < 300 &&
      isUnexpectedMediaContentType(contentType)
    ) {
      throw new Error('Media download returned an unexpected content type');
    }
    return finalizeNativeMedia(reservation, {
      statusCode: info.status,
      path: temporaryPath,
      contentType,
    });
  } catch (error) {
    await removePathImmediately(temporaryPath);
    throw error;
  }
};

const downloadMediaOnce = async (
  server: Server,
  url: string,
  reservation: MediaReservation,
): Promise<string> => {
  if (serverUsesClientCertificate(server)) {
    const alias = server.clientCertConfig?.alias;
    if (typeof alias !== 'string' || !alias.trim()) {
      throw missingClientCertificateError();
    }
    const response = await httpClientWithCert.download(url, {
      headers: authorizationHeader(server),
      ...profileTransportOptions(server),
      clientCertAlias: alias,
      clientCertServerIdentity: mediaServerIdentity(server),
      maxBytes: reservation.maxBytes,
      mediaReservationId: reservation.id,
      serverCertificatePin:
        nativeRouteCertificatePin(server, 'remote'),
    });
    return finalizeNativeMedia(reservation, response);
  }

  if (Platform.OS === 'android') {
    const response = await httpClientWithCert.downloadWithoutClientCert(url, {
      headers: authorizationHeader(server),
      ...profileTransportOptions(server),
      clientCertServerIdentity: mediaServerIdentity(server),
      maxBytes: reservation.maxBytes,
      mediaReservationId: reservation.id,
      serverCertificatePin:
        nativeRouteCertificatePin(server, 'remote'),
    });
    return finalizeNativeMedia(reservation, response);
  }

  if (Platform.OS === 'ios') {
    const response = await httpClientWithCert.downloadWithoutClientCert(url, {
      headers: authorizationHeader(server),
      ...profileTransportOptions(server),
      clientCertServerIdentity: mediaServerIdentity(server),
      maxBytes: reservation.maxBytes,
      mediaReservationId: reservation.id,
    });
    return finalizeNativeMedia(reservation, response);
  }

  return downloadMediaWithBlobUtil(server, url, reservation);
};

const isUnauthorizedMediaError = (error: unknown): boolean =>
  error instanceof HttpStatusError
    ? error.status === 401
    : Boolean(
        error &&
          typeof error === 'object' &&
          'status' in error &&
          (error as {status?: unknown}).status === 401,
      );

export const downloadMedia = async (
  server: Server,
  url: string,
): Promise<string> => {
  assertRemoteHttps(server);
  await acquireDownloadSlot();
  let reservation: MediaReservation | undefined;
  try {
    const currentReservation = await reserveMediaCapacity(
      requestedMediaBytes(url),
    );
    reservation = currentReservation;
    try {
      const path = await downloadMediaOnce(server, url, currentReservation);
      return path;
    } catch (error) {
      if (server.auth !== 'frigate' || !isUnauthorizedMediaError(error)) {
        throw error;
      }
      await loginServer(server);
      const path = await downloadMediaOnce(server, url, currentReservation);
      return path;
    }
  } finally {
    if (reservation) {
      await releaseMediaCapacity(reservation);
    }
    releaseDownloadSlot();
  }
};

export const fileUri = (path: string): string =>
  path.startsWith('file://') ? path : `file://${path}`;