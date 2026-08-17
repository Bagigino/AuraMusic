import type { Track } from '@/models/track';

export type TrackAvailability = 'remote' | 'downloading' | 'local';

export type YouTubePlayableTrack = {
  id: string;
  title: string;
  artist: string | null;
  thumbnail: string | null;
  duration: number | null;
  sourceUrl: string;
};

export type RemotePlaybackSource = {
  videoId: string;
  title: string;
  artist: string | null;
  thumbnail: string | null;
  duration: number | null;
  remoteUri: string;
  formatId: string;
  ext: string | null;
  headers?: Record<string, string>;
};

export type PlayerSource =
  | {
      type: 'local';
      track: Track;
      uri: string;
    }
  | {
      type: 'remote';
      video: YouTubePlayableTrack;
      uri: string;
      formatId: string;
      ext: string | null;
      headers?: Record<string, string>;
    };
