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
import type { PlayerSource, YouTubePlayableTrack } from '@/models/player-source';
import type { Track } from '@/models/track';
import { appPlaybackSourceService } from '@/services/app-playback-source-service';
import {
  canRefreshRemotePlayback,
  refreshRemotePlayerSource,
  resolvePlayerSource,
  searchResultToPlayableTrack,
} from '@/services/playback-source-service';
import type { YouTubeSearchResult } from '@/services/youtube-search-service';
import { getUserFacingError } from '@/utils/get-user-facing-error';

type AudioPlayerContextValue = {
  currentTrack: Track | null;
  currentItem: YouTubePlayableTrack | null;
  source: PlayerSource | null;
  status: AudioStatus;
  isResolving: boolean;
  playbackError: string | null;
  playTrack: (track: Track) => Promise<void>;
  playSearchResult: (result: YouTubeSearchResult, tracks: readonly Track[]) => void;
  togglePlayback: () => Promise<void>;
  seekBy: (seconds: number) => Promise<void>;
  seekTo: (seconds: number) => Promise<void>;
};

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

function trackToPlayableTrack(track: Track): YouTubePlayableTrack {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    thumbnail: track.thumbnail,
    duration: track.duration,
    sourceUrl: track.sourceUrl,
  };
}

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
  const player = useAudioPlayer(null, {
    updateInterval: 250,
    preferredForwardBufferDuration: 15,
    keepAudioSessionActive: true,
  });
  const status = useAudioPlayerStatus(player);
  const [currentItem, setCurrentItem] = useState<YouTubePlayableTrack | null>(null);
  const [source, setSourceState] = useState<PlayerSource | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const audioModePromise = useRef<Promise<void> | null>(null);
  const requestId = useRef(0);
  const sourceRef = useRef<PlayerSource | null>(null);
  const remoteRefreshCount = useRef(0);
  const refreshInFlight = useRef(false);
  const handledStatusError = useRef<string | null>(null);
  const pendingResume = useRef<{ position: number; shouldPlay: boolean } | null>(null);
  const desiredSeekPosition = useRef<number | null>(null);

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
          ? trackToPlayableTrack(nextSource.track)
          : nextSource.video,
      );
      player.replace(toExpoAudioSource(nextSource));
      setIsResolving(false);
      setPlaybackError(null);
      handledStatusError.current = null;
      if (autoPlay) {
        player.play();
      }
    },
    [player],
  );

  const playTrack = useCallback(
    async (track: Track) => {
      if (track.missingLocalFile) {
        throw new Error('Il file audio locale non è disponibile.');
      }
      const nextRequestId = ++requestId.current;
      remoteRefreshCount.current = 0;
      refreshInFlight.current = false;
      pendingResume.current = null;
      desiredSeekPosition.current = null;
      setIsResolving(true);
      setPlaybackError(null);
      setCurrentItem(trackToPlayableTrack(track));
      await ensureAudioMode();
      if (nextRequestId !== requestId.current) {
        return;
      }
      commitSource({ type: 'local', track, uri: track.localUri }, true);
    },
    [commitSource, ensureAudioMode],
  );

  const playSearchResult = useCallback(
    (result: YouTubeSearchResult, tracks: readonly Track[]) => {
      const video = searchResultToPlayableTrack(result);
      const nextRequestId = ++requestId.current;
      remoteRefreshCount.current = 0;
      refreshInFlight.current = false;
      pendingResume.current = null;
      desiredSeekPosition.current = null;
      sourceRef.current = null;
      setSourceState(null);
      setCurrentItem(video);
      setIsResolving(true);
      setPlaybackError(null);
      player.pause();

      void (async () => {
        try {
          await ensureAudioMode();
          const nextSource = await resolvePlayerSource(video, tracks, appPlaybackSourceService);
          if (nextRequestId !== requestId.current) {
            return;
          }
          commitSource(nextSource, true);
        } catch (error) {
          if (nextRequestId !== requestId.current) {
            return;
          }
          console.error('AuraMusic playback source resolution failed', error);
          setIsResolving(false);
          setPlaybackError(getUserFacingError(error));
        }
      })();
    },
    [commitSource, ensureAudioMode, player],
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
      setIsResolving(true);
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
          setIsResolving(false);
          setPlaybackError(getUserFacingError(refreshError));
        }
        return false;
      } finally {
        refreshInFlight.current = false;
      }
    },
    [commitSource],
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

  const togglePlayback = useCallback(async () => {
    if (!currentItem || isResolving) {
      return;
    }
    if (status.playing) {
      player.pause();
      return;
    }
    if (status.didJustFinish) {
      await player.seekTo(0);
    }
    player.play();
  }, [currentItem, isResolving, player, status.didJustFinish, status.playing]);

  const seekTo = useCallback(
    async (seconds: number) => {
      if (!currentItem || !sourceRef.current) {
        return;
      }
      const duration = status.duration || currentItem.duration || 0;
      const target = clampSeekPosition(seconds, duration);
      if (target === null) {
        return;
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
            status.playing || status.timeControlStatus === 'waiting',
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
      player,
      refreshRemoteAtPosition,
      status.duration,
      status.playing,
      status.timeControlStatus,
    ],
  );

  const seekBy = useCallback(
    async (seconds: number) => {
      const duration = status.duration || currentItem?.duration || 0;
      const target = getRelativeSeekPosition(status.currentTime, seconds, duration);
      if (target !== null) {
        await seekTo(target);
      }
    },
    [currentItem?.duration, seekTo, status.currentTime, status.duration],
  );

  return (
    <AudioPlayerContext.Provider
      value={{
        currentTrack: source?.type === 'local' ? source.track : null,
        currentItem,
        source,
        status,
        isResolving,
        playbackError,
        playTrack,
        playSearchResult,
        togglePlayback,
        seekBy,
        seekTo,
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
