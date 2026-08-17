import { useSQLiteContext } from 'expo-sqlite';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import {
  createPlaylist as createStoredPlaylist,
  getPlaylistById,
  getPlaylistIdsForTrack,
  getPlaylists,
  getPlaylistTracks,
  setTrackPlaylistIds,
} from '@/database/playlist-repository';
import { applyLocalFileAvailability } from '@/library/track-file-validation';
import type { Playlist, PlaylistSummary } from '@/models/playlist';
import type { Track } from '@/models/track';
import { localTrackFileExists } from '@/storage/music-file-storage';
import { getUserFacingError } from '@/utils/get-user-facing-error';

type PlaylistContextValue = {
  playlists: PlaylistSummary[];
  isLoading: boolean;
  error: string | null;
  createPlaylist: (name: string) => Promise<Playlist>;
  getTrackPlaylistIds: (trackId: string) => Promise<string[]>;
  setTrackPlaylists: (trackId: string, playlistIds: readonly string[]) => Promise<void>;
  loadPlaylist: (playlistId: string) => Promise<{ playlist: Playlist; tracks: Track[] }>;
  refreshPlaylists: () => Promise<void>;
};

const PlaylistContext = createContext<PlaylistContextValue | null>(null);

export function PlaylistProvider({ children }: PropsWithChildren) {
  const database = useSQLiteContext();
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshPlaylists = useCallback(async () => {
    try {
      setPlaylists(await getPlaylists(database));
      setError(null);
    } catch (refreshError) {
      setError(getUserFacingError(refreshError));
      throw refreshError;
    } finally {
      setIsLoading(false);
    }
  }, [database]);

  useEffect(() => {
    let active = true;
    getPlaylists(database)
      .then((storedPlaylists) => {
        if (active) {
          setPlaylists(storedPlaylists);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          console.error('AuraMusic playlist loading failed', loadError);
          setError(getUserFacingError(loadError));
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [database]);

  const createPlaylist = useCallback(
    async (name: string) => {
      try {
        const playlist = await createStoredPlaylist(database, name);
        await refreshPlaylists();
        return playlist;
      } catch (createError) {
        setError(getUserFacingError(createError));
        throw createError;
      }
    },
    [database, refreshPlaylists],
  );

  const getTrackPlaylistIds = useCallback(
    (trackId: string) => getPlaylistIdsForTrack(database, trackId),
    [database],
  );

  const setTrackPlaylists = useCallback(
    async (trackId: string, playlistIds: readonly string[]) => {
      await setTrackPlaylistIds(database, trackId, playlistIds);
      await refreshPlaylists();
    },
    [database, refreshPlaylists],
  );

  const loadPlaylist = useCallback(
    async (playlistId: string) => {
      const playlist = await getPlaylistById(database, playlistId);
      if (!playlist) {
        throw new Error('Playlist non trovata.');
      }
      const tracks = await applyLocalFileAvailability(
        await getPlaylistTracks(database, playlistId),
        localTrackFileExists,
      );
      return { playlist, tracks };
    },
    [database],
  );

  return (
    <PlaylistContext.Provider
      value={{
        playlists,
        isLoading,
        error,
        createPlaylist,
        getTrackPlaylistIds,
        setTrackPlaylists,
        loadPlaylist,
        refreshPlaylists,
      }}>
      {children}
    </PlaylistContext.Provider>
  );
}

export function usePlaylists() {
  const context = useContext(PlaylistContext);
  if (!context) {
    throw new Error('usePlaylists deve essere usato dentro PlaylistProvider.');
  }
  return context;
}
