export type AuraNativeTestModuleApi = {
  getNativeMessage(): Promise<string>;
  testPython(): Promise<number | string>;
};
