export type YtDlpImportResult = {
  success: boolean;
  version: string;
};

export type YtDlpAppleProviderResult = {
  success: boolean;
  provider: string;
  version: string;
};

export type AuraNativeTestModuleApi = {
  getNativeMessage(): Promise<string>;
  testPython(): Promise<number | string>;
  testYtDlpImport(): Promise<YtDlpImportResult | string>;
  testYtDlpAppleProvider(): Promise<YtDlpAppleProviderResult | string>;
};
