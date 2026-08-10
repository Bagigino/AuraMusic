import type { TrackInfo } from '@/services/download-service';

export const TEST_TRACK_ID = 'aura-test-track-v1';
export const TEST_TRACK_SOURCE_URL = 'mock://aura-test-tone';
export const TEST_TRACK_FILE_NAME = 'aura-test.m4a';
export const TEST_TRACK_ASSET = require('@/assets/audio/aura-test.m4a');

export const TEST_TRACK_INFO: TrackInfo = {
  id: TEST_TRACK_ID,
  title: 'Aura Test Tone',
  artist: 'AuraMusic',
  thumbnail: '',
  duration: 12,
  sourceUrl: TEST_TRACK_SOURCE_URL,
};
