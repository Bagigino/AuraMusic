import type {
  PlayerSource,
  RemotePlaybackSource,
  YouTubePlayableTrack,
} from '@/models/player-source';
import type { Track } from '@/models/track';
import type { YouTubeSearchResult } from '@/services/youtube-search-service';

export interface PlaybackSourceService {
  resolveYouTubePlaybackSource(url: string): Promise<RemotePlaybackSource>;
}

export type NativePlaybackSourceAdapter = {
  resolveYouTubePlaybackSource(url: string): Promise<unknown | string>;
};

export class PlaybackSourceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PlaybackSourceError';
    this.code = code;
  }
}

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
  'set-cookie',
]);

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalDuration(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function normalizeRemotePlaybackSource(rawSource: unknown): RemotePlaybackSource {
  if (!rawSource || typeof rawSource !== 'object') {
    throw new PlaybackSourceError(
      'INVALID_PLAYBACK_SOURCE',
      'Il modulo nativo ha restituito una sorgente audio non valida.',
    );
  }
  const raw = rawSource as Record<string, unknown>;
  const videoId = optionalString(raw.videoId);
  const title = optionalString(raw.title);
  const remoteUri = optionalString(raw.remoteUri);
  const formatId = optionalString(raw.formatId);
  if (!videoId || !title || !remoteUri || !formatId) {
    throw new PlaybackSourceError(
      'INVALID_PLAYBACK_SOURCE',
      'La sorgente audio risolta non contiene tutti i campi richiesti.',
    );
  }

  let parsedUri: URL;
  try {
    parsedUri = new URL(remoteUri);
  } catch {
    throw new PlaybackSourceError('INVALID_PLAYBACK_URI', 'La sorgente audio remota non è valida.');
  }
  if (parsedUri.protocol !== 'https:') {
    throw new PlaybackSourceError('INVALID_PLAYBACK_URI', 'La sorgente audio remota non usa HTTPS.');
  }

  const headers: Record<string, string> = {};
  if (raw.headers && typeof raw.headers === 'object' && !Array.isArray(raw.headers)) {
    for (const [name, value] of Object.entries(raw.headers as Record<string, unknown>)) {
      if (
        typeof value === 'string' &&
        name.trim() &&
        value.trim() &&
        !SENSITIVE_HEADER_NAMES.has(name.trim().toLowerCase())
      ) {
        headers[name] = value;
      }
    }
  }

  return {
    videoId,
    title,
    artist: optionalString(raw.artist),
    thumbnail: optionalString(raw.thumbnail),
    duration: optionalDuration(raw.duration),
    remoteUri,
    formatId,
    ext: optionalString(raw.ext),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  };
}

export class NativePlaybackSourceService implements PlaybackSourceService {
  private readonly nativeAdapter: NativePlaybackSourceAdapter;

  constructor(nativeAdapter: NativePlaybackSourceAdapter) {
    this.nativeAdapter = nativeAdapter;
  }

  async resolveYouTubePlaybackSource(rawUrl: string) {
    const url = rawUrl.trim();
    const nativeSource = await this.nativeAdapter.resolveYouTubePlaybackSource(url);
    if (typeof nativeSource === 'string') {
      throw new PlaybackSourceError('PLAYBACK_UNAVAILABLE', nativeSource);
    }
    return normalizeRemotePlaybackSource(nativeSource);
  }
}

export function searchResultToPlayableTrack(result: YouTubeSearchResult): YouTubePlayableTrack {
  return {
    id: result.id,
    title: result.title,
    artist: result.uploader,
    thumbnail: result.thumbnail,
    duration: result.duration,
    sourceUrl: result.url,
  };
}

export function getPlayableLocalTrack(
  videoId: string,
  tracks: readonly Track[],
): Track | null {
  return tracks.find((track) => track.id === videoId && !track.missingLocalFile) ?? null;
}

export async function resolvePlayerSource(
  video: YouTubePlayableTrack,
  tracks: readonly Track[],
  service: PlaybackSourceService,
): Promise<PlayerSource> {
  const localTrack = getPlayableLocalTrack(video.id, tracks);
  if (localTrack) {
    return { type: 'local', track: localTrack, uri: localTrack.localUri };
  }

  const remote = await service.resolveYouTubePlaybackSource(video.sourceUrl);
  if (remote.videoId !== video.id) {
    throw new PlaybackSourceError(
      'PLAYBACK_VIDEO_MISMATCH',
      'YouTube ha risolto un video diverso dal risultato selezionato.',
    );
  }
  return {
    type: 'remote',
    video: {
      ...video,
      title: remote.title,
      artist: remote.artist,
      thumbnail: remote.thumbnail,
      duration: remote.duration,
    },
    uri: remote.remoteUri,
    formatId: remote.formatId,
    ext: remote.ext,
    headers: remote.headers,
  };
}

export function canRefreshRemotePlayback(source: PlayerSource | null, refreshCount: number) {
  return source?.type === 'remote' && refreshCount < 1;
}

export async function refreshRemotePlayerSource(
  source: PlayerSource,
  refreshCount: number,
  service: PlaybackSourceService,
): Promise<PlayerSource | null> {
  if (!canRefreshRemotePlayback(source, refreshCount) || source.type !== 'remote') {
    return null;
  }
  const remote = await service.resolveYouTubePlaybackSource(source.video.sourceUrl);
  if (remote.videoId !== source.video.id) {
    throw new PlaybackSourceError(
      'PLAYBACK_VIDEO_MISMATCH',
      'YouTube ha risolto un video diverso durante il refresh del Player.',
    );
  }
  return {
    type: 'remote',
    video: {
      ...source.video,
      title: remote.title,
      artist: remote.artist,
      thumbnail: remote.thumbnail,
      duration: remote.duration,
    },
    uri: remote.remoteUri,
    formatId: remote.formatId,
    ext: remote.ext,
    headers: remote.headers,
  };
}
