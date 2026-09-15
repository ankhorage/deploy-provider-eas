import type {
  DeploymentProviderResult,
  WebDeploymentPublication,
  WebDeploymentPublisher,
  WebDeploymentPublishRequest,
} from '@ankhorage/contracts/deploy-provider';

import type { EasProcessResult, EasProcessRunner } from '../../../../types/process.js';
import { parseJson } from '../../../../utils/parseJson.js';
import { resolveEasProcessEnvironmentAsync } from '../../../../utils/resolveEasProcessEnvironmentAsync.js';
import { parseEasWebPublication } from '../../utils/parseEasWebPublication.js';

/*** Create the EAS Hosting publisher implementing the provider-neutral web publication port. */
export function createEasWebPublisher(runProcess: EasProcessRunner): WebDeploymentPublisher {
  return {
    publishAsync: (request) => publishWebWithEasAsync(request, runProcess),
  };
}

/*** Publish one web export through EAS Hosting. */
async function publishWebWithEasAsync(
  request: WebDeploymentPublishRequest,
  runProcess: EasProcessRunner,
): Promise<DeploymentProviderResult<WebDeploymentPublication>> {
  if (isInvalidWebPublishIntent(request)) {
    return webPublicationFailure('INVALID_WEB_PUBLISH_INTENT', 'Web publish intent is invalid.');
  }

  const environment = await resolveEasProcessEnvironmentAsync({
    target: 'web',
    credentials: request.credentials,
    resolveSecret: request.resolveSecret,
  });
  if (!environment.ok) return { status: 'action-required', action: environment.action };

  const result = await runWebDeployAsync(request, environment.env, runProcess);
  if (result.exitCode !== 0) {
    return webPublicationFailure('EAS_WEB_PUBLISH_FAILED', 'EAS Hosting publication failed.');
  }
  return normalizeWebPublication(result.stdout, request);
}

/*** Reject empty optional alias or environment values before invoking EAS. */
function isInvalidWebPublishIntent(request: WebDeploymentPublishRequest): boolean {
  return (
    request.intent.alias?.trim().length === 0 || request.intent.environment?.trim().length === 0
  );
}

/*** Run the EAS Hosting deployment command. */
function runWebDeployAsync(
  request: WebDeploymentPublishRequest,
  environment: Readonly<Record<string, string>> | undefined,
  runProcess: EasProcessRunner,
): Promise<EasProcessResult> {
  return runProcess({
    command: 'eas',
    args: createWebDeployArgs(request),
    cwd: request.projectRoot,
    ...(environment === undefined ? {} : { env: environment }),
  });
}

/*** Build the EAS Hosting command arguments for one publish intent. */
function createWebDeployArgs(request: WebDeploymentPublishRequest): readonly string[] {
  return [
    'deploy',
    '--json',
    '--non-interactive',
    '--export-dir',
    request.exportDirectory,
    ...(request.intent.mode === 'production' ? ['--prod'] : []),
    ...(request.intent.alias === undefined ? [] : ['--alias', request.intent.alias]),
    ...(request.intent.environment === undefined
      ? []
      : ['--environment', request.intent.environment]),
  ];
}

/*** Normalize successful EAS Hosting output into the provider-neutral publication contract. */
function normalizeWebPublication(
  stdout: string,
  request: WebDeploymentPublishRequest,
): DeploymentProviderResult<WebDeploymentPublication> {
  const publication = parseEasWebPublication(
    parseJson(stdout),
    request.revision,
    request.intent.mode === 'production',
  );
  return publication === null
    ? webPublicationFailure('EAS_WEB_INVALID_RESULT', 'EAS Hosting returned an invalid result.')
    : { status: 'completed', value: publication };
}

/*** Build one provider-neutral web publication failure. */
function webPublicationFailure(
  code: string,
  message: string,
): DeploymentProviderResult<WebDeploymentPublication> {
  return {
    status: 'failed',
    failure: { code, message, target: 'web', provider: 'eas' },
  };
}
