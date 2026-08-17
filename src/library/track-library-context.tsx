import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useState } from 'react';

import {
  deleteTrack,
  getTrackById,
  getTracks,
  saveTrack,
} from '@/database/track-repository';
import { getDuplicateTrackStatus } from '@/library/track-duplicate-detection';
import { applyLocalFileAvailability } from '@/library/track-file-validation';
import type { Track } from '@/models/track';
import type {
  DownloadInfo,
  DownloadProgressCallback,
  DownloadService,
} from '@/services/download-service';
import { localTrackFileExists } from '@/storage/music-file-storage';
import { getUserFacingError } from '@/utils/get-user-facing-error';

export type AnalyzeTrackResult = {
  info: DownloadInfo;
  duplicate: boolean;
  duplicateMissingFile: boolean;
};

export type AddTrackPhase = 'downloading' | 'saving';

type TrackLibraryContextValue = {
  tracks: Track[];
  isLoading: boolean;
  error: string | null;
  analyzeTrack: (sourceUrl: string) => Promise<AnalyzeTrackResult>;
  addTrack: (
    sourceUrl: string,
    onProgress?: DownloadProgressCallback,
    onPhase?: (phase: AddTrackPhase) => void,
  ) => Promise<Track>;
  removeTrack: (track: Track) => Promise<void>;
  refreshTracks: () => Promise<void>;
};

type TrackLibraryProviderProps = PropsWithChildren<{
  downloadService: DownloadService;
}>;

export class TrackLibraryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'TrackLibraryError';
    this.code = code;
  }
}

const TrackLibraryContext = createContext<TrackLibraryContextValue | null>(null);

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Si e verificato un errore inatteso.';
}

async function loadTracksWithAvailability(database: SQLiteDatabase) {
  const storedTracks = await getTracks(database);
  return applyLocalFileAvailability(storedTracks, localTrackFileExists);
}

export function TrackLibraryProvider({
  children,
  downloadService,
}: TrackLibraryProviderProps) {
  const database = useSQLiteContext();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshTracks = useCallback(async () => {
    setIsLoading(true);
    try {
      setTracks(await loadTracksWithAvailability(database));
      setError(null);
    } catch (refreshError) {
      setError(getErrorMessage(refreshError));
    } finally {
      setIsLoading(false);
    }
  }, [database]);

  useEffect(() => {
    let isMounted = true;

    loadTracksWithAvailability(database)
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

  const analyzeTrack = useCallback(
    async (sourceUrl: string): Promise<AnalyzeTrackResult> => {
      setError(null);
      try {
        const info = await downloadService.getInfo(sourceUrl);
        const existingTrack = await getTrackById(database, info.id);
        const duplicateStatus = getDuplicateTrackStatus(existingTrack, localTrackFileExists);
        return {
          info,
          ...duplicateStatus,
        };
      } catch (analysisError) {
        const message = getUserFacingError(analysisError);
        setError(message);
        throw analysisError;
      }
    },
    [database, downloadService],
  );

  const addTrack = useCallback(
    async (
      sourceUrl: string,
      onProgress?: DownloadProgressCallback,
      onPhase?: (phase: AddTrackPhase) => void,
    ) => {
      setError(null);

      try {
        const info = await downloadService.getInfo(sourceUrl);
        const existingTrack = await getTrackById(database, info.id);
        if (existingTrack) {
          throw new TrackLibraryError(
            'DUPLICATE_TRACK',
            !localTrackFileExists(existingTrack.localUri)
              ? 'Il brano e gia nella libreria, ma il file locale risulta mancante.'
              : 'This track is already in your library.',
          );
        }

        onPhase?.('downloading');
        const track = await downloadService.downloadAudio(sourceUrl, onProgress);
        onPhase?.('saving');

        try {
          await saveTrack(database, track);
        } catch (saveError) {
          console.error('AuraMusic SQLite save failed after M4A download', saveError);
          throw new TrackLibraryError(
            'SQLITE_SAVE_FAILED',
            'Il file audio e stato scaricato, ma non e stato possibile salvarlo nella libreria.',
          );
        }

        setTracks((currentTracks) => [track, ...currentTracks]);
        return track;
      } catch (addError) {
        const message = getUserFacingError(addError);
        setError(message);
        throw addError;
      }
    },
    [database, downloadService],
  );

  const removeTrack = useCallback(
    async (track: Track) => {
      setError(null);
      try {
        await deleteTrack(database, track.id);
      } catch (deleteDatabaseError) {
        console.error('AuraMusic SQLite track deletion failed', deleteDatabaseError);
        const operationError = new TrackLibraryError(
          'SQLITE_DELETE_FAILED',
          'Non e stato possibile rimuovere il brano dalla libreria.',
        );
        setError(operationError.message);
        throw operationError;
      }

      setTracks((currentTracks) =>
        currentTracks.filter((currentTrack) => currentTrack.id !== track.id),
      );

      try {
        await downloadService.deleteAudio(track);
      } catch (deleteFileError) {
        console.error('AuraMusic M4A deletion failed after SQLite deletion', deleteFileError);
        const operationError = new TrackLibraryError(
          'AUDIO_DELETE_FAILED',
          'Il brano e stato rimosso dalla libreria, ma il file audio non e stato eliminato.',
        );
        setError(operationError.message);
        throw operationError;
      }
    },
    [database, downloadService],
  );

  return (
    <TrackLibraryContext.Provider
      value={{
        tracks,
        isLoading,
        error,
        analyzeTrack,
        addTrack,
        removeTrack,
        refreshTracks,
      }}>
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
