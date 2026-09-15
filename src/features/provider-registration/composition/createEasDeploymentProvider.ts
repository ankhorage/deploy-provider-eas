import type { DeploymentProviderRegistration } from '@ankhorage/contracts/deploy-provider';

import { createEasAndroidBuilder } from '../../android-build/adapters/outbound/createEasAndroidBuilder.js';
import { createEasIosBuilder } from '../../ios-build/adapters/outbound/createEasIosBuilder.js';
import { createEasSetupAdapter } from '../../setup/adapters/outbound/createEasSetupAdapter.js';
import { createEasWebPublisher } from '../../web-publication/adapters/outbound/createEasWebPublisher.js';
import { runEasProcessAsync } from '../../../utils/runEasProcessAsync.js';

/***
 * Create the canonical EAS provider registration consumed by the Deploy composition root.
 *
 * @readme
 */
export function createEasDeploymentProvider(): DeploymentProviderRegistration {
  return {
    descriptor: {
      id: 'eas',
      packageName: '@ankhorage/deploy-provider-eas',
      displayName: 'EAS',
      capabilities: [
        { id: 'setup', targets: ['web', 'android', 'ios'] },
        { id: 'web-publish', targets: ['web'] },
        { id: 'android-build', targets: ['android'] },
        { id: 'ios-build', targets: ['ios'] },
      ],
    },
    setup: createEasSetupAdapter(runEasProcessAsync),
    webPublisher: createEasWebPublisher(runEasProcessAsync),
    androidBuilder: createEasAndroidBuilder(runEasProcessAsync),
    iosBuilder: createEasIosBuilder(runEasProcessAsync),
  };
}
