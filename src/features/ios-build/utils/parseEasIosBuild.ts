import type { IosBuildArtifact } from '@ankhorage/contracts/deploy-provider';
import { isRecord } from '@ankhorage/utility/object';
import { isNonEmptyString } from '@ankhorage/utility/string';

/*** Normalize one finished EAS iOS build into the provider-neutral artifact contract. */
export function parseEasIosBuild(
  value: unknown,
  expectedFingerprint: string,
  expectedProfile: string,
  expectedVersion: string,
): IosBuildArtifact | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const [build] = value;
  if (!isRecord(build)) return null;
  if (build.status !== 'FINISHED' || build.platform !== 'IOS') return null;
  if (!isNonEmptyString(build.id) || build.buildProfile !== expectedProfile) return null;
  if (!isRecord(build.fingerprint) || build.fingerprint.hash !== expectedFingerprint) return null;
  if (!isRecord(build.artifacts) || !isHttpUrl(build.artifacts.applicationArchiveUrl)) return null;
  if (build.appVersion !== expectedVersion || !isNonEmptyString(build.appBuildVersion)) return null;

  return {
    provider: 'eas',
    buildId: build.id,
    buildProfile: expectedProfile,
    fingerprint: expectedFingerprint,
    version: expectedVersion,
    buildNumber: build.appBuildVersion,
    archiveUrl: build.artifacts.applicationArchiveUrl,
  };
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
