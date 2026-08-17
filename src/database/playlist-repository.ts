import type { SQLiteDatabase } from 'expo-sqlite';

import type { Playlist, PlaylistSummary, PlaylistTrack } from '@/models/playlist';
import type { Track } from '@/models/track';

const MAX_PLAYLIST_NAME_LENGTH = 60;

type PlaylistRow = {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
};

type PlaylistSummaryRow = PlaylistRow & { track_count: number };

type PlaylistTrackRow = {
  playlist_id: string;
  track_id: string;
  position: number;
  added_at: number;
};

type PlaylistTrackDetailRow = {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
  source_url: string;
  local_uri: string;
  downloaded_at: string;
};

export class PlaylistRepositoryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PlaylistRepositoryError';
    this.code = code;
  }
}

function mapPlaylist(row: PlaylistRow): Playlist {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTrack(row: PlaylistTrackDetailRow): Track {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    thumbnail: row.thumbnail,
    duration: row.duration,
    sourceUrl: row.source_url,
    localUri: row.local_uri,
    downloadedAt: row.downloaded_at,
    missingLocalFile: false,
  };
}

export function normalizePlaylistName(rawName: string) {
  const name = rawName.trim().replace(/\s+/g, ' ');
  if (!name) {
    throw new PlaylistRepositoryError('EMPTY_PLAYLIST_NAME', 'Inserisci un nome per la playlist.');
  }
  if (name.length > MAX_PLAYLIST_NAME_LENGTH) {
    throw new PlaylistRepositoryError(
      'PLAYLIST_NAME_TOO_LONG',
      `Il nome della playlist non può superare ${MAX_PLAYLIST_NAME_LENGTH} caratteri.`,
    );
  }
  return name;
}

export function createPlaylistId(now = Date.now(), random = Math.random()) {
  return `playlist_${now.toString(36)}_${Math.floor(random * 0x100000000)
    .toString(36)
    .padStart(7, '0')}`;
}

export async function getPlaylists(database: SQLiteDatabase): Promise<PlaylistSummary[]> {
  const rows = await database.getAllAsync<PlaylistSummaryRow>(`
    SELECT p.id, p.name, p.created_at, p.updated_at, COUNT(pt.track_id) AS track_count
    FROM playlists p
    LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
    GROUP BY p.id
    ORDER BY p.updated_at DESC, p.name COLLATE NOCASE ASC
  `);
  return rows.map((row) => ({ ...mapPlaylist(row), trackCount: row.track_count }));
}

export async function getPlaylistById(
  database: SQLiteDatabase,
  playlistId: string,
): Promise<Playlist | null> {
  const row = await database.getFirstAsync<PlaylistRow>(
    'SELECT id, name, created_at, updated_at FROM playlists WHERE id = ?',
    playlistId,
  );
  return row ? mapPlaylist(row) : null;
}

export async function createPlaylist(
  database: SQLiteDatabase,
  rawName: string,
  options: { id?: string; now?: number } = {},
): Promise<Playlist> {
  const name = normalizePlaylistName(rawName);
  const duplicate = await database.getFirstAsync<{ id: string }>(
    'SELECT id FROM playlists WHERE name = ? COLLATE NOCASE LIMIT 1',
    name,
  );
  if (duplicate) {
    throw new PlaylistRepositoryError(
      'DUPLICATE_PLAYLIST_NAME',
      'Esiste già una playlist con questo nome.',
    );
  }

  const now = options.now ?? Date.now();
  const playlist: Playlist = {
    id: options.id ?? createPlaylistId(now),
    name,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await database.runAsync(
      'INSERT INTO playlists (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      playlist.id,
      playlist.name,
      playlist.createdAt,
      playlist.updatedAt,
    );
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) {
      throw new PlaylistRepositoryError(
        'DUPLICATE_PLAYLIST_NAME',
        'Esiste già una playlist con questo nome.',
      );
    }
    throw error;
  }
  return playlist;
}

