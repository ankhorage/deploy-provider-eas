import type { DeploymentProviderResult } from '@ankhorage/contracts/deploy-provider';
import { isRecord } from '@ankhorage/utility/object';
import { isNonEmptyString } from '@ankhorage/utility/string';

import type { EasIosConfigSnapshot } from '../../../types/ios.js';

/*** Validate EAS iOS config output for bundle identity, store readiness, and profile environment. */
export function parseEasIosConfig(
  value: unknown,
  expectedBundleIdentifier: string,
): DeploymentProviderResult<EasIosConfigSnapshot> {
  if (!isRecord(value) || !isRecord(value.buildProfile) || !isRecord(value.appConfig)) {
    return failure('EAS_IOS_CONFIG_INVALID');
  }

  const iosConfig = value.appConfig.ios;
  if (!isRecord(iosConfig) || !isNonEmptyString(iosConfig.bundleIdentifier)) {
    return failure('EAS_IOS_BUNDLE_IDENTIFIER_MISSING');
  }
  if (iosConfig.bundleIdentifier !== expectedBundleIdentifier) {
    return failure(
      'IOS_BUNDLE_IDENTIFIER_MISMATCH',
      'EAS iOS bundle identifier does not match deployment config.',
    );
  }
  if (!isStoreProfile(value.buildProfile)) {
    return failure('EAS_IOS_PROFILE_NOT_STORE_READY', 'EAS iOS build profile is not store-ready.');
  }

  const profileEnvironment = normalizeEnvironment(value.buildProfile.env);
  if (profileEnvironment === null) return failure('EAS_IOS_CONFIG_INVALID');

  return {
    status: 'completed',
    value: { bundleIdentifier: iosConfig.bundleIdentifier, profileEnvironment },
  };
}

/*** Check whether an EAS iOS build profile produces a credentialed App Store artifact. */
function isStoreProfile(profile: Record<string, unknown>): boolean {
  if (profile.developmentClient === true || profile.distribution === 'internal') return false;
  if (profile.withoutCredentials === true) return false;
  if (profile.ios === undefined) return true;
  if (!isRecord(profile.ios)) return false;
  if (profile.ios.simulator === true || profile.ios.withoutCredentials === true) return false;
  return profile.ios.distribution !== 'internal';
}

/*** Normalize EAS profile environment values while rejecting non-string entries. */
function normalizeEnvironment(value: unknown): Readonly<Record<string, string>> | null {
  if (value === undefined) return {};
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  const stringEntries = entries.filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  return stringEntries.length === entries.length ? Object.fromEntries(stringEntries) : null;
}

/*** Build one provider-neutral iOS config failure. */
function failure(
  code: string,
  message = 'EAS iOS configuration is invalid.',
): DeploymentProviderResult<EasIosConfigSnapshot> {
  return {
    status: 'failed',
    failure: { code, message, target: 'ios', provider: 'eas' },
  };
}
