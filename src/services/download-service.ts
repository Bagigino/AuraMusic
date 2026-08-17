import type { Track } from '@/models/track';

export type TrackInfo = Omit<Track, 'localUri' | 'downloadedAt' | 'missingLocalFile'>;

export type DownloadInfo = TrackInfo & {
  hasM4aAudio: boolean;
  preferredM4aFormatId: string | null;
};

export type DownloadProgress = {
  status: 'preparing' | 'downloading' | 'finished';
  downloadedBytes: number | null;
  totalBytes: number | null;
  totalBytesEstimate: number | null;
  speed: number | null;
  eta: number | null;
  progress: number | null;
};

export type DownloadProgressCallback = (progress: DownloadProgress) => void;

export interface DownloadService {
  getInfo(url: string): Promise<DownloadInfo>;
  downloadAudio(url: string, onProgress?: DownloadProgressCallback): Promise<Track>;
  deleteAudio(track: Track): Promise<void>;
}
