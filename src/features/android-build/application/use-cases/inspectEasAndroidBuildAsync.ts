import type {
  AndroidBuildInspection,
  AndroidBuildInspectionRequest,
  DeploymentProviderResult,
} from '@ankhorage/contracts/deploy-provider';
import { isRecord } from '@ankhorage/utility/object';

import type { EasProcessRunner } from '../../../../types/process.js';
import { resolveEasProcessEnvironmentAsync } from '../../../../utils/resolveEasProcessEnvironmentAsync.js';
import { parseEasAndroidConfig } from '../../utils/parseEasAndroidConfig.js';

const FINGERPRINT_SCRIPT = `
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as Fingerprint from 'expo/fingerprint';
const markers = ['android/app/build.gradle', 'android/app/src/main/AndroidManifest.xml'];
const generic = markers.some((marker) => {
  if (!existsSync(marker)) return false;
  return spawnSync('git', ['check-ignore', '--quiet', marker], { cwd: process.cwd() }).status !== 0;
});
const options = { platforms: ['android'], silent: true, ...(generic ? {} : { ignorePaths: ['android/**/*', 'ios/**/*'] }) };
const result = await Fingerprint.createFingerprintAsync(process.cwd(), options);
process.stdout.write(JSON.stringify({ hash: result.hash }));
`;

/*** Inspect EAS Android config and produce the local project fingerprint used to gate builds. */
export async function inspectEasAndroidBuildAsync(
  request: AndroidBuildInspectionRequest,
  runProcess: EasProcessRunner,
): Promise<DeploymentProviderResult<AndroidBuildInspection>> {
  if (request.buildProfile.trim().length === 0) {
    return {
      status: 'failed',
      failure: {
        code: 'INVALID_ANDROID_BUILD_PROFILE',
        message: 'Android build profile is invalid.',
        target: 'android',
        provider: 'eas',
      },
    };
  }

  const environment = await resolveEasProcessEnvironmentAsync({
    target: 'android',
    credentials: request.credentials,
    resolveSecret: request.resolveSecret,
  });
  if (!environment.ok) return { status: 'action-required', action: environment.action };

  const configProcess = await runProcess({
    command: 'eas',
    args: [
      'config',
      '--platform',
      'android',
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
        code: 'EAS_ANDROID_CONFIG_FAILED',
        message: 'EAS Android project configuration could not be inspected.',
        target: 'android',
        provider: 'eas',
      },
    };
  }

  const config = parseEasAndroidConfig(parseJson(configProcess.stdout), request.packageName);
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
        code: 'ANDROID_FINGERPRINT_FAILED',
        message: 'Android project fingerprint could not be generated.',
        target: 'android',
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
