import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), 'utf8');
}

test('Player is hidden from tabs and the global Mini Player shares the audio provider', async () => {
  const layout = await source('../src/app/_layout.tsx');
  assert.match(layout, /<Tabs\.Screen name="player" options=\{\{ href: null \}\} \/>/);
  assert.doesNotMatch(layout, /title: 'Player'/);
  assert.match(
    layout,
    /<AudioPlayerProvider>[\s\S]*<Tabs[\s\S]*<MiniPlayer \/>[\s\S]*<\/AudioPlayerProvider>/,
  );
});

test('Search and list selections start queue playback without opening Full Player', async () => {
  const [search, allSongs, playlist, debugCard] = await Promise.all([
    source('../src/app/search.tsx'),
    source('../src/app/all-songs.tsx'),
    source('../src/app/playlist.tsx'),
    source('../src/components/native-module-debug-card.tsx'),
  ]);
  assert.match(search, /playSearchResult\(result, state\.results\)/);
  assert.match(allSongs, /playTrack\(track, \{ tracks: allSongs, source: 'all-songs' \}\)/);
  assert.match(playlist, /playTrack\(track, \{ tracks, source: 'playlist' \}\)/);
  for (const screen of [search, allSongs, playlist, debugCard]) {
    assert.doesNotMatch(screen, /router\.(push|replace)\('\/player'\)/);
  }
});

test('Mini Player alone opens Full Player and closing it does not clear playback', async () => {
  const [miniPlayer, fullPlayer] = await Promise.all([
    source('../src/components/mini-player.tsx'),
    source('../src/app/player.tsx'),
  ]);
  assert.match(miniPlayer, /router\.push\('\/player'\)/);
  assert.match(miniPlayer, /playPrevious/);
  assert.match(miniPlayer, /togglePlayback/);
  assert.match(miniPlayer, /playNext/);
  assert.match(fullPlayer, /router\.replace\('\/'\)/);
  assert.match(fullPlayer, /router\.back\(\)/);
  assert.doesNotMatch(fullPlayer, /clearPlayback|resetPlayer/);
});

test('track activation never clears expo-audio with a null native source', async () => {
  const playerContext = await source('../src/audio/audio-player-context.tsx');
  assert.doesNotMatch(playerContext, /player\.replace\(null\)/);
  assert.match(playerContext, /player\.replace\(toExpoAudioSource\(nextSource\)\)/);
  assert.match(playerContext, /player\.replace\(\{\}\)/);
});

test('screen padding expands only while Mini Player is present', async () => {
  const { getScreenBottomPadding } = await import(
    '../src/components/player-layout-metrics.ts'
  );
  const withoutMini = getScreenBottomPadding(34, false);
  const withMini = getScreenBottomPadding(34, true);
  assert.ok(withMini > withoutMini);
  assert.equal(withMini - withoutMini, 76);
  assert.ok(getScreenBottomPadding(34, true, true) < withMini);
});
