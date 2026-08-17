import assert from 'node:assert/strict';
import test from 'node:test';

import { getDuplicateTrackStatus } from '../src/library/track-duplicate-detection.ts';
import { applyLocalFileAvailability } from '../src/library/track-file-validation.ts';
import {
  createInitialDownloadFlowState,
  downloadFlowReducer,
} from '../src/services/download-flow-state.ts';

const info = {
  id: 'video_123',
  title: 'Test video',
  artist: 'Test channel',
  thumbnail: '',
  duration: 123,
  sourceUrl: 'https://youtu.be/video_123',
  hasM4aAudio: true,
  preferredM4aFormatId: '140',
};

const track = {
  id: info.id,
  title: info.title,
  artist: info.artist,
  thumbnail: info.thumbnail,
  duration: info.duration,
  sourceUrl: info.sourceUrl,
  localUri: 'file:///documents/music/video_123.m4a',
  downloadedAt: '2026-08-17T12:00:00.000Z',
  missingLocalFile: false,
};

test('download reducer follows analyze, download, save, and completed states', () => {
  let state = createInitialDownloadFlowState(info.sourceUrl);
  state = downloadFlowReducer(state, { type: 'ANALYZE_STARTED' });
  assert.equal(state.status, 'analyzing');
  state = downloadFlowReducer(state, {
    type: 'ANALYZE_SUCCEEDED',
    info,
    duplicate: false,
    duplicateMissingFile: false,
  });
  assert.equal(state.status, 'ready');
  state = downloadFlowReducer(state, { type: 'DOWNLOAD_STARTED' });
  assert.equal(state.status, 'downloading');
  state = downloadFlowReducer(state, { type: 'SAVE_STARTED' });
  assert.equal(state.status, 'saving');
  state = downloadFlowReducer(state, { type: 'COMPLETED', track });
  assert.equal(state.status, 'completed');
  assert.equal(state.completedTrack.id, 'video_123');
});

test('download reducer enters a single explicit error state', () => {
  const state = downloadFlowReducer(createInitialDownloadFlowState(), {
    type: 'FAILED',
    message: 'Network unavailable',
  });
  assert.equal(state.status, 'error');
  assert.equal(state.error, 'Network unavailable');
});

test('duplicate detection reports both present and missing local files', () => {
  assert.deepEqual(getDuplicateTrackStatus(null, () => false), {
    duplicate: false,
    duplicateMissingFile: false,
  });
  assert.deepEqual(getDuplicateTrackStatus(track, () => false), {
    duplicate: true,
    duplicateMissingFile: true,
  });
});

test('library validation marks a missing localUri without deleting the Track', async () => {
  const validated = await applyLocalFileAvailability([track], () => false);
  assert.equal(validated.length, 1);
  assert.equal(validated[0].missingLocalFile, true);
  assert.equal(validated[0].id, track.id);
});
