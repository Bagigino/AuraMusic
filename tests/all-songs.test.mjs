import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { selectAllSongs } from '../src/library/all-songs.ts';

function track(id, downloadedAt) {
  return {
    id,
    title: id,
    artist: 'Artist',
    thumbnail: '',
    duration: 100,
    sourceUrl: `https://youtube.com/watch?v=${id}`,
    localUri: `file:///music/${id}.m4a`,
    downloadedAt,
    missingLocalFile: false,
  };
}

test('Le mie canzoni contains Track rows ordered by downloadedAt DESC', () => {
  const older = track('older', '2026-08-10T10:00:00.000Z');
  const newest = track('newest', '2026-08-17T10:00:00.000Z');
  assert.deepEqual(selectAllSongs([older, newest]).map(({ id }) => id), ['newest', 'older']);
});

test('playlist membership does not affect the virtual collection or its count', () => {
  const withoutPlaylist = track('standalone', '2026-08-16T10:00:00.000Z');
  const inThreePlaylists = track('shared', '2026-08-17T10:00:00.000Z');
  const membershipIds = ['chill', 'driving', 'favourites'];
  const allSongs = selectAllSongs([withoutPlaylist, inThreePlaylists]);

  assert.equal(membershipIds.length, 3);
  assert.deepEqual(allSongs.map(({ id }) => id), ['shared', 'standalone']);
  assert.equal(allSongs.length, 2);
});

test('the virtual collection defensively renders a Track id only once', () => {
  const shared = track('shared', '2026-08-17T10:00:00.000Z');
  assert.equal(selectAllSongs([shared, shared, shared]).length, 1);
});

test('Player keeps the playlist action icon-only', async () => {
  const source = await readFile(new URL('../src/app/player.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Add to playlist|Nelle tue playlist|addStatus/);
  assert.match(source, /membershipCount > 0 \? '✓' : '\+'/);
  assert.match(source, /onPress=\{\(\) => setPickerVisible\(true\)\}/);
  assert.match(source, /<PlaylistPicker/);
  assert.doesNotMatch(source, /bottomActions/);

  const controlsStart = source.indexOf('<View style={styles.controls}>');
  const controlsEnd = source.indexOf('</View>', controlsStart);
  const controls = source.slice(controlsStart, controlsEnd);
  assert.match(controls, /setPickerVisible\(true\)/);
  assert.match(controls, /Indietro di 15 secondi/);
  assert.match(controls, /Riproduci/);
  assert.match(controls, /Avanti di 15 secondi/);
});
