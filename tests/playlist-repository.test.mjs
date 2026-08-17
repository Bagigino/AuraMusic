import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPlaylist,
  getPlaylistIdsForTrack,
  getPlaylistTracksRows,
  setTrackPlaylistIds,
} from '../src/database/playlist-repository.ts';
import { deleteTrackWithMemberships } from '../src/database/track-repository.ts';

class FakePlaylistDatabase {
  playlists = new Map();
  tracks = new Map();
  memberships = [];

  async withTransactionAsync(task) { await task(); }

  async getFirstAsync(sql, ...args) {
    if (sql.includes('FROM playlists WHERE name')) {
      const name = args[0].toLowerCase();
      return [...this.playlists.values()].find((playlist) => playlist.name.toLowerCase() === name) ?? null;
    }
    if (sql.includes('FROM tracks WHERE id')) {
      const track = this.tracks.get(args[0]);
      return track ? { id: track.id } : null;
    }
    if (sql.includes('FROM playlists WHERE id')) {
      return this.playlists.get(args[0]) ?? null;
    }
    return null;
  }

  async getAllAsync(sql, ...args) {
    if (sql.includes('SELECT playlist_id FROM playlist_tracks')) {
      return this.memberships
        .filter((membership) => membership.track_id === args[0])
        .map((membership) => ({ playlist_id: membership.playlist_id }));
    }
    if (sql.includes('SELECT playlist_id, track_id, position, added_at')) {
      return this.memberships
        .filter((membership) => membership.playlist_id === args[0])
        .sort((left, right) => left.position - right.position);
    }
    return [];
  }

  async runAsync(sql, ...args) {
    if (sql.startsWith('INSERT INTO playlists ')) {
      const [id, name, createdAt, updatedAt] = args;
      this.playlists.set(id, { id, name, created_at: createdAt, updated_at: updatedAt });
      return;
    }
    if (sql.startsWith('DELETE FROM playlist_tracks WHERE track_id = ? AND')) {
      const [trackId, ...keptIds] = args;
      this.memberships = this.memberships.filter(
        (membership) => membership.track_id !== trackId || keptIds.includes(membership.playlist_id),
      );
      return;
    }
    if (sql === 'DELETE FROM playlist_tracks WHERE track_id = ?') {
      this.memberships = this.memberships.filter((membership) => membership.track_id !== args[0]);
      return;
    }
    if (sql.includes('INSERT INTO playlist_tracks')) {
      const [playlistId, trackId, addedAt] = args;
      const duplicate = this.memberships.some(
        (membership) => membership.playlist_id === playlistId && membership.track_id === trackId,
      );
      if (!duplicate) {
        const positions = this.memberships
          .filter((membership) => membership.playlist_id === playlistId)
          .map((membership) => membership.position);
        this.memberships.push({
          playlist_id: playlistId,
          track_id: trackId,
          position: positions.length ? Math.max(...positions) + 1 : 0,
          added_at: addedAt,
        });
      }
      return;
    }
    if (sql.startsWith('UPDATE playlists SET updated_at')) {
      const [updatedAt, playlistId] = args;
      const playlist = this.playlists.get(playlistId);
      if (playlist) playlist.updated_at = updatedAt;
      return;
    }
    if (sql === 'DELETE FROM tracks WHERE id = ?') {
      this.tracks.delete(args[0]);
      this.memberships = this.memberships.filter((membership) => membership.track_id !== args[0]);
      return;
    }
    throw new Error(`Unhandled SQL in fake: ${sql}`);
  }
}

const trackA = { id: 'track-a' };
const trackB = { id: 'track-b' };

async function setupDatabase() {
  const database = new FakePlaylistDatabase();
  database.tracks.set(trackA.id, trackA);
  database.tracks.set(trackB.id, trackB);
  await createPlaylist(database, 'Chill', { id: 'chill', now: 100 });
  await createPlaylist(database, 'Driving', { id: 'driving', now: 101 });
  return database;
}

test('create playlist trims names and rejects case-insensitive duplicates', async () => {
  const database = new FakePlaylistDatabase();
  const playlist = await createPlaylist(database, '  Late   Night  ', { id: 'late-night', now: 100 });
  assert.equal(playlist.name, 'Late Night');
  await assert.rejects(
    () => createPlaylist(database, 'late night', { id: 'duplicate', now: 101 }),
    (error) => error.code === 'DUPLICATE_PLAYLIST_NAME',
  );
});

test('one Track can belong to multiple playlists without duplicate memberships', async () => {
  const database = await setupDatabase();
  await setTrackPlaylistIds(database, trackA.id, ['chill', 'driving', 'chill'], 200);
  assert.deepEqual(new Set(await getPlaylistIdsForTrack(database, trackA.id)), new Set(['chill', 'driving']));
  assert.equal(database.memberships.length, 2);

  await setTrackPlaylistIds(database, trackA.id, ['chill', 'driving'], 201);
  assert.equal(database.memberships.length, 2);
  assert.equal(database.tracks.size, 2);
});

test('new memberships append at max position + 1', async () => {
  const database = await setupDatabase();
  await setTrackPlaylistIds(database, trackA.id, ['chill'], 200);
  await setTrackPlaylistIds(database, trackB.id, ['chill'], 201);
  const rows = await getPlaylistTracksRows(database, 'chill');
  assert.deepEqual(rows.map((row) => [row.trackId, row.position]), [
    [trackA.id, 0],
    [trackB.id, 1],
  ]);
});

test('removing a playlist membership never deletes the Track', async () => {
  const database = await setupDatabase();
  await setTrackPlaylistIds(database, trackA.id, ['chill', 'driving'], 200);
  await setTrackPlaylistIds(database, trackA.id, ['driving'], 201);
  assert.equal(database.tracks.has(trackA.id), true);
  assert.deepEqual(await getPlaylistIdsForTrack(database, trackA.id), ['driving']);
});

test('deleting a Library Track removes all memberships in the same transaction', async () => {
  const database = await setupDatabase();
  await setTrackPlaylistIds(database, trackA.id, ['chill', 'driving'], 200);
  await deleteTrackWithMemberships(database, trackA.id);
  assert.equal(database.tracks.has(trackA.id), false);
  assert.deepEqual(await getPlaylistIdsForTrack(database, trackA.id), []);
  assert.equal(database.playlists.size, 2);
});
