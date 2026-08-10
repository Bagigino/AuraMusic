import AuraNativeTestModule from './src/AuraNativeTestModule';

export async function getNativeMessage(): Promise<string> {
  return AuraNativeTestModule.getNativeMessage();
}

export async function testPython(): Promise<number | string> {
  return AuraNativeTestModule.testPython();
}
