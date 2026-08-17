import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getEffectivePlaybackDuration,
  hasExcessiveMediaTail,
  reachedEffectiveEnd,
} from '../src/audio/playback-duration.ts';

test('normal container rounding keeps expo-audio duration', () => {
  assert.equal(getEffectivePlaybackDuration(243.4, 243), 243.4);
  assert.equal(hasExcessiveMediaTail(243.4, 243), false);
});

test('an implausibly long M4A timeline is capped to YouTube metadata duration', () => {
  assert.equal(getEffectivePlaybackDuration(470, 243), 243);
  assert.equal(hasExcessiveMediaTail(470, 243), true);
  assert.equal(reachedEffectiveEnd(242.9, 243), false);
  assert.equal(reachedEffectiveEnd(243, 243), true);
});

test('duration fallback handles missing media or metadata safely', () => {
  assert.equal(getEffectivePlaybackDuration(0, 243), 243);
  assert.equal(getEffectivePlaybackDuration(243, null), 243);
  assert.equal(getEffectivePlaybackDuration(0, null), 0);
  assert.equal(hasExcessiveMediaTail(0, 243), false);
});
