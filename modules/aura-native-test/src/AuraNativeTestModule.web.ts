import type { AuraNativeTestModuleApi } from './AuraNativeTest.types';

const webModule: AuraNativeTestModuleApi = {
  async getNativeMessage() {
    return 'Native iOS module unavailable on web';
  },
  async testPython() {
    return 'CPython unavailable on web';
  },
  async testYtDlpImport() {
    return 'yt-dlp unavailable on web';
  },
  async testYtDlpAppleProvider() {
    return 'Apple WebKit provider unavailable on web';
  },
};

export default webModule;
