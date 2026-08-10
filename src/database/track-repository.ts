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
