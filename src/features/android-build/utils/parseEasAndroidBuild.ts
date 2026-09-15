import type { AndroidBuildArtifact } from '@ankhorage/contracts/deploy-provider';
import { isRecord } from '@ankhorage/utility/object';
import { isNonEmptyString } from '@ankhorage/utility/string';

/*** Normalize one finished EAS Android build into the provider-neutral artifact contract. */
export function parseEasAndroidBuild(
  value: unknown,
  expectedFingerprint: string,
  expectedProfile: string,
): AndroidBuildArtifact | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const [build] = value;
  if (!isRecord(build)) return null;
  if (build.status !== 'FINISHED' || build.platform !== 'ANDROID') return null;
  if (!isNonEmptyString(build.id) || build.buildProfile !== expectedProfile) return null;
  if (!isRecord(build.fingerprint) || build.fingerprint.hash !== expectedFingerprint) return null;
  if (!isRecord(build.artifacts) || !isHttpUrl(build.artifacts.applicationArchiveUrl)) return null;

  const versionCode = parseVersionCode(build.appBuildVersion);
  if (versionCode === null) return null;

  return {
    provider: 'eas',
    buildId: build.id,
    buildProfile: expectedProfile,
    fingerprint: expectedFingerprint,
    versionCode,
    archiveUrl: build.artifacts.applicationArchiveUrl,
  };
}

/*** Parse a positive Android version code from EAS output. */
function parseVersionCode(value: unknown): number | null {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/*** Validate one HTTP(S) artifact URL returned by EAS. */
function isHttpUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
