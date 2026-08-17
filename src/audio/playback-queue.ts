import type { YouTubePlayableTrack } from '../models/player-source';
import type { Track } from '../models/track';
import type { YouTubeSearchResult } from '../services/youtube-search-service';

export type PlaybackQueueSource = 'search' | 'all-songs' | 'playlist' | 'single';

export type PlaybackQueue = {
  tracks: YouTubePlayableTrack[];
  currentIndex: number;
  source: PlaybackQueueSource;
};

export type PreviousQueueAction =
  | { type: 'restart' }
  | { type: 'previous'; index: number };

export type EndOfQueueAction =
  | { type: 'next'; index: number }
  | { type: 'stay' };

export type PlaybackToggleAction = 'none' | 'pause' | 'play' | 'restart-and-play';

export const PREVIOUS_RESTART_THRESHOLD_SECONDS = 3;

export function trackToQueueItem(track: Track): YouTubePlayableTrack {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    thumbnail: track.thumbnail,
    duration: track.duration,
    sourceUrl: track.sourceUrl,
  };
}

export function searchResultToQueueItem(result: YouTubeSearchResult): YouTubePlayableTrack {
  return {
    id: result.id,
    title: result.title,
    artist: result.uploader,
    thumbnail: result.thumbnail,
    duration: result.duration,
    sourceUrl: result.url,
  };
}

function createQueue(
  tracks: YouTubePlayableTrack[],
  currentTrackId: string,
  source: PlaybackQueueSource,
): PlaybackQueue {
  const currentIndex = tracks.findIndex(({ id }) => id === currentTrackId);
  if (tracks.length === 0 || currentIndex < 0) {
    throw new Error('La traccia selezionata non appartiene alla queue corrente.');
  }
  return { tracks, currentIndex, source };
}

export function createTrackPlaybackQueue(
  tracks: readonly Track[],
  currentTrackId: string,
  source: Extract<PlaybackQueueSource, 'all-songs' | 'playlist'>,
) {
  return createQueue(tracks.map(trackToQueueItem), currentTrackId, source);
}

export function createSearchPlaybackQueue(
  results: readonly YouTubeSearchResult[],
  currentTrackId: string,
) {
  return createQueue(results.map(searchResultToQueueItem), currentTrackId, 'search');
}

export function createSinglePlaybackQueue(item: YouTubePlayableTrack): PlaybackQueue {
  return { tracks: [item], currentIndex: 0, source: 'single' };
}

export function queueWithCurrentIndex(queue: PlaybackQueue, currentIndex: number): PlaybackQueue {
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= queue.tracks.length) {
    throw new Error('Indice playback queue non valido.');
  }
  return { ...queue, currentIndex };
}

export function getNextQueueIndex(queue: PlaybackQueue | null) {
  if (!queue || queue.currentIndex >= queue.tracks.length - 1) return null;
  return queue.currentIndex + 1;
}

export function getPreviousQueueAction(
  queue: PlaybackQueue | null,
  currentTime: number,
  restartThreshold = PREVIOUS_RESTART_THRESHOLD_SECONDS,
): PreviousQueueAction {
  const safeTime = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0;
  if (!queue || safeTime > restartThreshold || queue.currentIndex === 0) {
    return { type: 'restart' };
  }
  return { type: 'previous', index: queue.currentIndex - 1 };
}

export function getEndOfQueueAction(queue: PlaybackQueue | null): EndOfQueueAction {
  const nextIndex = getNextQueueIndex(queue);
  return nextIndex === null ? { type: 'stay' } : { type: 'next', index: nextIndex };
}

export function getPlaybackToggleAction({
  hasActiveTrack,
  hasSource,
  isResolving,
  isPlaying,
  didJustFinish,
  reachedEnd,
}: {
  hasActiveTrack: boolean;
  hasSource: boolean;
  isResolving: boolean;
  isPlaying: boolean;
  didJustFinish: boolean;
  reachedEnd: boolean;
}): PlaybackToggleAction {
  if (!hasActiveTrack || !hasSource || isResolving) return 'none';
  if (isPlaying) return 'pause';
  if (didJustFinish || reachedEnd) return 'restart-and-play';
  return 'play';
}

export function shouldShowMiniPlayer(
  activeTrack: YouTubePlayableTrack | null,
  isFullPlayerRoute = false,
) {
  return activeTrack !== null && !isFullPlayerRoute;
}
