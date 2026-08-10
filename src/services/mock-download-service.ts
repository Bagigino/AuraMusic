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
  DownloadProgressCallback,
  DownloadService,
  TrackInfo,
} from '@/services/download-service';

type MockTrackEntry = {
  info: TrackInfo;
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
  async getInfo(url: string): Promise<TrackInfo> {
    return { ...getMockEntry(url).info };
  }

  async downloadAudio(
    url: string,
    onProgress?: DownloadProgressCallback,
  ): Promise<Track> {
    const entry = getMockEntry(url);
    const info = await this.getInfo(url);

    onProgress?.(0);

    const bundledAsset = await Asset.fromModule(entry.bundledAsset).downloadAsync();
    const bundledUri = bundledAsset.localUri ?? bundledAsset.uri;

    if (!bundledUri) {
      throw new Error('Il file audio incluso non è disponibile.');
    }

    if (Platform.OS === 'web') {
      onProgress?.(1);
      return this.createTrack(info, bundledUri);
    }

    const musicDirectory = new Directory(Paths.document, 'music');
    musicDirectory.create({ idempotent: true, intermediates: true });

    const destination = new File(musicDirectory, entry.fileName);
    await new File(bundledUri).copy(destination, { overwrite: true });

    if (!destination.exists || destination.size === 0) {
      throw new Error('Non è stato possibile salvare il file audio locale.');
    }

    onProgress?.(1);
    return this.createTrack(info, destination.uri);
  }

  private createTrack(info: TrackInfo, localUri: string): Track {
    return {
      ...info,
      localUri,
      downloadedAt: new Date().toISOString(),
    };
  }
}

export const mockDownloadService: DownloadService = new MockDownloadService();
