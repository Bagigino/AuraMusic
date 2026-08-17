import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useState } from 'react';

import {
  deleteTrackWithMemberships,
  getTrackById,
  getTracks,
  saveTrack,
  saveTrackWithPlaylistIds,
} from '@/database/track-repository';
import { getDuplicateTrackStatus } from '@/library/track-duplicate-detection';
import { applyLocalFileAvailability } from '@/library/track-file-validation';
import {
  saveTrackToPlaylists as coordinateTrackPlaylistSave,
  type SaveTrackToPlaylistsResult,
} from '@/library/save-track-to-playlists';
import type { Track } from '@/models/track';
import type {
  DownloadInfo,
  DownloadProgressCallback,
  DownloadService,
} from '@/services/download-service';
import { localTrackFileExists } from '@/storage/music-file-storage';
import { setTrackPlaylistIds } from '@/database/playlist-repository';
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
  saveTrackToPlaylists: (
    videoId: string,
    sourceUrl: string,
    playlistIds: readonly string[],
    onProgress?: DownloadProgressCallback,
  ) => Promise<SaveTrackToPlaylistsResult>;
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
        await deleteTrackWithMemberships(database, track.id);
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

  const saveTrackToPlaylists = useCallback(
    async (
      videoId: string,
      sourceUrl: string,
      playlistIds: readonly string[],
      onProgress?: DownloadProgressCallback,
    ) => {
      setError(null);
      try {
        const result = await coordinateTrackPlaylistSave(
          {
            findTrack: (id) => getTrackById(database, id),
            localFileExists: localTrackFileExists,
            downloadAudio: (url, progress) => downloadService.downloadAudio(url, progress),
            persistTrackWithPlaylists: async (track, ids) => {
              try {
                await saveTrackWithPlaylistIds(database, track, ids);
              } catch (databaseError) {
                console.error('AuraMusic Track/playlist transaction failed', databaseError);
                throw new TrackLibraryError(
                  'SQLITE_SAVE_FAILED',
                  'Il download è completo, ma il salvataggio nella Library non è riuscito.',
                );
              }
            },
            setExistingTrackPlaylists: async (trackId, ids) => {
              try {
                await setTrackPlaylistIds(database, trackId, ids);
              } catch (databaseError) {
                console.error('AuraMusic playlist membership update failed', databaseError);
                throw new TrackLibraryError(
                  'SQLITE_SAVE_FAILED',
                  'Non è stato possibile aggiornare le playlist del brano.',
                );
              }
            },
            deleteAudio: (track) => downloadService.deleteAudio(track),
          },
          { videoId, sourceUrl, playlistIds, onProgress },
        );
        setTracks((currentTracks) => {
          const withoutTrack = currentTracks.filter((track) => track.id !== result.track.id);
          return [result.track, ...withoutTrack];
        });
        return result;
      } catch (saveError) {
        setError(getUserFacingError(saveError));
        throw saveError;
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
        saveTrackToPlaylists,
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
