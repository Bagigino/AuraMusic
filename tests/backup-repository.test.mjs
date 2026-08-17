import assert from 'node:assert/strict';
import test from 'node:test';

import { replaceLibraryRows } from '../src/database/backup-repository.ts';

test('restore writes Tracks, playlists and ordered multi-playlist memberships', async () => {
  const calls = [];
  const database = {
    async runAsync(sql, ...params) {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    },
  };
  const library = {
    tracks: [{
      id: 'shared_track',
      title: 'Shared',
      artist: 'Artist',
      thumbnail: '',
      duration: 120,
      sourceUrl: 'https://youtube.com/watch?v=shared_track',
      downloadedAt: '2026-08-17T10:00:00.000Z',
      audioFileName: 'shared_track.m4a',
    }],
    playlists: [
      { id: 'first', name: 'First', createdAt: 1, updatedAt: 2 },
      { id: 'second', name: 'Second', createdAt: 3, updatedAt: 4 },
    ],
    playlistTracks: [
      { playlistId: 'first', trackId: 'shared_track', position: 8, addedAt: 10 },
      { playlistId: 'second', trackId: 'shared_track', position: 2, addedAt: 11 },
    ],
  };

  await replaceLibraryRows(
    database,
    library,
    (fileName) => `file:///new-sandbox/Documents/music/${fileName}`,
  );

  assert.deepEqual(calls.slice(0, 3).map(({ sql }) => sql), [
    'DELETE FROM playlist_tracks',
    'DELETE FROM playlists',
    'DELETE FROM tracks',
  ]);
  const trackInsert = calls.find(({ sql }) => sql.startsWith('INSERT INTO tracks'));
  assert.equal(trackInsert.params[6], 'file:///new-sandbox/Documents/music/shared_track.m4a');
  const membershipInserts = calls.filter(({ sql }) => sql.startsWith('INSERT INTO playlist_tracks'));
  assert.deepEqual(membershipInserts.map(({ params }) => params), [
    ['first', 'shared_track', 8, 10],
    ['second', 'shared_track', 2, 11],
  ]);
});
