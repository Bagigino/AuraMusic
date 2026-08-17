import { resolveYouTubePlaybackSource } from '@/native/aura-native-test';
import { NativePlaybackSourceService } from '@/services/playback-source-service';

export const appPlaybackSourceService = new NativePlaybackSourceService({
  resolveYouTubePlaybackSource,
});
