import type {
  AndroidBuildArtifact,
  AndroidBuildRequest,
  DeploymentProviderResult,
} from '@ankhorage/contracts/deploy-provider';

import type { EasProcessRunner } from '../../../../types/process.js';
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

  const result = await runProcess({
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
    ...(environment.env === undefined ? {} : { env: environment.env }),
  });
  if (result.exitCode !== 0) {
    const signingRequired =
      result.stderr.toLowerCase().includes('keystore') ||
      result.stderr.toLowerCase().includes('credential');
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

  const artifact = parseEasAndroidBuild(
    parseJson(result.stdout),
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

/*** Parse process JSON output without throwing across the adapter boundary. */
function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
