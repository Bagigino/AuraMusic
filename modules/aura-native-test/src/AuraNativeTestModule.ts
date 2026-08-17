import { requireOptionalNativeModule } from 'expo';

import type { AuraNativeTestModuleApi } from './AuraNativeTest.types';

const nativeModule = requireOptionalNativeModule<AuraNativeTestModuleApi>('AuraNativeTest');

const unavailableModule: AuraNativeTestModuleApi = {
  async getNativeMessage() {
    throw new Error(
      'AuraNativeTest non è incluso in questo client. Installa una development build iOS.',
    );
  },
  async testPython() {
    throw new Error(
      'CPython non è incluso in questo client. Installa una development build iOS.',
    );
  },
  async testYtDlpImport() {
    throw new Error(
      'yt-dlp non è incluso in questo client. Installa una development build iOS.',
    );
  },
  async testYtDlpAppleProvider() {
    throw new Error(
      'Il provider Apple WebKit non è incluso in questo client. Installa una development build iOS.',
    );
  },
  async extractYouTubeInfo() {
    throw new Error(
      'L’estrazione YouTube nativa non è inclusa in questo client. Installa una development build iOS.',
    );
  },
};

export default nativeModule ?? unavailableModule;
