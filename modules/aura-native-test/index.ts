import AuraNativeTestModule from './src/AuraNativeTestModule';
import type {
  YouTubeExtractionErrorPayload,
  YouTubeVideoInfo,
  YtDlpAppleProviderResult,
  YtDlpImportResult,
} from './src/AuraNativeTest.types';

export type {
  YouTubeAudioFormat,
  YouTubeExtractionErrorPayload,
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

export async function extractYouTubeInfo(url: string): Promise<YouTubeVideoInfo | string> {
  try {
    return await AuraNativeTestModule.extractYouTubeInfo(url);
  } catch (error) {
    throw toExtractionError(error);
  }
}