export async function getPlaylistTracks(
  database: SQLiteDatabase,
  playlistId: string,
): Promise<Track[]> {
  const rows = await database.getAllAsync<PlaylistTrackDetailRow>(
    `SELECT t.id, t.title, t.artist, t.thumbnail, t.duration,
      t.source_url, t.local_uri, t.downloaded_at
    FROM playlist_tracks pt
    JOIN tracks t ON t.id = pt.track_id
    WHERE pt.playlist_id = ?
    ORDER BY pt.position ASC, pt.added_at ASC`,
    playlistId,
  );
  return rows.map(mapTrack);
}

export async function getPlaylistTracksRows(
  database: SQLiteDatabase,
  playlistId: string,
): Promise<PlaylistTrack[]> {
  const rows = await database.getAllAsync<PlaylistTrackRow>(
    `SELECT playlist_id, track_id, position, added_at
     FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC`,
    playlistId,
  );
  return rows.map((row) => ({
    playlistId: row.playlist_id,
    trackId: row.track_id,
    position: row.position,
    addedAt: row.added_at,
  }));
}

export async function getPlaylistIdsForTrack(
  database: SQLiteDatabase,
  trackId: string,
): Promise<string[]> {
  const rows = await database.getAllAsync<{ playlist_id: string }>(
    'SELECT playlist_id FROM playlist_tracks WHERE track_id = ?',
    trackId,
  );
  return rows.map((row) => row.playlist_id);
}

async function assertTrackAndPlaylistsExist(
  database: SQLiteDatabase,
  trackId: string,
  playlistIds: readonly string[],
) {
  const track = await database.getFirstAsync<{ id: string }>(
    'SELECT id FROM tracks WHERE id = ?',
    trackId,
  );
  if (!track) {
    throw new PlaylistRepositoryError('TRACK_NOT_FOUND', 'Il brano non esiste nella Library.');
  }
  for (const playlistId of playlistIds) {
    const playlist = await database.getFirstAsync<{ id: string }>(
      'SELECT id FROM playlists WHERE id = ?',
      playlistId,
    );
    if (!playlist) {
      throw new PlaylistRepositoryError('PLAYLIST_NOT_FOUND', 'Una playlist selezionata non esiste più.');
    }
  }
}

export async function setTrackPlaylistIdsInTransaction(
  database: SQLiteDatabase,
  trackId: string,
  rawPlaylistIds: readonly string[],
  now = Date.now(),
) {
  const playlistIds = [...new Set(rawPlaylistIds)];
  await assertTrackAndPlaylistsExist(database, trackId, playlistIds);
  const previousIds = await getPlaylistIdsForTrack(database, trackId);

  if (playlistIds.length === 0) {
    await database.runAsync('DELETE FROM playlist_tracks WHERE track_id = ?', trackId);
  } else {
    const placeholders = playlistIds.map(() => '?').join(', ');
    await database.runAsync(
      `DELETE FROM playlist_tracks WHERE track_id = ? AND playlist_id NOT IN (${placeholders})`,
      trackId,
      ...playlistIds,
    );
  }

  for (const playlistId of playlistIds) {
    await database.runAsync(
      `INSERT INTO playlist_tracks (playlist_id, track_id, position, added_at)
       SELECT ?, ?, COALESCE(MAX(position) + 1, 0), ?
       FROM playlist_tracks WHERE playlist_id = ?
       ON CONFLICT(playlist_id, track_id) DO NOTHING`,
      playlistId,
      trackId,
      now,
      playlistId,
    );
  }

  for (const playlistId of new Set([...previousIds, ...playlistIds])) {
    await database.runAsync('UPDATE playlists SET updated_at = ? WHERE id = ?', now, playlistId);
  }
}

export async function setTrackPlaylistIds(
  database: SQLiteDatabase,
  trackId: string,
  playlistIds: readonly string[],
  now = Date.now(),
) {
  await database.withTransactionAsync(() =>
    setTrackPlaylistIdsInTransaction(database, trackId, playlistIds, now),
  );
}

export async function deletePlaylist(database: SQLiteDatabase, playlistId: string) {
  await database.runAsync('DELETE FROM playlists WHERE id = ?', playlistId);
}
