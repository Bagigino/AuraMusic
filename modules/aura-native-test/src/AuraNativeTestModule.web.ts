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
  async extractYouTubeInfo() {
    return 'YouTube native extraction unavailable on web';
  },
  async downloadYouTubeM4a() {
    return 'Native M4A download unavailable on web';
  },
  addListener() {
    return { remove() {} };
  },
};

export default webModule;
