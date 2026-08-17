import { searchYouTube } from '@/native/aura-native-test';
import { NativeYouTubeSearchService } from '@/services/youtube-search-service';

export const nativeYouTubeSearchService = new NativeYouTubeSearchService({ searchYouTube });
