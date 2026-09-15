import type {
  AndroidBuildInspection,
  AndroidBuildInspectionRequest,
  DeploymentProviderResult,
} from '@ankhorage/contracts/deploy-provider';
import { isRecord } from '@ankhorage/utility/object';

import type { EasAndroidConfigSnapshot } from '../../../../types/android.js';
import type { EasProcessRunner } from '../../../../types/process.js';
import { parseJson } from '../../../../utils/parseJson.js';
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
  if (request.buildProfile.trim().length === 0) return invalidAndroidBuildProfile();

  const environment = await resolveEasProcessEnvironmentAsync({
    target: 'android',
    credentials: request.credentials,
    resolveSecret: request.resolveSecret,
  });
  if (!environment.ok) return { status: 'action-required', action: environment.action };

  const config = await inspectAndroidConfigAsync(request, environment.env, runProcess);
  if (config.status !== 'completed') return config;
  return inspectAndroidFingerprintAsync(
    request.projectRoot,
    config.value.profileEnvironment,
    runProcess,
  );
}

/*** Inspect the EAS Android config for the requested build profile. */
async function inspectAndroidConfigAsync(
  request: AndroidBuildInspectionRequest,
  environment: Readonly<Record<string, string>> | undefined,
  runProcess: EasProcessRunner,
): Promise<DeploymentProviderResult<EasAndroidConfigSnapshot>> {
  const result = await runProcess({
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
    ...(environment === undefined ? {} : { env: environment }),
  });
  return result.exitCode === 0
    ? parseEasAndroidConfig(parseJson(result.stdout), request.packageName)
    : androidInspectionFailure(
        'EAS_ANDROID_CONFIG_FAILED',
        'EAS Android project configuration could not be inspected.',
      );
}

/*** Generate the local Android project fingerprint used to gate builds. */
async function inspectAndroidFingerprintAsync(
  projectRoot: string,
  environment: Readonly<Record<string, string>>,
  runProcess: EasProcessRunner,
): Promise<DeploymentProviderResult<AndroidBuildInspection>> {
  const result = await runProcess({
    command: 'node',
    args: ['--input-type=module', '--eval', FINGERPRINT_SCRIPT],
    cwd: projectRoot,
    env: environment,
  });
  const fingerprint = parseJson(result.stdout);
  return result.exitCode === 0 && isFingerprintResult(fingerprint)
    ? { status: 'completed', value: { fingerprint: fingerprint.hash } }
    : androidInspectionFailure(
        'ANDROID_FINGERPRINT_FAILED',
        'Android project fingerprint could not be generated.',
      );
}

/*** Build the invalid-profile result before invoking EAS. */
function invalidAndroidBuildProfile(): DeploymentProviderResult<AndroidBuildInspection> {
  return androidInspectionFailure('INVALID_ANDROID_BUILD_PROFILE', 'Android build profile is invalid.');
}

/*** Build one provider-neutral Android inspection failure. */
function androidInspectionFailure<T>(
  code: string,
  message: string,
): DeploymentProviderResult<T> {
  return {
    status: 'failed',
    failure: { code, message, target: 'android', provider: 'eas' },
  };
}

/*** Validate one Expo fingerprint result. */
function isFingerprintResult(value: unknown): value is { readonly hash: string } {
  return isRecord(value) && typeof value.hash === 'string' && /^[a-f\d]{32,128}$/i.test(value.hash);
}
