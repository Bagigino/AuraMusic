import type { AuraNativeTestModuleApi } from './AuraNativeTest.types';

const webModule: AuraNativeTestModuleApi = {
  async getNativeMessage() {
    return 'Native iOS module unavailable on web';
  },
  async testPython() {
    return 'CPython unavailable on web';
  },
};

export default webModule;
