import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  type AudioSource,
  type AudioStatus,
} from 'expo-audio';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  clampSeekPosition,
  getRelativeSeekPosition,
  getSeekResumePosition,
} from '@/audio/seek-controller';
import {
  getEffectivePlaybackDuration,
  hasExcessiveMediaTail,
  reachedEffectiveEnd,
} from '@/audio/playback-duration';
import {
  createSearchPlaybackQueue,
  createSinglePlaybackQueue,
  createTrackPlaybackQueue,
  getEndOfQueueAction,
  getNextQueueIndex,
  getPlaybackToggleAction,
  getPreviousQueueAction,
  queueWithCurrentIndex,
  searchResultToQueueItem,
  trackToQueueItem,
  type PlaybackQueue,
  type PlaybackQueueSource,
} from '@/audio/playback-queue';
import { useTrackLibrary } from '@/library/track-library-context';
import type { PlayerSource, YouTubePlayableTrack } from '@/models/player-source';
import type { Track } from '@/models/track';
import { appPlaybackSourceService } from '@/services/app-playback-source-service';
import {
  canRefreshRemotePlayback,
  refreshRemotePlayerSource,
  resolvePlayerSource,
} from '@/services/playback-source-service';
import type { YouTubeSearchResult } from '@/services/youtube-search-service';
import { getUserFacingError } from '@/utils/get-user-facing-error';

type AudioPlayerContextValue = {
  currentTrack: Track | null;
  currentItem: YouTubePlayableTrack | null;
  source: PlayerSource | null;
  status: AudioStatus;
  duration: number;
  isResolving: boolean;
  playbackError: string | null;
  queue: PlaybackQueue | null;
  isPlaying: boolean;
  position: number;
  isBuffering: boolean;
  availability: 'loading' | 'local' | 'remote' | 'unavailable';
  canGoPrevious: boolean;
  canGoNext: boolean;
  playTrack: (
    track: Track,
    options?: {
      tracks: readonly Track[];
      source: Extract<PlaybackQueueSource, 'all-songs' | 'playlist'>;
    },
  ) => Promise<void>;
  playSearchResult: (
    result: YouTubeSearchResult,
    results: readonly YouTubeSearchResult[],
  ) => void;
  togglePlayback: () => Promise<void>;
  playPrevious: () => Promise<void>;
  playNext: () => Promise<void>;
  seekBy: (seconds: number) => Promise<void>;
  seekTo: (seconds: number) => Promise<void>;
  clearPlayback: () => void;
};

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

function toExpoAudioSource(source: PlayerSource): AudioSource {
  if (source.type === 'local') {
    return { uri: source.uri, name: source.track.title };
  }
  return {
    uri: source.uri,
    name: source.video.title,
    headers: source.headers,
  };
}

