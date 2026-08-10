import { requireOptionalNativeModule } from 'expo';

import type { AuraNativeTestModuleApi } from './AuraNativeTest.types';

const nativeModule = requireOptionalNativeModule<AuraNativeTestModuleApi>('AuraNativeTest');

const unavailableModule: AuraNativeTestModuleApi = {
  async getNativeMessage() {
    throw new Error(
      'AuraNativeTest non è incluso in questo client. Installa una development build iOS.',
    );
  },
};

export default nativeModule ?? unavailableModule;
