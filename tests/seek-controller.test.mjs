import assert from 'node:assert/strict';
import test from 'node:test';

import {
  beginScrubbing,
  clampSeekPosition,
  commitSeekPosition,
  finishScrubbing,
  getRelativeSeekPosition,
  getSeekDisplayPosition,
  getSeekResumePosition,
  idleSeekScrubState,
  seekPositionFromOffset,
  updateScrubbing,
} from '../src/audio/seek-controller.ts';

test('tap maps the touched offset to the playback duration', () => {
  assert.equal(seekPositionFromOffset(75, 300, 240), 60);
});

test('drag previews forward and backward and commits only the release position', async () => {
  let state = beginScrubbing(30, 240);
  state = updateScrubbing(state, 180, 240);
  assert.equal(getSeekDisplayPosition(35, state, 240), 180);
  state = updateScrubbing(state, 70, 240);
  assert.equal(getSeekDisplayPosition(190, state, 240), 70);

  const calls = [];
  await commitSeekPosition(finishScrubbing(state, 240), 240, (position) => calls.push(position));
  assert.deepEqual(calls, [70]);
});

test('seek clamps to the start/end and disables invalid or missing durations', () => {
  assert.equal(clampSeekPosition(-20, 200), 0);
  assert.equal(clampSeekPosition(250, 200), 200);
  assert.equal(clampSeekPosition(20, 0), null);
  assert.equal(clampSeekPosition(20, null), null);
  assert.equal(clampSeekPosition(20, Number.NaN), null);
  assert.equal(seekPositionFromOffset(10, 0, 200), null);
  assert.equal(finishScrubbing(idleSeekScrubState, 200), null);
});

test('external player updates do not overwrite the scrub preview', () => {
  const state = beginScrubbing(90, 240);
  assert.equal(getSeekDisplayPosition(20, state, 240), 90);
  assert.equal(getSeekDisplayPosition(45, state, 240), 90);
  assert.equal(getSeekDisplayPosition(45, idleSeekScrubState, 240), 45);
});

test('relative ±15 second controls use the same clamped seek math', () => {
  assert.equal(getRelativeSeekPosition(40, -15, 200), 25);
  assert.equal(getRelativeSeekPosition(195, 15, 200), 200);
  assert.equal(getRelativeSeekPosition(5, -15, 200), 0);
});

test('the same single seek contract supports mocked local and remote players', async () => {
  const localCalls = [];
  const remoteCalls = [];
  await commitSeekPosition(80, 200, async (position) => localCalls.push(position));
  await commitSeekPosition(120, 200, async (position) => remoteCalls.push(position));
  assert.deepEqual(localCalls, [80]);
  assert.deepEqual(remoteCalls, [120]);
});

test('a rejected remote seek is surfaced without retry loops in the UI helper', async () => {
  let calls = 0;
  await assert.rejects(
    () => commitSeekPosition(120, 200, async () => {
      calls += 1;
      throw new Error('expired remote URL');
    }),
    /expired remote URL/,
  );
  assert.equal(calls, 1);
});

test('an expired remote source resumes at the requested seek target, not stale playback time', () => {
  assert.equal(getSeekResumePosition(35, 140), 140);
  assert.equal(getSeekResumePosition(35, null), 35);
});
