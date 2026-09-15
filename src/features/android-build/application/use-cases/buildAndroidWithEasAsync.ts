import type {
  AndroidBuildArtifact,
  AndroidBuildRequest,
  DeploymentProviderResult,
} from '@ankhorage/contracts/deploy-provider';

import type { EasProcessResult, EasProcessRunner } from '../../../../types/process.js';
import { parseJson } from '../../../../utils/parseJson.js';
import { resolveEasProcessEnvironmentAsync } from '../../../../utils/resolveEasProcessEnvironmentAsync.js';
import { parseEasAndroidBuild } from '../../utils/parseEasAndroidBuild.js';

/*** Run one non-interactive EAS Android build and normalize its finished artifact. */
export async function buildAndroidWithEasAsync(
  request: AndroidBuildRequest,
  runProcess: EasProcessRunner,
): Promise<DeploymentProviderResult<AndroidBuildArtifact>> {
  const environment = await resolveEasProcessEnvironmentAsync({
    target: 'android',
    credentials: request.credentials,
    resolveSecret: request.resolveSecret,
  });
  if (!environment.ok) return { status: 'action-required', action: environment.action };

  const result = await runAndroidBuildAsync(request, environment.env, runProcess);
  if (result.exitCode !== 0) return createAndroidBuildFailure(result.stderr);
  return normalizeAndroidBuildResult(result.stdout, request);
}

/*** Run the EAS Android build command with the resolved provider environment. */
function runAndroidBuildAsync(
  request: AndroidBuildRequest,
  environment: Readonly<Record<string, string>> | undefined,
  runProcess: EasProcessRunner,
): Promise<EasProcessResult> {
  return runProcess({
    command: 'eas',
    args: [
      'build',
      '--platform',
      'android',
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

/*** Map an EAS Android build process failure to the provider-neutral result contract. */
function createAndroidBuildFailure(
  stderr: string,
): DeploymentProviderResult<AndroidBuildArtifact> {
  const lower = stderr.toLowerCase();
  const signingRequired = lower.includes('keystore') || lower.includes('credential');
  return signingRequired
    ? {
        status: 'action-required',
        action: {
          type: 'manual-action',
          target: 'android',
          provider: 'eas',
          code: 'EAS_ANDROID_SIGNING_SETUP_REQUIRED',
          message: 'Android signing credentials require EAS account or project setup.',
        },
      }
    : {
        status: 'failed',
        failure: {
          code: 'EAS_ANDROID_BUILD_FAILED',
          message: 'EAS Android build failed.',
          target: 'android',
          provider: 'eas',
        },
      };
}

/*** Normalize a successful EAS process result into an Android build artifact. */
function normalizeAndroidBuildResult(
  stdout: string,
  request: AndroidBuildRequest,
): DeploymentProviderResult<AndroidBuildArtifact> {
  const artifact = parseEasAndroidBuild(
    parseJson(stdout),
    request.expectedFingerprint,
    request.buildProfile,
  );
  return artifact === null
    ? {
        status: 'failed',
        failure: {
          code: 'EAS_ANDROID_BUILD_INVALID',
          message: 'EAS Android build returned an invalid result.',
          target: 'android',
          provider: 'eas',
        },
      }
    : { status: 'completed', value: artifact };
}
