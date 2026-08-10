import AuraNativeTestModule from './src/AuraNativeTestModule';

export async function getNativeMessage(): Promise<string> {
  return AuraNativeTestModule.getNativeMessage();
}
