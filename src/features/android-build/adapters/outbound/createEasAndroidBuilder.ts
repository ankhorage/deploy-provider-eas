import type { AndroidDeploymentBuilder } from '@ankhorage/contracts/deploy-provider';

import type { EasProcessRunner } from '../../../../types/process.js';
import { buildAndroidWithEasAsync } from '../../application/use-cases/buildAndroidWithEasAsync.js';
import { inspectEasAndroidBuildAsync } from '../../application/use-cases/inspectEasAndroidBuildAsync.js';

/*** Create the EAS Android builder implementing the provider-neutral build port. */
export function createEasAndroidBuilder(runProcess: EasProcessRunner): AndroidDeploymentBuilder {
  return {
    inspectAsync: async (request) => await inspectEasAndroidBuildAsync(request, runProcess),
    buildAsync: async (request) => await buildAndroidWithEasAsync(request, runProcess),
  };
}
