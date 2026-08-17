import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_VERSION = 2;

export async function migrateDatabase(database: SQLiteDatabase) {
  await database.execAsync('PRAGMA foreign_keys = ON');
  const versionRow = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion >= DATABASE_VERSION) {
    return;
  }

  await database.execAsync('PRAGMA journal_mode = WAL');
  await database.withTransactionAsync(async () => {
    if (currentVersion < 1) {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS tracks (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          artist TEXT NOT NULL,
          thumbnail TEXT NOT NULL,
          duration REAL NOT NULL,
          source_url TEXT NOT NULL,
          local_uri TEXT NOT NULL UNIQUE,
          downloaded_at TEXT NOT NULL
        );
      `);
    }

    if (currentVersion < 2) {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS playlists (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS playlists_name_nocase_idx
          ON playlists(name COLLATE NOCASE);

        CREATE TABLE IF NOT EXISTS playlist_tracks (
          playlist_id TEXT NOT NULL,
          track_id TEXT NOT NULL,
          position INTEGER NOT NULL CHECK(position >= 0),
          added_at INTEGER NOT NULL,
          PRIMARY KEY (playlist_id, track_id),
          FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
          FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS playlist_tracks_playlist_position_idx
          ON playlist_tracks(playlist_id, position);

        CREATE INDEX IF NOT EXISTS playlist_tracks_track_idx
          ON playlist_tracks(track_id);
      `);
    }

    await database.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  });
}
