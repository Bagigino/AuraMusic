import assert from 'node:assert/strict';
import test from 'node:test';

import { DATABASE_VERSION, migrateDatabase } from '../src/database/migrations.ts';

test('v1 migration preserves tracks and adds playlist tables without recreating the database', async () => {
  const sql = [];
  const database = {
    async getFirstAsync(statement) {
      sql.push(statement);
      return { user_version: 1 };
    },
    async execAsync(statement) { sql.push(statement); },
    async withTransactionAsync(task) { await task(); },
  };
  await migrateDatabase(database);
  const script = sql.join('\n');
  assert.match(script, /PRAGMA foreign_keys = ON/);
  assert.match(script, /CREATE TABLE IF NOT EXISTS playlists/);
  assert.match(script, /CREATE TABLE IF NOT EXISTS playlist_tracks/);
  assert.match(script, /FOREIGN KEY \(track_id\).*ON DELETE CASCADE/s);
  assert.match(script, new RegExp(`PRAGMA user_version = ${DATABASE_VERSION}`));
  assert.doesNotMatch(script, /CREATE TABLE IF NOT EXISTS tracks/);
});
