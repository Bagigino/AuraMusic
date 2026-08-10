import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 1;

export async function migrateDatabase(database: SQLiteDatabase) {
  const versionRow = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion >= DATABASE_VERSION) {
    return;
  }

  await database.execAsync('PRAGMA journal_mode = WAL');

  if (currentVersion === 0) {
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

  await database.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
