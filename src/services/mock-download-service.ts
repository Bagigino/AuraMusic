import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import {
  TEST_TRACK_ASSET,
  TEST_TRACK_FILE_NAME,
  TEST_TRACK_INFO,
  TEST_TRACK_SOURCE_URL,
} from '@/constants/test-track';
import type { Track } from '@/models/track';
import type {
  DownloadInfo,
  DownloadProgressCallback,
  DownloadService,
} from '@/services/download-service';
import { deleteManagedAudioFile } from '@/storage/music-file-storage';

type MockTrackEntry = {
  info: DownloadInfo;
  bundledAsset: number;
  fileName: string;
};

const mockCatalog: Record<string, MockTrackEntry> = {
  [TEST_TRACK_SOURCE_URL]: {
    info: TEST_TRACK_INFO,
    bundledAsset: TEST_TRACK_ASSET,
    fileName: TEST_TRACK_FILE_NAME,
  },
};

function getMockEntry(url: string): MockTrackEntry {
  const entry = mockCatalog[url];

  if (!entry) {
    throw new Error('Il servizio MOCK non conosce questo URL.');
  }

  return entry;
}

export class MockDownloadService implements DownloadService {
  async getInfo(url: string): Promise<DownloadInfo> {
    return { ...getMockEntry(url).info };
  }

  async downloadAudio(
    url: string,
    onProgress?: DownloadProgressCallback,
  ): Promise<Track> {
    const entry = getMockEntry(url);
    const info = await this.getInfo(url);

    onProgress?.({
      status: 'preparing',
      downloadedBytes: null,
      totalBytes: null,
      totalBytesEstimate: null,
      speed: null,
      eta: null,
      progress: 0,
    });

    const bundledAsset = await Asset.fromModule(entry.bundledAsset).downloadAsync();
    const bundledUri = bundledAsset.localUri ?? bundledAsset.uri;

    if (!bundledUri) {
      throw new Error('Il file audio incluso non è disponibile.');
    }

    if (Platform.OS === 'web') {
      onProgress?.({
        status: 'finished',
        downloadedBytes: null,
        totalBytes: null,
        totalBytesEstimate: null,
        speed: null,
        eta: 0,
        progress: 1,
      });
      return this.createTrack(info, bundledUri);
    }

    const musicDirectory = new Directory(Paths.document, 'music');
    musicDirectory.create({ idempotent: true, intermediates: true });

    const destination = new File(musicDirectory, entry.fileName);
    await new File(bundledUri).copy(destination, { overwrite: true });

    if (!destination.exists || destination.size === 0) {
      throw new Error('Non è stato possibile salvare il file audio locale.');
    }

    onProgress?.({
      status: 'finished',
      downloadedBytes: destination.size,
      totalBytes: destination.size,
      totalBytesEstimate: null,
      speed: null,
      eta: 0,
      progress: 1,
    });
    return this.createTrack(info, destination.uri);
  }

  async deleteAudio(track: Track): Promise<void> {
    deleteManagedAudioFile(track.localUri);
  }

  private createTrack(info: DownloadInfo, localUri: string): Track {
    return {
      id: info.id,
      title: info.title,
      artist: info.artist,
      thumbnail: info.thumbnail,
      duration: info.duration,
      sourceUrl: info.sourceUrl,
      localUri,
      downloadedAt: new Date().toISOString(),
      missingLocalFile: false,
    };
  }
}

export const mockDownloadService: DownloadService = new MockDownloadService();
