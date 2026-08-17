import { Asset } from 'expo-asset';

import { TEST_TRACK_ASSET, TEST_TRACK_ID, TEST_TRACK_INFO } from '@/constants/test-track';
import type { PlaybackSourceService } from '@/services/playback-source-service';

export const appPlaybackSourceService: PlaybackSourceService = {
  async resolveYouTubePlaybackSource() {
    const asset = await Asset.fromModule(TEST_TRACK_ASSET).downloadAsync();
    return {
      videoId: TEST_TRACK_ID,
      title: TEST_TRACK_INFO.title,
      artist: TEST_TRACK_INFO.artist,
      thumbnail: TEST_TRACK_INFO.thumbnail,
      duration: TEST_TRACK_INFO.duration,
      remoteUri: asset.localUri ?? asset.uri,
      formatId: 'web-mock-m4a',
      ext: 'm4a',
    };
  },
};
