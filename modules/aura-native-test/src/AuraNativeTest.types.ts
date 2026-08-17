export type YtDlpImportResult = {
  success: boolean;
  version: string;
};

export type AuraNativeTestModuleApi = {
  getNativeMessage(): Promise<string>;
  testPython(): Promise<number | string>;
  testYtDlpImport(): Promise<YtDlpImportResult | string>;
};
