import {
  UnavailableYouTubeSearchService,
  type YouTubeSearchService,
} from '@/services/youtube-search-service';

export const appYouTubeSearchService: YouTubeSearchService =
  new UnavailableYouTubeSearchService();
