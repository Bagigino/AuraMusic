import type { SQLiteDatabase } from 'expo-sqlite';

import type { Track } from '@/models/track';

type TrackRow = {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
  source_url: string;
  local_uri: string;
  downloaded_at: string;
};

function mapTrackRow(row: TrackRow): Track {
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

export async function getTracks(database: SQLiteDatabase): Promise<Track[]> {
  const rows = await database.getAllAsync<TrackRow>(
    'SELECT * FROM tracks ORDER BY downloaded_at DESC',
  );

  return rows.map(mapTrackRow);
}

export async function getTrackById(
  database: SQLiteDatabase,
  trackId: string,
): Promise<Track | null> {
  const row = await database.getFirstAsync<TrackRow>('SELECT * FROM tracks WHERE id = ?', trackId);
  return row ? mapTrackRow(row) : null;
}

export async function saveTrack(database: SQLiteDatabase, track: Track): Promise<void> {
  await database.runAsync(
    `INSERT INTO tracks (
      id, title, artist, thumbnail, duration, source_url, local_uri, downloaded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      artist = excluded.artist,
      thumbnail = excluded.thumbnail,
      duration = excluded.duration,
      source_url = excluded.source_url,
      local_uri = excluded.local_uri,
      downloaded_at = excluded.downloaded_at`,
    track.id,
    track.title,
    track.artist,
    track.thumbnail,
    track.duration,
    track.sourceUrl,
    track.localUri,
    track.downloadedAt,
  );
}

export async function deleteTrack(database: SQLiteDatabase, trackId: string): Promise<void> {
  await database.runAsync('DELETE FROM tracks WHERE id = ?', trackId);
}

export async function saveTrackWithPlaylistIds(
  database: SQLiteDatabase,
  track: Track,
  playlistIds: readonly string[],
): Promise<void> {
  await database.withTransactionAsync(async () => {
    await saveTrack(database, track);
    const uniquePlaylistIds = [...new Set(playlistIds)];
    const now = Date.now();
    const previousMemberships = await database.getAllAsync<{ playlist_id: string }>(
      'SELECT playlist_id FROM playlist_tracks WHERE track_id = ?',
      track.id,
    );
    for (const playlistId of uniquePlaylistIds) {
      const playlist = await database.getFirstAsync<{ id: string }>(
        'SELECT id FROM playlists WHERE id = ?',
        playlistId,
      );
      if (!playlist) {
        throw new Error('Una playlist selezionata non esiste più.');
      }
    }

    if (uniquePlaylistIds.length === 0) {
      await database.runAsync('DELETE FROM playlist_tracks WHERE track_id = ?', track.id);
    } else {
      const placeholders = uniquePlaylistIds.map(() => '?').join(', ');
      await database.runAsync(
        `DELETE FROM playlist_tracks WHERE track_id = ? AND playlist_id NOT IN (${placeholders})`,
        track.id,
        ...uniquePlaylistIds,
      );
    }

    for (const playlistId of uniquePlaylistIds) {
      await database.runAsync(
        `INSERT INTO playlist_tracks (playlist_id, track_id, position, added_at)
         SELECT ?, ?, COALESCE(MAX(position) + 1, 0), ?
         FROM playlist_tracks WHERE playlist_id = ?
         ON CONFLICT(playlist_id, track_id) DO NOTHING`,
        playlistId,
        track.id,
        now,
        playlistId,
      );
    }
    for (const playlistId of new Set([
      ...previousMemberships.map((membership) => membership.playlist_id),
      ...uniquePlaylistIds,
    ])) {
      await database.runAsync(
        'UPDATE playlists SET updated_at = ? WHERE id = ?',
        now,
        playlistId,
      );
    }
  });
}

export async function deleteTrackWithMemberships(
  database: SQLiteDatabase,
  trackId: string,
): Promise<void> {
  await database.withTransactionAsync(async () => {
    await database.runAsync('DELETE FROM playlist_tracks WHERE track_id = ?', trackId);
    await deleteTrack(database, trackId);
  });
}
