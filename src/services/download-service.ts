import type { Track } from '@/models/track';

export type TrackInfo = Omit<Track, 'localUri' | 'downloadedAt'>;

export type DownloadProgressCallback = (progress: number) => void;

export interface DownloadService {
  getInfo(url: string): Promise<TrackInfo>;
  downloadAudio(url: string, onProgress?: DownloadProgressCallback): Promise<Track>;
}
