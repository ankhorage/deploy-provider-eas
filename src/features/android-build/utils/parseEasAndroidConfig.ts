import type { DeploymentProviderResult } from '@ankhorage/contracts/deploy-provider';
import { isRecord } from '@ankhorage/utility/object';
import { isNonEmptyString } from '@ankhorage/utility/string';

import type { EasAndroidConfigSnapshot } from '../../../types/android.js';

/*** Validate EAS Android config output for package identity, store readiness, and profile environment. */
export function parseEasAndroidConfig(
  value: unknown,
  expectedPackageName: string,
): DeploymentProviderResult<EasAndroidConfigSnapshot> {
  if (!isRecord(value) || !isRecord(value.buildProfile) || !isRecord(value.appConfig)) {
    return failure('EAS_ANDROID_CONFIG_INVALID');
  }

  const androidConfig = value.appConfig.android;
  if (!isRecord(androidConfig) || !isNonEmptyString(androidConfig.package)) {
    return failure('EAS_ANDROID_PACKAGE_MISSING');
  }
  if (androidConfig.package !== expectedPackageName) {
    return failure('ANDROID_PACKAGE_MISMATCH', 'EAS Android package does not match deployment config.');
  }
  if (!isStoreProfile(value.buildProfile)) {
    return failure('EAS_ANDROID_PROFILE_NOT_STORE_READY', 'EAS Android build profile is not store-ready.');
  }

  const profileEnvironment = normalizeEnvironment(value.buildProfile.env);
  if (profileEnvironment === null) return failure('EAS_ANDROID_CONFIG_INVALID');

  return {
    status: 'completed',
    value: { packageName: androidConfig.package, profileEnvironment },
  };
}

/*** Check whether an EAS Android build profile produces a credentialed store artifact. */
function isStoreProfile(profile: Record<string, unknown>): boolean {
  if (profile.developmentClient === true || profile.distribution === 'internal') return false;
  if (profile.withoutCredentials === true) return false;
  if (profile.android === undefined) return true;
  if (!isRecord(profile.android)) return false;
  if (profile.android.distribution === 'internal' || profile.android.withoutCredentials === true) {
    return false;
  }
  if (profile.android.buildType === 'apk') return false;
  return profile.android.gradleCommand === undefined;
}

/*** Normalize EAS profile environment values while rejecting non-string entries. */
function normalizeEnvironment(value: unknown): Readonly<Record<string, string>> | null {
  if (value === undefined) return {};
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  const stringEntries = entries.filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  return stringEntries.length === entries.length ? Object.fromEntries(stringEntries) : null;
}

/*** Build one provider-neutral Android config failure. */
function failure(
  code: string,
  message = 'EAS Android configuration is invalid.',
): DeploymentProviderResult<EasAndroidConfigSnapshot> {
  return {
    status: 'failed',
    failure: { code, message, target: 'android', provider: 'eas' },
  };
}
