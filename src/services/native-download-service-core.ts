import type { Track } from '../models/track';
import type {
  DownloadInfo,
  DownloadProgress,
  DownloadProgressCallback,
  DownloadService,
} from './download-service';

export type NativeYouTubeVideoInfo = {
  id: string;
  title: string;
  uploader: string | null;
  duration: number | null;
  thumbnail: string | null;
  webpageUrl: string;
  hasM4aAudio: boolean;
  preferredM4aFormatId: string | null;
};

export type NativeDownloadedAudioResult = {
  success: true;
  alreadyExists: boolean;
  videoId: string;
  title: string;
  formatId: string;
  ext: 'm4a';
  localPath: string;
  localUri: string;
  fileSize: number | null;
};

export type NativeDownloadProgress = Omit<DownloadProgress, 'status'> & {
  status: 'downloading' | 'finished';
};

export type NativeDownloadAdapter = {
  extractYouTubeInfo(url: string): Promise<NativeYouTubeVideoInfo | string>;
  downloadYouTubeM4a(
    url: string,
    formatId?: string,
  ): Promise<NativeDownloadedAudioResult | string>;
  addDownloadProgressListener(
    listener: (progress: NativeDownloadProgress) => void,
  ): { remove(): void };
};

export type ManagedAudioState =
  | { status: 'missing'; uri: string; size: null }
  | { status: 'invalid'; uri: string; size: number | null }
  | { status: 'valid'; uri: string; size: number };

export type ManagedAudioStorage = {
  inspect(videoId: string): ManagedAudioState | Promise<ManagedAudioState>;
  verify(videoId: string, localUri: string):
    | Extract<ManagedAudioState, { status: 'valid' }>
    | Promise<Extract<ManagedAudioState, { status: 'valid' }>>;
  delete(localUri: string): void | Promise<void>;
};

export class NativeDownloadServiceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'NativeDownloadServiceError';
    this.code = code;
  }
}

export function mapYouTubeInfoToDownloadInfo(
  info: NativeYouTubeVideoInfo,
  sourceUrl: string,
): DownloadInfo {
  return {
    id: info.id,
    title: info.title,
    artist: info.uploader?.trim() || 'Unknown artist',
    thumbnail: info.thumbnail ?? '',
    duration: info.duration ?? 0,
    sourceUrl,
    hasM4aAudio: info.hasM4aAudio,
    preferredM4aFormatId: info.preferredM4aFormatId,
  };
}

function createTrack(info: DownloadInfo, localUri: string): Track {
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

export class NativeDownloadService implements DownloadService {
  private readonly infoCache = new Map<string, DownloadInfo>();
  private readonly nativeAdapter: NativeDownloadAdapter;
  private readonly storage: ManagedAudioStorage;
  private activeDownloadUrl: string | null = null;

  constructor(
    nativeAdapter: NativeDownloadAdapter,
    storage: ManagedAudioStorage,
  ) {
    this.nativeAdapter = nativeAdapter;
    this.storage = storage;
  }

  async getInfo(rawUrl: string): Promise<DownloadInfo> {
    const url = rawUrl.trim();
    const cachedInfo = this.infoCache.get(url);
    if (cachedInfo) {
      return cachedInfo;
    }

    const nativeInfo = await this.nativeAdapter.extractYouTubeInfo(url);
    if (typeof nativeInfo === 'string') {
      throw new NativeDownloadServiceError('NATIVE_UNAVAILABLE', nativeInfo);
    }

    const info = mapYouTubeInfoToDownloadInfo(nativeInfo, url);
    this.infoCache.set(url, info);
    return info;
  }

  async downloadAudio(
    rawUrl: string,
    onProgress?: DownloadProgressCallback,
  ): Promise<Track> {
    const url = rawUrl.trim();
    if (this.activeDownloadUrl !== null) {
      throw new NativeDownloadServiceError(
        'DOWNLOAD_IN_PROGRESS',
        'Un download audio e gia in corso.',
      );
    }

    this.activeDownloadUrl = url;
    try {
      const info = await this.getInfo(url);
      if (!info.hasM4aAudio || !info.preferredM4aFormatId) {
        throw new NativeDownloadServiceError(
          'NO_M4A_FORMAT',
          'No compatible M4A audio format available.',
        );
      }

      onProgress?.({
        status: 'preparing',
        downloadedBytes: null,
        totalBytes: null,
        totalBytesEstimate: null,
        speed: null,
        eta: null,
        progress: null,
      });

      const existingFile = await this.storage.inspect(info.id);
      if (existingFile.status === 'invalid') {
        throw new NativeDownloadServiceError(
          'EXISTING_FILE_INVALID',
          'Esiste un file locale per questo video, ma e vuoto o non valido.',
        );
      }
      if (existingFile.status === 'valid') {
        onProgress?.({
          status: 'finished',
          downloadedBytes: existingFile.size,
          totalBytes: existingFile.size,
          totalBytesEstimate: null,
          speed: null,
          eta: 0,
          progress: 1,
        });
        return createTrack(info, existingFile.uri);
      }

      const subscription = this.nativeAdapter.addDownloadProgressListener((progress) => {
        onProgress?.(progress);
      });

      try {
        const result = await this.nativeAdapter.downloadYouTubeM4a(
          url,
          info.preferredM4aFormatId,
        );
        if (typeof result === 'string') {
          throw new NativeDownloadServiceError('NATIVE_UNAVAILABLE', result);
        }
        if (
          !result.success ||
          result.videoId !== info.id ||
          result.ext.toLowerCase() !== 'm4a'
        ) {
          throw new NativeDownloadServiceError(
            'INVALID_DOWNLOAD_RESULT',
            'Il modulo nativo ha restituito un file audio inatteso.',
          );
        }

        const verifiedFile = await this.storage.verify(info.id, result.localUri);
        return createTrack(info, verifiedFile.uri);
      } finally {
        subscription.remove();
      }
    } finally {
      this.activeDownloadUrl = null;
    }
  }

  async deleteAudio(track: Track): Promise<void> {
    await this.storage.delete(track.localUri);
  }
}