export function AudioPlayerProvider({ children }: PropsWithChildren) {
  const { tracks: libraryTracks } = useTrackLibrary();
  const player = useAudioPlayer(null, {
    updateInterval: 250,
    preferredForwardBufferDuration: 15,
    keepAudioSessionActive: true,
  });
  const status = useAudioPlayerStatus(player);
  const [currentItem, setCurrentItem] = useState<YouTubePlayableTrack | null>(null);
  const [source, setSourceState] = useState<PlayerSource | null>(null);
  const [queue, setQueueState] = useState<PlaybackQueue | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const audioModePromise = useRef<Promise<void> | null>(null);
  const requestId = useRef(0);
  const sourceRef = useRef<PlayerSource | null>(null);
  const queueRef = useRef<PlaybackQueue | null>(null);
  const libraryTracksRef = useRef(libraryTracks);
  const queueCommandInFlight = useRef(false);
  const resolvingRef = useRef(false);
  const handledEndRequestId = useRef<number | null>(null);
  const endHandlingBlockedUntil = useRef(0);
  const remoteRefreshCount = useRef(0);
  const refreshInFlight = useRef(false);
  const handledStatusError = useRef<string | null>(null);
  const pendingResume = useRef<{ position: number; shouldPlay: boolean } | null>(null);
  const desiredSeekPosition = useRef<number | null>(null);
  const didReachEffectiveEnd = useRef(false);
  const playbackDuration = getEffectivePlaybackDuration(
    status.duration,
    currentItem?.duration,
  );
  const canGoNext = getNextQueueIndex(queue) !== null;

  useEffect(() => {
    libraryTracksRef.current = libraryTracks;
  }, [libraryTracks]);

  const setQueue = useCallback((nextQueue: PlaybackQueue | null) => {
    queueRef.current = nextQueue;
    setQueueState(nextQueue);
  }, []);

  const setResolving = useCallback((value: boolean) => {
    resolvingRef.current = value;
    setIsResolving(value);
  }, []);

  const ensureAudioMode = useCallback(() => {
    audioModePromise.current ??= setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'doNotMix',
    });
    return audioModePromise.current;
  }, []);

  useEffect(() => {
    void ensureAudioMode();
  }, [ensureAudioMode]);

  const commitSource = useCallback(
    (nextSource: PlayerSource, autoPlay: boolean) => {
      sourceRef.current = nextSource;
      setSourceState(nextSource);
      setCurrentItem(
        nextSource.type === 'local'
          ? trackToQueueItem(nextSource.track)
          : nextSource.video,
      );
      player.replace(toExpoAudioSource(nextSource));
      setResolving(false);
      setPlaybackError(null);
      didReachEffectiveEnd.current = false;
      handledEndRequestId.current = null;
      endHandlingBlockedUntil.current = Date.now() + 750;
      handledStatusError.current = null;
      if (autoPlay) {
        player.play();
      }
    },
    [player, setResolving],
  );

  const activateItem = useCallback(
    async (item: YouTubePlayableTrack, preferredLocalTrack?: Track) => {
      const nextRequestId = ++requestId.current;
      remoteRefreshCount.current = 0;
      refreshInFlight.current = false;
      pendingResume.current = null;
      desiredSeekPosition.current = null;
      sourceRef.current = null;
      setSourceState(null);
      setCurrentItem(item);
      setResolving(true);
      setPlaybackError(null);
      didReachEffectiveEnd.current = false;
      handledEndRequestId.current = null;
      player.pause();
      player.replace(null);

      try {
        await ensureAudioMode();
        if (nextRequestId !== requestId.current) {
          return false;
        }
        const nextSource = preferredLocalTrack
          ? { type: 'local' as const, track: preferredLocalTrack, uri: preferredLocalTrack.localUri }
          : await resolvePlayerSource(
              item,
              libraryTracksRef.current,
              appPlaybackSourceService,
            );
        if (nextRequestId !== requestId.current) {
          return false;
        }
        commitSource(nextSource, true);
        return true;
      } catch (error) {
        if (nextRequestId !== requestId.current) {
          return false;
        }
        console.error('AuraMusic playback source resolution failed', error);
        setResolving(false);
        setPlaybackError(getUserFacingError(error));
        return false;
      }
    },
    [commitSource, ensureAudioMode, player, setResolving],
  );

  const playTrack = useCallback(
    async (
      track: Track,
      options?: {
        tracks: readonly Track[];
        source: Extract<PlaybackQueueSource, 'all-songs' | 'playlist'>;
      },
    ) => {
      if (track.missingLocalFile) {
        throw new Error('Il file audio locale non è disponibile.');
      }
      const item = trackToQueueItem(track);
      const nextQueue = options
        ? createTrackPlaybackQueue(options.tracks, track.id, options.source)
        : createSinglePlaybackQueue(item);
      setQueue(nextQueue);
      await activateItem(item, track);
    },
    [activateItem, setQueue],
  );

  const playSearchResult = useCallback(
    (result: YouTubeSearchResult, results: readonly YouTubeSearchResult[]) => {
      const nextQueue = createSearchPlaybackQueue(results, result.id);
      setQueue(nextQueue);
      void activateItem(searchResultToQueueItem(result));
    },
    [activateItem, setQueue],
  );

  const activateQueueIndex = useCallback(
    async (index: number) => {
      const currentQueue = queueRef.current;
      if (!currentQueue || queueCommandInFlight.current || resolvingRef.current) {
        return false;
      }
      const nextQueue = queueWithCurrentIndex(currentQueue, index);
      queueCommandInFlight.current = true;
      setQueue(nextQueue);
      try {
        return await activateItem(nextQueue.tracks[index]);
      } finally {
        queueCommandInFlight.current = false;
      }
    },
    [activateItem, setQueue],
  );

  const playPrevious = useCallback(async () => {
    if (!currentItem || resolvingRef.current || queueCommandInFlight.current) {
      return;
    }
    const action = getPreviousQueueAction(queueRef.current, status.currentTime);
    if (action.type === 'restart') {
      didReachEffectiveEnd.current = false;
      handledEndRequestId.current = null;
      await player.seekTo(0);
      return;
    }
    await activateQueueIndex(action.index);
  }, [activateQueueIndex, currentItem, player, status.currentTime]);

  const playNext = useCallback(async () => {
    if (!currentItem || resolvingRef.current || queueCommandInFlight.current) {
      return;
    }
    const nextIndex = getNextQueueIndex(queueRef.current);
    if (nextIndex !== null) {
      await activateQueueIndex(nextIndex);
    }
  }, [activateQueueIndex, currentItem]);

  const handleNaturalEnd = useCallback(
    (seekToEffectiveEnd: boolean) => {
      if (Date.now() < endHandlingBlockedUntil.current) {
        return;
      }
      const activeRequestId = requestId.current;
      if (handledEndRequestId.current === activeRequestId) {
        return;
      }
      handledEndRequestId.current = activeRequestId;
      const action = getEndOfQueueAction(queueRef.current);
      if (action.type === 'next') {
        void activateQueueIndex(action.index);
        return;
      }
      didReachEffectiveEnd.current = true;
      player.pause();
      if (seekToEffectiveEnd) {
        void player.seekTo(playbackDuration).catch((endSeekError: unknown) => {
          console.error('AuraMusic effective playback end seek failed', endSeekError);
        });
      }
    },
    [activateQueueIndex, playbackDuration, player],
  );

  const refreshRemoteAtPosition = useCallback(
    async (
      currentSource: Extract<PlayerSource, { type: 'remote' }>,
      position: number,
      shouldPlay: boolean,
      originalError: string,
    ) => {
      if (refreshInFlight.current) {
        return true;
      }
      if (!canRefreshRemotePlayback(currentSource, remoteRefreshCount.current)) {
        return false;
      }

      const refreshCount = remoteRefreshCount.current;
      remoteRefreshCount.current += 1;
      refreshInFlight.current = true;
      setResolving(true);
      setPlaybackError(null);
      const refreshRequestId = requestId.current;

      try {
        const refreshedSource = await refreshRemotePlayerSource(
          currentSource,
          refreshCount,
          appPlaybackSourceService,
        );
        if (refreshRequestId !== requestId.current) {
          return true;
        }
        if (!refreshedSource) {
          throw new Error('La sorgente streaming non può essere aggiornata di nuovo.');
        }
        pendingResume.current = { position, shouldPlay };
        commitSource(refreshedSource, false);
        handledStatusError.current = originalError;
        return true;
      } catch (refreshError) {
        if (refreshRequestId === requestId.current) {
          console.error('AuraMusic remote playback refresh failed', refreshError);
          setResolving(false);
          setPlaybackError(getUserFacingError(refreshError));
        }
        return false;
      } finally {
        refreshInFlight.current = false;
      }
    },
    [commitSource, setResolving],
  );

  useEffect(() => {
    const currentSource = sourceRef.current;
    const error = status.error;
    if (!error) {
      handledStatusError.current = null;
      if (
        desiredSeekPosition.current !== null &&
        status.isLoaded &&
        Math.abs(status.currentTime - desiredSeekPosition.current) < 1
      ) {
        desiredSeekPosition.current = null;
      }
      return;
    }
    if (error === handledStatusError.current || refreshInFlight.current) {
      return;
    }
    handledStatusError.current = error;

    if (!currentSource || currentSource.type !== 'remote') {
      console.error('AuraMusic audio player failed', error);
      setPlaybackError(
        'Il file audio locale non può essere riprodotto.',
      );
      return;
    }

    const position = getSeekResumePosition(status.currentTime, desiredSeekPosition.current);
    const shouldPlay = status.playing || status.timeControlStatus === 'waiting';

    void refreshRemoteAtPosition(currentSource, position, shouldPlay, error).then((refreshed) => {
      if (!refreshed) {
        console.error('AuraMusic audio player failed', error);
        setPlaybackError('La sorgente streaming non è più riproducibile.');
      }
    });
  }, [
    refreshRemoteAtPosition,
    status.currentTime,
    status.error,
    status.isLoaded,
    status.playing,
    status.timeControlStatus,
  ]);

  useEffect(() => {
    const pending = pendingResume.current;
    if (!pending || !status.isLoaded || status.error) {
      return;
    }
    pendingResume.current = null;
    void player.seekTo(pending.position).then(() => {
      if (pending.shouldPlay) {
        player.play();
      }
    }).catch((resumeError: unknown) => {
      console.error('AuraMusic playback resume after refresh failed', resumeError);
      setPlaybackError(getUserFacingError(resumeError));
    });
  }, [player, status.error, status.isLoaded]);

  useEffect(() => {
    if (
      didReachEffectiveEnd.current ||
      !status.isLoaded ||
      !status.playing ||
      !hasExcessiveMediaTail(status.duration, currentItem?.duration) ||
      !reachedEffectiveEnd(status.currentTime, playbackDuration)
    ) {
      return;
    }

    handleNaturalEnd(true);
  }, [
    currentItem?.duration,
    handleNaturalEnd,
    playbackDuration,
    status.currentTime,
    status.duration,
    status.isLoaded,
    status.playing,
  ]);

  useEffect(() => {
    if (
      !currentItem ||
      isResolving ||
      !sourceRef.current ||
      !status.isLoaded ||
      !status.didJustFinish
    ) {
      return;
    }
    handleNaturalEnd(false);
  }, [currentItem, handleNaturalEnd, isResolving, status.didJustFinish, status.isLoaded]);

  const togglePlayback = useCallback(async () => {
    const action = getPlaybackToggleAction({
      hasActiveTrack: currentItem !== null,
      hasSource: sourceRef.current !== null,
      isResolving,
      isPlaying: status.playing,
      didJustFinish: status.didJustFinish,
      reachedEnd: didReachEffectiveEnd.current,
    });
    if (action === 'none') return;
    if (action === 'pause') {
      player.pause();
      return;
    }
    if (action === 'restart-and-play') {
      didReachEffectiveEnd.current = false;
      handledEndRequestId.current = null;
      await player.seekTo(0);
    }
    player.play();
  }, [
    currentItem,
    isResolving,
    player,
    status.didJustFinish,
    status.playing,
  ]);

  const seekTo = useCallback(
    async (seconds: number) => {
      if (!currentItem || !sourceRef.current) {
        return;
      }
      const target = clampSeekPosition(seconds, playbackDuration);
      if (target === null) {
        return;
      }
      const reachesEnd = target >= playbackDuration;
      didReachEffectiveEnd.current = reachesEnd;
      if (reachesEnd) {
        player.pause();
      }
      desiredSeekPosition.current = target;
      try {
        await player.seekTo(target);
      } catch (seekError) {
        const currentSource = sourceRef.current;
        console.error('AuraMusic direct seek failed', seekError);
        if (currentSource?.type === 'remote') {
          const refreshed = await refreshRemoteAtPosition(
            currentSource,
            target,
            !reachesEnd &&
              (status.playing || status.timeControlStatus === 'waiting'),
            seekError instanceof Error ? seekError.message : String(seekError),
          );
          if (refreshed) {
            return;
          }
          setPlaybackError('La sorgente streaming non è più riproducibile.');
        } else {
          setPlaybackError('Il file audio locale non può essere riprodotto.');
        }
        throw seekError;
      }
    },
    [
      currentItem,
      playbackDuration,
      player,
      refreshRemoteAtPosition,
      status.playing,
      status.timeControlStatus,
    ],
  );

  const seekBy = useCallback(
    async (seconds: number) => {
      const target = getRelativeSeekPosition(
        status.currentTime,
        seconds,
        playbackDuration,
      );
      if (target !== null) {
        await seekTo(target);
      }
    },
    [playbackDuration, seekTo, status.currentTime],
  );

  const clearPlayback = useCallback(() => {
    requestId.current += 1;
    player.pause();
    player.replace(null);
    sourceRef.current = null;
    setQueue(null);
    setSourceState(null);
    setCurrentItem(null);
    setResolving(false);
    setPlaybackError(null);
    queueCommandInFlight.current = false;
    remoteRefreshCount.current = 0;
    refreshInFlight.current = false;
    pendingResume.current = null;
    desiredSeekPosition.current = null;
    didReachEffectiveEnd.current = false;
    handledEndRequestId.current = null;
    endHandlingBlockedUntil.current = 0;
    handledStatusError.current = null;
  }, [player, setQueue, setResolving]);

  const isBuffering =
    isResolving || (!!source && !status.isLoaded) || status.isBuffering;
  const isAvailableLocally = currentItem
    ? libraryTracks.some(
        (track) => track.id === currentItem.id && !track.missingLocalFile,
      )
    : false;
  const availability = isResolving
    ? 'loading'
    : isAvailableLocally
      ? 'local'
      : source?.type ?? 'unavailable';

  return (
    <AudioPlayerContext.Provider
      value={{
        currentTrack: source?.type === 'local' ? source.track : null,
        currentItem,
        source,
        status,
        duration: playbackDuration,
        isResolving,
        playbackError,
        queue,
        isPlaying: status.playing,
        position: status.currentTime,
        isBuffering,
        availability,
        canGoPrevious: currentItem !== null,
        canGoNext,
        playTrack,
        playSearchResult,
        togglePlayback,
        playPrevious,
        playNext,
        seekBy,
        seekTo,
        clearPlayback,
      }}>
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAppAudioPlayer() {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error('useAppAudioPlayer deve essere usato dentro AudioPlayerProvider.');
  }
  return context;
}
