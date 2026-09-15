import type { IosDeploymentBuilder } from '@ankhorage/contracts/deploy-provider';

import type { EasProcessRunner } from '../../../../types/process.js';
import { buildIosWithEasAsync } from '../../application/use-cases/buildIosWithEasAsync.js';
import { inspectEasIosBuildAsync } from '../../application/use-cases/inspectEasIosBuildAsync.js';

/*** Create the EAS iOS builder implementing the provider-neutral build port. */
export function createEasIosBuilder(runProcess: EasProcessRunner): IosDeploymentBuilder {
  return {
    inspectAsync: async (request) => await inspectEasIosBuildAsync(request, runProcess),
    buildAsync: async (request) => await buildIosWithEasAsync(request, runProcess),
  };
}
