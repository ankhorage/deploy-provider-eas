import type {
  DeploymentProviderResult,
  IosBuildInspection,
  IosBuildInspectionRequest,
} from '@ankhorage/contracts/deploy-provider';
import { isRecord } from '@ankhorage/utility/object';

import type { EasProcessRunner } from '../../../../types/process.js';
import { resolveEasProcessEnvironmentAsync } from '../../../../utils/resolveEasProcessEnvironmentAsync.js';
import { parseEasIosConfig } from '../../utils/parseEasIosConfig.js';

const FINGERPRINT_SCRIPT = `
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as Fingerprint from 'expo/fingerprint';
const marker = 'ios/Podfile';
const generic = existsSync(marker) && spawnSync('git', ['check-ignore', '--quiet', marker], { cwd: process.cwd() }).status !== 0;
const options = { platforms: ['ios'], silent: true, ...(generic ? {} : { ignorePaths: ['android/**/*', 'ios/**/*'] }) };
const result = await Fingerprint.createFingerprintAsync(process.cwd(), options);
process.stdout.write(JSON.stringify({ hash: result.hash }));
`;

/*** Inspect EAS iOS config and produce the local project fingerprint used to gate builds. */
export async function inspectEasIosBuildAsync(
  request: IosBuildInspectionRequest,
  runProcess: EasProcessRunner,
): Promise<DeploymentProviderResult<IosBuildInspection>> {
  if (request.buildProfile.trim().length === 0) {
    return {
      status: 'failed',
      failure: {
        code: 'INVALID_IOS_BUILD_PROFILE',
        message: 'iOS build profile is invalid.',
        target: 'ios',
        provider: 'eas',
      },
    };
  }

  const environment = await resolveEasProcessEnvironmentAsync({
    target: 'ios',
    credentials: request.credentials,
    resolveSecret: request.resolveSecret,
  });
  if (!environment.ok) return { status: 'action-required', action: environment.action };

  const configProcess = await runProcess({
    command: 'eas',
    args: [
      'config',
      '--platform',
      'ios',
      '--profile',
      request.buildProfile,
      '--json',
      '--non-interactive',
    ],
    cwd: request.projectRoot,
    ...(environment.env === undefined ? {} : { env: environment.env }),
  });
  if (configProcess.exitCode !== 0) {
    return {
      status: 'failed',
      failure: {
        code: 'EAS_IOS_CONFIG_FAILED',
        message: 'EAS iOS project configuration could not be inspected.',
        target: 'ios',
        provider: 'eas',
      },
    };
  }

  const config = parseEasIosConfig(parseJson(configProcess.stdout), request.bundleIdentifier);
  if (config.status !== 'completed') return config;

  const fingerprintProcess = await runProcess({
    command: 'node',
    args: ['--input-type=module', '--eval', FINGERPRINT_SCRIPT],
    cwd: request.projectRoot,
    env: config.value.profileEnvironment,
  });
  const fingerprint = parseJson(fingerprintProcess.stdout);
  if (fingerprintProcess.exitCode !== 0 || !isFingerprintResult(fingerprint)) {
    return {
      status: 'failed',
      failure: {
        code: 'IOS_FINGERPRINT_FAILED',
        message: 'iOS project fingerprint could not be generated.',
        target: 'ios',
        provider: 'eas',
      },
    };
  }

  return { status: 'completed', value: { fingerprint: fingerprint.hash } };
}

/*** Parse process JSON output without throwing across the adapter boundary. */
function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

/*** Validate one Expo fingerprint result. */
function isFingerprintResult(value: unknown): value is { readonly hash: string } {
  return isRecord(value) && typeof value.hash === 'string' && /^[a-f\d]{32,128}$/i.test(value.hash);
}
