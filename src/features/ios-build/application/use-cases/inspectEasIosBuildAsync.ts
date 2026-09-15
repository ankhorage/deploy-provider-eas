import type {
  DeploymentProviderResult,
  IosBuildInspection,
  IosBuildInspectionRequest,
} from '@ankhorage/contracts/deploy-provider';
import { isRecord } from '@ankhorage/utility/object';

import type { EasIosConfigSnapshot } from '../../../../types/ios.js';
import type { EasProcessRunner } from '../../../../types/process.js';
import { parseJson } from '../../../../utils/parseJson.js';
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
  if (request.buildProfile.trim().length === 0) return invalidIosBuildProfile();

  const environment = await resolveEasProcessEnvironmentAsync({
    target: 'ios',
    credentials: request.credentials,
    resolveSecret: request.resolveSecret,
  });
  if (!environment.ok) return { status: 'action-required', action: environment.action };

  const config = await inspectIosConfigAsync(request, environment.env, runProcess);
  if (config.status !== 'completed') return config;
  return inspectIosFingerprintAsync(
    request.projectRoot,
    config.value.profileEnvironment,
    runProcess,
  );
}

/*** Inspect the EAS iOS config for the requested build profile. */
async function inspectIosConfigAsync(
  request: IosBuildInspectionRequest,
  environment: Readonly<Record<string, string>> | undefined,
  runProcess: EasProcessRunner,
): Promise<DeploymentProviderResult<EasIosConfigSnapshot>> {
  const result = await runProcess({
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
    ...(environment === undefined ? {} : { env: environment }),
  });
  return result.exitCode === 0
    ? parseEasIosConfig(parseJson(result.stdout), request.bundleIdentifier)
    : iosInspectionFailure(
        'EAS_IOS_CONFIG_FAILED',
        'EAS iOS project configuration could not be inspected.',
      );
}

/*** Generate the local iOS project fingerprint used to gate builds. */
async function inspectIosFingerprintAsync(
  projectRoot: string,
  environment: Readonly<Record<string, string>>,
  runProcess: EasProcessRunner,
): Promise<DeploymentProviderResult<IosBuildInspection>> {
  const result = await runProcess({
    command: 'node',
    args: ['--input-type=module', '--eval', FINGERPRINT_SCRIPT],
    cwd: projectRoot,
    env: environment,
  });
  const fingerprint = parseJson(result.stdout);
  return result.exitCode === 0 && isFingerprintResult(fingerprint)
    ? { status: 'completed', value: { fingerprint: fingerprint.hash } }
    : iosInspectionFailure(
        'IOS_FINGERPRINT_FAILED',
        'iOS project fingerprint could not be generated.',
      );
}

/*** Build the invalid-profile result before invoking EAS. */
function invalidIosBuildProfile(): DeploymentProviderResult<IosBuildInspection> {
  return iosInspectionFailure('INVALID_IOS_BUILD_PROFILE', 'iOS build profile is invalid.');
}

/*** Build one provider-neutral iOS inspection failure. */
function iosInspectionFailure<T>(code: string, message: string): DeploymentProviderResult<T> {
  return {
    status: 'failed',
    failure: { code, message, target: 'ios', provider: 'eas' },
  };
}

/*** Validate one Expo fingerprint result. */
function isFingerprintResult(value: unknown): value is { readonly hash: string } {
  return isRecord(value) && typeof value.hash === 'string' && /^[a-f\d]{32,128}$/i.test(value.hash);
}
