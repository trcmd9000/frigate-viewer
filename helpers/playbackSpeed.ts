import {useSyncExternalStore} from 'react';

export const EVENT_PLAYBACK_SPEEDS = Object.freeze([
  0.25,
  0.5,
  0.75,
  1,
  1.25,
  1.5,
  1.75,
  2,
] as const);

export type EventPlaybackSpeed = (typeof EVENT_PLAYBACK_SPEEDS)[number];

export const DEFAULT_EVENT_PLAYBACK_SPEED: EventPlaybackSpeed = 1;

const listeners = new Set<() => void>();
let currentSpeed: EventPlaybackSpeed = DEFAULT_EVENT_PLAYBACK_SPEED;

export const isEventPlaybackSpeed = (
  value: unknown,
): value is EventPlaybackSpeed =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  (EVENT_PLAYBACK_SPEEDS as readonly number[]).includes(value);

export const validateEventPlaybackSpeed = (
  value: unknown,
): EventPlaybackSpeed | undefined =>
  isEventPlaybackSpeed(value) ? value : undefined;

export const getEventPlaybackSpeed = (): EventPlaybackSpeed => currentSpeed;

/**
 * Playback speed is intentionally process-local. It is shared by event clips
 * but is not persisted, so a new app process starts at normal speed.
 */
export const setEventPlaybackSpeed = (value: unknown): boolean => {
  const speed = validateEventPlaybackSpeed(value);
  if (speed === undefined || speed === currentSpeed) {
    return speed !== undefined;
  }
  currentSpeed = speed;
  listeners.forEach(listener => listener());
  return true;
};

export const resetEventPlaybackSpeed = (): void => {
  setEventPlaybackSpeed(DEFAULT_EVENT_PLAYBACK_SPEED);
};

export const subscribeToEventPlaybackSpeed = (
  listener: () => void,
): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useEventPlaybackSpeed = (): EventPlaybackSpeed =>
  useSyncExternalStore(
    subscribeToEventPlaybackSpeed,
    getEventPlaybackSpeed,
    getEventPlaybackSpeed,
  );
