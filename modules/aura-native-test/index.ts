import AuraNativeTestModule from './src/AuraNativeTestModule';
import type {
  YtDlpAppleProviderResult,
  YtDlpImportResult,
} from './src/AuraNativeTest.types';

export type {
  YtDlpAppleProviderResult,
  YtDlpImportResult,
} from './src/AuraNativeTest.types';

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
