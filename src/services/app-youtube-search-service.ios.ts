import { nativeYouTubeSearchService } from '@/services/native-youtube-search-service.ios';
import type { YouTubeSearchService } from '@/services/youtube-search-service';

export const appYouTubeSearchService: YouTubeSearchService = nativeYouTubeSearchService;
