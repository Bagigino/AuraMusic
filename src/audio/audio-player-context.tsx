import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  type AudioStatus,
} from 'expo-audio';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useState } from 'react';

import type { Track } from '@/models/track';

type AudioPlayerContextValue = {
  currentTrack: Track | null;
  status: AudioStatus;
  playTrack: (track: Track) => void;
  togglePlayback: () => Promise<void>;
  seekBy: (seconds: number) => Promise<void>;
};

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

export function AudioPlayerProvider({ children }: PropsWithChildren) {
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'doNotMix',
    });
  }, []);

  const playTrack = useCallback(
    (track: Track) => {
      if (track.missingLocalFile) {
        throw new Error('Il file audio locale non e disponibile.');
      }
      player.replace(track.localUri);
      setCurrentTrack(track);
      player.play();
    },
    [player],
  );

  const togglePlayback = useCallback(async () => {
    if (!currentTrack) {
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
  }, [currentTrack, player, status.didJustFinish, status.playing]);

  const seekBy = useCallback(
    async (seconds: number) => {
      if (!currentTrack) {
        return;
      }

      const duration = status.duration || currentTrack.duration;
      const nextTime = Math.min(duration, Math.max(0, status.currentTime + seconds));
      await player.seekTo(nextTime);
    },
    [currentTrack, player, status.currentTime, status.duration],
  );

  return (
    <AudioPlayerContext.Provider
      value={{ currentTrack, status, playTrack, togglePlayback, seekBy }}>
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
