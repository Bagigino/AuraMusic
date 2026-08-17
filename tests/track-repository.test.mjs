import assert from 'node:assert/strict';
import test from 'node:test';

import { deleteTrack, getTracks, saveTrack } from '../src/database/track-repository.ts';

const track = {
  id: 'video_123',
  title: 'Test video',
  artist: 'Test channel',
  thumbnail: 'https://example.com/thumb.jpg',
  duration: 123,
  sourceUrl: 'https://youtu.be/video_123',
  localUri: 'file:///documents/music/video_123.m4a',
  downloadedAt: '2026-08-17T12:00:00.000Z',
  missingLocalFile: false,
};

test('saveTrack persists the complete Track metadata', async () => {
  const calls = [];
  await saveTrack(
    {
      async runAsync(...args) {
        calls.push(args);
      },
    },
    track,
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(-8), [
    track.id,
    track.title,
    track.artist,
    track.thumbnail,
    track.duration,
    track.sourceUrl,
    track.localUri,
    track.downloadedAt,
  ]);
});

test('getTracks restores SQLite rows and initializes file availability', async () => {
  let query = '';
  const tracks = await getTracks({
    async getAllAsync(sql) {
      query = sql;
      return [
        {
          id: track.id,
          title: track.title,
          artist: track.artist,
          thumbnail: track.thumbnail,
          duration: track.duration,
          source_url: track.sourceUrl,
          local_uri: track.localUri,
          downloaded_at: track.downloadedAt,
        },
      ];
    },
  });
  assert.deepEqual(tracks, [track]);
  assert.match(query, /ORDER BY downloaded_at DESC/);
});

test('deleteTrack removes only the requested SQLite record', async () => {
  const calls = [];
  await deleteTrack({ async runAsync(...args) { calls.push(args); } }, track.id);
  assert.deepEqual(calls, [['DELETE FROM tracks WHERE id = ?', track.id]]);
});
