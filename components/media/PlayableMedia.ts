export interface PlayableMedia {
  uri: string;
  mimeType: 'video/mp4' | 'application/x-mpegURL' | 'application/x-rtsp';
  mode: 'local' | 'direct';
  profileId?: string;
}

export interface MediaProgress {
  currentTime: number;
  duration: number;
}

export interface MediaPlayerHandle {
  seek: (positionSeconds: number) => void;
  resume: () => void;
}
