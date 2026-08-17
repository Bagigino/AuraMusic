import { TEST_TRACK_ID, TEST_TRACK_INFO, TEST_TRACK_SOURCE_URL } from '@/constants/test-track';
import {
  validateSearchQuery,
  type YouTubeSearchService,
} from '@/services/youtube-search-service';

export const appYouTubeSearchService: YouTubeSearchService = {
  async search(rawQuery) {
    validateSearchQuery(rawQuery);
    return [
      {
        id: TEST_TRACK_ID,
        title: TEST_TRACK_INFO.title,
        uploader: TEST_TRACK_INFO.artist,
        duration: TEST_TRACK_INFO.duration,
        thumbnail: TEST_TRACK_INFO.thumbnail,
        url: TEST_TRACK_SOURCE_URL,
      },
    ];
  },
};
