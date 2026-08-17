import type { EventSubscription } from 'expo-modules-core';

export type YtDlpImportResult = {
  success: boolean;
  version: string;
};

export type YtDlpAppleProviderResult = {
  success: boolean;
  provider: string;
  version: string;
};

export type YouTubeAudioFormat = {
  formatId: string;
  ext: string | null;
  audioCodec: string | null;
  bitrate: number | null;
  fileSize: number | null;
};

export type YouTubeVideoInfo = {
  id: string;
  title: string;
  uploader: string | null;
  duration: number | null;
  thumbnail: string | null;
  webpageUrl: string;
  audioFormats: YouTubeAudioFormat[];
  hasM4aAudio: boolean;
  preferredM4aFormatId: string | null;
};

export type YouTubeSearchResult = {
  id: string;
  title: string;
  uploader: string | null;
  duration: number | null;
  thumbnail: string | null;
  url: string;
};

export type YouTubePlaybackSource = {
  videoId: string;
  title: string;
  artist: string | null;
  thumbnail: string | null;
  duration: number | null;
  remoteUri: string;
  formatId: string;
  ext: string | null;
  headers?: Record<string, string>;
};

export type YouTubeExtractionErrorPayload = {
  code: string;
  message: string;
};

export type DownloadProgress = {
  status: 'downloading' | 'finished';
  downloadedBytes: number | null;
  totalBytes: number | null;
  totalBytesEstimate: number | null;
  speed: number | null;
  eta: number | null;
  progress: number | null;
};

export type DownloadedAudioResult = {
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

export type BackupArchiveEntry = {
  path: string;
  size: number;
};

export type BackupFileDigest = {
  sha256: string;
  size: number;
};

export type AuraNativeTestModuleApi = {
  getNativeMessage(): Promise<string>;
  testPython(): Promise<number | string>;
  testYtDlpImport(): Promise<YtDlpImportResult | string>;
  testYtDlpAppleProvider(): Promise<YtDlpAppleProviderResult | string>;
  searchYouTube(query: string, limit?: number): Promise<YouTubeSearchResult[] | string>;
  extractYouTubeInfo(url: string): Promise<YouTubeVideoInfo | string>;
  resolveYouTubePlaybackSource(url: string): Promise<YouTubePlaybackSource | string>;
  downloadYouTubeM4a(
    url: string,
    formatId?: string,
  ): Promise<DownloadedAudioResult | string>;
  sha256File(fileUri: string): Promise<BackupFileDigest>;
  createBackupArchive(
    sourceDirectoryUri: string,
    archiveUri: string,
  ): Promise<BackupArchiveEntry[]>;
  inspectBackupArchive(archiveUri: string): Promise<BackupArchiveEntry[]>;
  extractBackupArchive(
    archiveUri: string,
    destinationDirectoryUri: string,
  ): Promise<BackupArchiveEntry[]>;
  addListener(
    eventName: 'onDownloadProgress',
    listener: (event: DownloadProgress) => void,
  ): EventSubscription;
};
