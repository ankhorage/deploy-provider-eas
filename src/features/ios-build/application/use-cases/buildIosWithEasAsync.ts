import type {
  DeploymentProviderResult,
  IosBuildArtifact,
  IosBuildRequest,
} from '@ankhorage/contracts/deploy-provider';

import type { EasProcessResult, EasProcessRunner } from '../../../../types/process.js';
import { parseJson } from '../../../../utils/parseJson.js';
import { resolveEasProcessEnvironmentAsync } from '../../../../utils/resolveEasProcessEnvironmentAsync.js';
import { parseEasIosBuild } from '../../utils/parseEasIosBuild.js';

/*** Run one non-interactive EAS iOS build and normalize its finished artifact. */
export async function buildIosWithEasAsync(
  request: IosBuildRequest,
  runProcess: EasProcessRunner,
): Promise<DeploymentProviderResult<IosBuildArtifact>> {
  const environment = await resolveEasProcessEnvironmentAsync({
    target: 'ios',
    credentials: request.credentials,
    resolveSecret: request.resolveSecret,
  });
  if (!environment.ok) return { status: 'action-required', action: environment.action };

  const result = await runIosBuildAsync(request, environment.env, runProcess);
  if (result.exitCode !== 0) return createIosBuildFailure(result.stderr);
  return normalizeIosBuildResult(result.stdout, request);
}

/*** Run the EAS iOS build command with the resolved provider environment. */
function runIosBuildAsync(
  request: IosBuildRequest,
  environment: Readonly<Record<string, string>> | undefined,
  runProcess: EasProcessRunner,
): Promise<EasProcessResult> {
  return runProcess({
    command: 'eas',
    args: [
      'build',
      '--platform',
      'ios',
      '--profile',
      request.buildProfile,
      '--json',
      '--non-interactive',
      '--wait',
    ],
    cwd: request.projectRoot,
    ...(environment === undefined ? {} : { env: environment }),
  });
}

/*** Map an EAS iOS build process failure to the provider-neutral result contract. */
function createIosBuildFailure(stderr: string): DeploymentProviderResult<IosBuildArtifact> {
  const lower = stderr.toLowerCase();
  const signingRequired =
    lower.includes('provisioning profile') ||
    lower.includes('distribution certificate') ||
    lower.includes('credential');
  return signingRequired
    ? {
        status: 'action-required',
        action: {
          type: 'manual-action',
          target: 'ios',
          provider: 'eas',
          code: 'EAS_IOS_SIGNING_SETUP_REQUIRED',
          message: 'iOS signing credentials require EAS account or project setup.',
        },
      }
    : {
        status: 'failed',
        failure: {
          code: 'EAS_IOS_BUILD_FAILED',
          message: 'EAS iOS build failed.',
          target: 'ios',
          provider: 'eas',
        },
      };
}

/*** Normalize a successful EAS process result into an iOS build artifact. */
function normalizeIosBuildResult(
  stdout: string,
  request: IosBuildRequest,
): DeploymentProviderResult<IosBuildArtifact> {
  const artifact = parseEasIosBuild(
    parseJson(stdout),
    request.expectedFingerprint,
    request.buildProfile,
    request.version,
  );
  return artifact === null
    ? {
        status: 'failed',
        failure: {
          code: 'EAS_IOS_BUILD_INVALID',
          message: 'EAS iOS build returned an invalid result.',
          target: 'ios',
          provider: 'eas',
        },
      }
    : { status: 'completed', value: artifact };
}
