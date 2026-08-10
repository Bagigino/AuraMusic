import { useSQLiteContext } from 'expo-sqlite';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useState } from 'react';

import { getTracks, saveTrack } from '@/database/track-repository';
import type { Track } from '@/models/track';
import type { DownloadProgressCallback, DownloadService } from '@/services/download-service';

type TrackLibraryContextValue = {
  tracks: Track[];
  isLoading: boolean;
  isAdding: boolean;
  error: string | null;
  addTrack: (sourceUrl: string, onProgress?: DownloadProgressCallback) => Promise<Track>;
  refreshTracks: () => Promise<void>;
};

type TrackLibraryProviderProps = PropsWithChildren<{
  downloadService: DownloadService;
}>;

const TrackLibraryContext = createContext<TrackLibraryContextValue | null>(null);

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Si è verificato un errore inatteso.';
}

export function TrackLibraryProvider({
  children,
  downloadService,
}: TrackLibraryProviderProps) {
  const database = useSQLiteContext();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshTracks = useCallback(async () => {
    try {
      setTracks(await getTracks(database));
      setError(null);
    } catch (refreshError) {
      setError(getErrorMessage(refreshError));
    } finally {
      setIsLoading(false);
    }
  }, [database]);

  useEffect(() => {
    let isMounted = true;

    getTracks(database)
      .then((storedTracks) => {
        if (isMounted) {
          setTracks(storedTracks);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (isMounted) {
          setError(getErrorMessage(loadError));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [database]);

  const addTrack = useCallback(
    async (sourceUrl: string, onProgress?: DownloadProgressCallback) => {
      setIsAdding(true);
      setError(null);

      try {
        const track = await downloadService.downloadAudio(sourceUrl, onProgress);
        await saveTrack(database, track);
        setTracks((currentTracks) => [
          track,
          ...currentTracks.filter((currentTrack) => currentTrack.id !== track.id),
        ]);
        return track;
      } catch (addError) {
        const message = getErrorMessage(addError);
        setError(message);
        throw new Error(message);
      } finally {
        setIsAdding(false);
      }
    },
    [database, downloadService],
  );

  return (
    <TrackLibraryContext.Provider
      value={{ tracks, isLoading, isAdding, error, addTrack, refreshTracks }}>
      {children}
    </TrackLibraryContext.Provider>
  );
}

export function useTrackLibrary() {
  const context = useContext(TrackLibraryContext);

  if (!context) {
    throw new Error('useTrackLibrary deve essere usato dentro TrackLibraryProvider.');
  }

  return context;
}
