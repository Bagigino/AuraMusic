import type { SQLiteDatabase } from 'expo-sqlite';

import type { BackupLibraryV1 } from '../backup/backup-format';
import type { Playlist, PlaylistTrack } from '../models/playlist';
import type { Track } from '../models/track';

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

type PlaylistRow = {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
};

type PlaylistTrackRow = {
  playlist_id: string;
  track_id: string;
  position: number;
  added_at: number;
};

export async function getBackupDatabaseSnapshot(database: SQLiteDatabase) {
  const [trackRows, playlistRows, membershipRows] = await Promise.all([
    database.getAllAsync<TrackRow>('SELECT * FROM tracks ORDER BY downloaded_at DESC'),
    database.getAllAsync<PlaylistRow>(
      'SELECT id, name, created_at, updated_at FROM playlists ORDER BY created_at ASC',
    ),
    database.getAllAsync<PlaylistTrackRow>(
      `SELECT playlist_id, track_id, position, added_at
       FROM playlist_tracks ORDER BY playlist_id ASC, position ASC, added_at ASC`,
    ),
  ]);

  const tracks: Track[] = trackRows.map((row) => ({
    id: row.id,
    title: row.title,
    artist: row.artist,
    thumbnail: row.thumbnail,
    duration: row.duration,
    sourceUrl: row.source_url,
    localUri: row.local_uri,
    downloadedAt: row.downloaded_at,
    missingLocalFile: false,
  }));
  const playlists: Playlist[] = playlistRows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  const playlistTracks: PlaylistTrack[] = membershipRows.map((row) => ({
    playlistId: row.playlist_id,
    trackId: row.track_id,
    position: row.position,
    addedAt: row.added_at,
  }));

  return { tracks, playlists, playlistTracks };
}

export function createPortableSnapshot(
  snapshot: Awaited<ReturnType<typeof getBackupDatabaseSnapshot>>,
  exportedTrackIds: ReadonlySet<string>,
) {
  return {
    tracks: snapshot.tracks
      .filter(({ id }) => exportedTrackIds.has(id))
      .map((track) => ({
        id: track.id,
        title: track.title,
        artist: track.artist,
        thumbnail: track.thumbnail,
        duration: track.duration,
        sourceUrl: track.sourceUrl,
        downloadedAt: track.downloadedAt,
        audioFileName: `${track.id}.m4a`,
      })),
    playlists: snapshot.playlists.map((playlist) => ({ ...playlist })),
    playlistTracks: snapshot.playlistTracks
      .filter(({ trackId }) => exportedTrackIds.has(trackId))
      .map((membership) => ({ ...membership })),
  } satisfies BackupLibraryV1;
}

export async function replaceLibraryRows(
  database: SQLiteDatabase,
  library: BackupLibraryV1,
  localUriForFile: (audioFileName: string) => string,
) {
  await database.runAsync('DELETE FROM playlist_tracks');
  await database.runAsync('DELETE FROM playlists');
  await database.runAsync('DELETE FROM tracks');

  for (const backupTrack of library.tracks) {
    const track: Track = {
      id: backupTrack.id,
      title: backupTrack.title,
      artist: backupTrack.artist,
      thumbnail: backupTrack.thumbnail,
      duration: backupTrack.duration,
      sourceUrl: backupTrack.sourceUrl,
      localUri: localUriForFile(backupTrack.audioFileName),
      downloadedAt: backupTrack.downloadedAt,
      missingLocalFile: false,
    };
    await database.runAsync(
      `INSERT INTO tracks (
        id, title, artist, thumbnail, duration, source_url, local_uri, downloaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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

  for (const playlist of library.playlists) {
    await database.runAsync(
      'INSERT INTO playlists (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      playlist.id,
      playlist.name,
      playlist.createdAt,
      playlist.updatedAt,
    );
  }

  for (const membership of library.playlistTracks) {
    await database.runAsync(
      `INSERT INTO playlist_tracks (playlist_id, track_id, position, added_at)
       VALUES (?, ?, ?, ?)`,
      membership.playlistId,
      membership.trackId,
      membership.position,
      membership.addedAt,
    );
  }
}
