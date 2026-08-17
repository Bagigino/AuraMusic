import {
  addDownloadProgressListener,
  downloadYouTubeM4a,
  extractYouTubeInfo,
} from '@/native/aura-native-test';
import { NativeDownloadService } from '@/services/native-download-service-core';
import {
  deleteManagedAudioFile,
  inspectManagedAudioFile,
  verifyManagedAudioFile,
} from '@/storage/music-file-storage';

export const nativeDownloadService = new NativeDownloadService(
  {
    addDownloadProgressListener,
    downloadYouTubeM4a,
    extractYouTubeInfo,
  },
  {
    delete: deleteManagedAudioFile,
    inspect: inspectManagedAudioFile,
    verify: verifyManagedAudioFile,
  },
);
