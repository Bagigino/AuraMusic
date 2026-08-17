import assert from 'node:assert/strict';
import test from 'node:test';

import { saveTrackToPlaylists } from '../src/library/save-track-to-playlists.ts';

const track = {
  id: 'dQw4w9WgXcQ',
  title: 'Saved song',
  artist: 'Artist',
  thumbnail: '',
  duration: 123,
  sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  localUri: 'file:///documents/music/dQw4w9WgXcQ.m4a',
  downloadedAt: '2026-08-17T12:00:00.000Z',
  missingLocalFile: false,
};

test('remote add flow downloads, then atomically persists Track and memberships', async () => {
  const order = [];
  const result = await saveTrackToPlaylists(
    {
      async findTrack() { return null; },
      localFileExists() { return false; },
      async downloadAudio() { order.push('download'); return track; },
      async persistTrackWithPlaylists(savedTrack, ids) {
        order.push('persist');
        assert.equal(savedTrack.id, track.id);
        assert.deepEqual(ids, ['chill', 'driving']);
      },
      async setExistingTrackPlaylists() { throw new Error('not expected'); },
      async deleteAudio() { throw new Error('not expected'); },
    },
    { videoId: track.id, sourceUrl: track.sourceUrl, playlistIds: ['chill', 'driving'] },
  );
  assert.deepEqual(order, ['download', 'persist']);
  assert.equal(result.downloaded, true);
});

test('an existing local Track only changes memberships and never downloads', async () => {
  const memberships = [];
  const result = await saveTrackToPlaylists(
    {
      async findTrack() { return track; },
      localFileExists() { return true; },
      async downloadAudio() { throw new Error('must not download'); },
      async persistTrackWithPlaylists() { throw new Error('must not persist duplicate'); },
      async setExistingTrackPlaylists(id, ids) { memberships.push([id, ids]); },
      async deleteAudio() { throw new Error('must not delete'); },
    },
    { videoId: track.id, sourceUrl: track.sourceUrl, playlistIds: ['chill'] },
  );
  assert.equal(result.downloaded, false);
  assert.deepEqual(memberships, [[track.id, ['chill']]]);
});

test('download failure creates neither Track nor orphan membership', async () => {
  let persisted = false;
  await assert.rejects(() => saveTrackToPlaylists(
    {
      async findTrack() { return null; },
      localFileExists() { return false; },
      async downloadAudio() { throw new Error('network failed'); },
      async persistTrackWithPlaylists() { persisted = true; },
      async setExistingTrackPlaylists() { persisted = true; },
      async deleteAudio() {},
    },
    { videoId: track.id, sourceUrl: track.sourceUrl, playlistIds: ['chill'] },
  ));
  assert.equal(persisted, false);
});

test('database failure removes the newly downloaded orphan file', async () => {
  let cleaned = false;
  await assert.rejects(() => saveTrackToPlaylists(
    {
      async findTrack() { return null; },
      localFileExists() { return false; },
      async downloadAudio() { return track; },
      async persistTrackWithPlaylists() { throw new Error('sqlite failed'); },
      async setExistingTrackPlaylists() {},
      async deleteAudio() { cleaned = true; },
    },
    { videoId: track.id, sourceUrl: track.sourceUrl, playlistIds: ['chill'] },
  ));
  assert.equal(cleaned, true);
});
