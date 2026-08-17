import AuraNativeTestModule from './src/AuraNativeTestModule';
import type {
  DownloadedAudioResult,
  DownloadProgress,
  YouTubeExtractionErrorPayload,
  YouTubeSearchResult,
  YouTubePlaybackSource,
  YouTubeVideoInfo,
  YtDlpAppleProviderResult,
  YtDlpImportResult,
} from './src/AuraNativeTest.types';

export type {
  DownloadedAudioResult,
  DownloadProgress,
  YouTubeAudioFormat,
  YouTubeExtractionErrorPayload,
  YouTubeSearchResult,
  YouTubePlaybackSource,
  YouTubeVideoInfo,
  YtDlpAppleProviderResult,
  YtDlpImportResult,
} from './src/AuraNativeTest.types';

export class YouTubeExtractionError extends Error {
  readonly code: string;

  constructor({ code, message }: YouTubeExtractionErrorPayload) {
    super(message);
    this.name = 'YouTubeExtractionError';
    this.code = code;
  }
}

export class YouTubeDownloadError extends Error {
  readonly code: string;

  constructor({ code, message }: YouTubeExtractionErrorPayload) {
    super(message);
    this.name = 'YouTubeDownloadError';
    this.code = code;
  }
}

export class YouTubeSearchError extends Error {
  readonly code: string;

  constructor({ code, message }: YouTubeExtractionErrorPayload) {
    super(message);
    this.name = 'YouTubeSearchError';
    this.code = code;
  }
}

export class YouTubePlaybackSourceError extends Error {
  readonly code: string;

  constructor({ code, message }: YouTubeExtractionErrorPayload) {
    super(message);
    this.name = 'YouTubePlaybackSourceError';
    this.code = code;
  }
}

function toExtractionError(error: unknown): YouTubeExtractionError {
  const nativeError = error as { code?: unknown; message?: unknown };
  return new YouTubeExtractionError({
    code: typeof nativeError?.code === 'string' ? nativeError.code : 'NATIVE_ERROR',
    message:
      typeof nativeError?.message === 'string'
        ? nativeError.message
        : 'Errore sconosciuto durante l’estrazione dei metadata YouTube.',
  });
}

function toDownloadError(error: unknown): YouTubeDownloadError {
  const nativeError = error as { code?: unknown; message?: unknown };
  return new YouTubeDownloadError({
    code: typeof nativeError?.code === 'string' ? nativeError.code : 'NATIVE_ERROR',
    message:
      typeof nativeError?.message === 'string'
        ? nativeError.message
        : 'Errore sconosciuto durante il download M4A.',
  });
}

function toSearchError(error: unknown): YouTubeSearchError {
  const nativeError = error as { code?: unknown; message?: unknown };
  return new YouTubeSearchError({
    code: typeof nativeError?.code === 'string' ? nativeError.code : 'NATIVE_ERROR',
    message:
      typeof nativeError?.message === 'string'
        ? nativeError.message
        : 'Errore sconosciuto durante la ricerca YouTube.',
  });
}

export async function getNativeMessage(): Promise<string> {
  return AuraNativeTestModule.getNativeMessage();
}

export async function testPython(): Promise<number | string> {
  return AuraNativeTestModule.testPython();
}

export async function testYtDlpImport(): Promise<YtDlpImportResult | string> {
  return AuraNativeTestModule.testYtDlpImport();
}

export async function testYtDlpAppleProvider(): Promise<YtDlpAppleProviderResult | string> {
  return AuraNativeTestModule.testYtDlpAppleProvider();
}

export async function searchYouTube(
  query: string,
  limit?: number,
): Promise<YouTubeSearchResult[] | string> {
  try {
    return await AuraNativeTestModule.searchYouTube(query, limit);
  } catch (error) {
    throw toSearchError(error);
  }
}

export async function extractYouTubeInfo(url: string): Promise<YouTubeVideoInfo | string> {
  try {
    return await AuraNativeTestModule.extractYouTubeInfo(url);
  } catch (error) {
    throw toExtractionError(error);
  }
}

export async function resolveYouTubePlaybackSource(
  url: string,
): Promise<YouTubePlaybackSource | string> {
  try {
    return await AuraNativeTestModule.resolveYouTubePlaybackSource(url);
  } catch (error) {
    const nativeError = error as { code?: unknown; message?: unknown };
    throw new YouTubePlaybackSourceError({
      code: typeof nativeError?.code === 'string' ? nativeError.code : 'NATIVE_ERROR',
      message:
        typeof nativeError?.message === 'string'
          ? nativeError.message
          : 'Errore sconosciuto durante la risoluzione del playback YouTube.',
    });
  }
}

export async function downloadYouTubeM4a(
  url: string,
  formatId?: string,
): Promise<DownloadedAudioResult | string> {
  try {
    return await AuraNativeTestModule.downloadYouTubeM4a(url, formatId);
  } catch (error) {
    throw toDownloadError(error);
  }
}

export function addDownloadProgressListener(listener: (event: DownloadProgress) => void) {
  return AuraNativeTestModule.addListener('onDownloadProgress', listener);
}
