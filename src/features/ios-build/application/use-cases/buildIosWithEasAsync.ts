import type {
  DeploymentProviderResult,
  IosBuildArtifact,
  IosBuildRequest,
} from '@ankhorage/contracts/deploy-provider';

import type { EasProcessRunner } from '../../../../types/process.js';
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

  const result = await runProcess({
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
    ...(environment.env === undefined ? {} : { env: environment.env }),
  });
  if (result.exitCode !== 0) {
    const lower = result.stderr.toLowerCase();
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

  const artifact = parseEasIosBuild(
    parseJson(result.stdout),
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

/*** Parse process JSON output without throwing across the adapter boundary. */
function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
