import type { WebDeploymentPublication } from '@ankhorage/contracts/deploy-provider';
import { isRecord } from '@ankhorage/utility/object';
import { isNonEmptyString } from '@ankhorage/utility/string';

/*** Normalize one EAS Hosting JSON payload into the provider-neutral web publication contract. */
export function parseEasWebPublication(
  value: unknown,
  revision: string,
  production: boolean,
): WebDeploymentPublication | null {
  if (!isRecord(value) || !isNonEmptyString(value.identifier) || !isHttpUrl(value.url)) return null;
  return {
    target: 'web',
    revision,
    provider: 'eas',
    deploymentId: value.identifier,
    url: value.url,
    production,
  };
}

/*** Validate one HTTP(S) URL returned by EAS Hosting. */
function isHttpUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
