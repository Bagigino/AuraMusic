import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSearchPlaybackQueue,
  createSinglePlaybackQueue,
  createTrackPlaybackQueue,
  getEndOfQueueAction,
  getNextQueueIndex,
  getPlaybackToggleAction,
  getPreviousQueueAction,
  queueWithCurrentIndex,
  shouldShowMiniPlayer,
} from '../src/audio/playback-queue.ts';

function track(id) {
  return {
    id,
    title: id,
    artist: 'Artist',
    thumbnail: '',
    duration: 100,
    sourceUrl: `https://youtube.com/watch?v=${id}`,
    localUri: `file:///music/${id}.m4a`,
    downloadedAt: '2026-08-17T10:00:00.000Z',
    missingLocalFile: false,
  };
}

function result(id) {
  return {
    id,
    title: id,
    uploader: 'Uploader',
    duration: 100,
    thumbnail: null,
    url: `https://youtube.com/watch?v=${id}`,
  };
}

test('Mini Player visibility follows activeTrack, not playing state', () => {
  const active = createSinglePlaybackQueue({
    id: 'active', title: 'Active', artist: null, thumbnail: null, duration: 100, sourceUrl: 'https://youtube.com/watch?v=active',
  }).tracks[0];
  assert.equal(shouldShowMiniPlayer(null), false);
  assert.equal(shouldShowMiniPlayer(active), true);
  assert.equal(shouldShowMiniPlayer(active), true, 'paused active Track remains visible');
  assert.equal(shouldShowMiniPlayer(active, true), false, 'Full Player does not duplicate Mini Player');
  assert.equal(shouldShowMiniPlayer(null), false, 'clearPlayback hides Mini Player');
});

test('Play and Pause choose the correct action without a second player state', () => {
  const base = {
    hasActiveTrack: true,
    hasSource: true,
    isResolving: false,
    didJustFinish: false,
    reachedEnd: false,
  };
  assert.equal(getPlaybackToggleAction({ ...base, isPlaying: false }), 'play');
  assert.equal(getPlaybackToggleAction({ ...base, isPlaying: true }), 'pause');
  assert.equal(
    getPlaybackToggleAction({ ...base, isPlaying: false, didJustFinish: true }),
    'restart-and-play',
  );
  assert.equal(
    getPlaybackToggleAction({ ...base, isPlaying: false, isResolving: true }),
    'none',
  );
});

test('Search queue preserves result order and selected index', () => {
  const queue = createSearchPlaybackQueue(
    [result('one'), result('two'), result('three'), result('four')],
    'three',
  );
  assert.equal(queue.source, 'search');
  assert.equal(queue.currentIndex, 2);
  assert.equal(queue.tracks[getNextQueueIndex(queue)].id, 'four');
});

test('All Songs and Playlist queues preserve their supplied order', () => {
  const allSongs = createTrackPlaybackQueue([track('new'), track('old')], 'old', 'all-songs');
  const playlist = createTrackPlaybackQueue(
    [track('position-0'), track('position-1'), track('position-2')],
    'position-1',
    'playlist',
  );
  assert.deepEqual(allSongs.tracks.map(({ id }) => id), ['new', 'old']);
  assert.equal(allSongs.currentIndex, 1);
  assert.deepEqual(playlist.tracks.map(({ id }) => id), ['position-0', 'position-1', 'position-2']);
  assert.equal(playlist.currentIndex, 1);
});

test('single queue restarts on Previous and has disabled Next', () => {
  const queue = createSinglePlaybackQueue({
    id: 'only', title: 'Only', artist: null, thumbnail: null, duration: 10, sourceUrl: 'https://youtube.com/watch?v=only',
  });
  assert.deepEqual(getPreviousQueueAction(queue, 0), { type: 'restart' });
  assert.equal(getNextQueueIndex(queue), null);
});

test('Previous restarts after 3 seconds and changes track at or below 3 seconds', () => {
  const queue = createTrackPlaybackQueue([track('first'), track('second')], 'second', 'playlist');
  assert.deepEqual(getPreviousQueueAction(queue, 3.1), { type: 'restart' });
  assert.deepEqual(getPreviousQueueAction(queue, 3), { type: 'previous', index: 0 });
});

test('Next updates currentIndex without wrap-around', () => {
  const queue = createTrackPlaybackQueue([track('first'), track('second')], 'first', 'all-songs');
  const next = queueWithCurrentIndex(queue, getNextQueueIndex(queue));
  assert.equal(next.currentIndex, 1);
  assert.equal(getNextQueueIndex(next), null);
});

test('natural end autoplays Next and last Track keeps the session', () => {
  const queue = createSearchPlaybackQueue([result('first'), result('last')], 'first');
  assert.deepEqual(getEndOfQueueAction(queue), { type: 'next', index: 1 });
  assert.deepEqual(getEndOfQueueAction(queueWithCurrentIndex(queue, 1)), { type: 'stay' });
});
