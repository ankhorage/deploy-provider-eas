import type { WebDeploymentPublisher } from '@ankhorage/contracts/deploy-provider';

import type { EasProcessRunner } from '../../../../types/process.js';
import { resolveEasProcessEnvironmentAsync } from '../../../../utils/resolveEasProcessEnvironmentAsync.js';
import { parseEasWebPublication } from '../../utils/parseEasWebPublication.js';

/*** Create the EAS Hosting publisher implementing the provider-neutral web publication port. */
export function createEasWebPublisher(runProcess: EasProcessRunner): WebDeploymentPublisher {
  return {
    publishAsync: async (request) => {
      if (
        (request.intent.alias !== undefined && request.intent.alias.trim().length === 0) ||
        (request.intent.environment !== undefined && request.intent.environment.trim().length === 0)
      ) {
        return {
          status: 'failed',
          failure: {
            code: 'INVALID_WEB_PUBLISH_INTENT',
            message: 'Web publish intent is invalid.',
            target: 'web',
            provider: 'eas',
          },
        };
      }

      const environment = await resolveEasProcessEnvironmentAsync({
        target: 'web',
        credentials: request.credentials,
        resolveSecret: request.resolveSecret,
      });
      if (!environment.ok) return { status: 'action-required', action: environment.action };

      const args = [
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
      const result = await runProcess({
        command: 'eas',
        args,
        cwd: request.projectRoot,
        ...(environment.env === undefined ? {} : { env: environment.env }),
      });
      if (result.exitCode !== 0) {
        return {
          status: 'failed',
          failure: {
            code: 'EAS_WEB_PUBLISH_FAILED',
            message: 'EAS Hosting publication failed.',
            target: 'web',
            provider: 'eas',
          },
        };
      }

      const parsed = parseJson(result.stdout);
      const publication = parseEasWebPublication(
        parsed,
        request.revision,
        request.intent.mode === 'production',
      );
      return publication === null
        ? {
            status: 'failed',
            failure: {
              code: 'EAS_WEB_INVALID_RESULT',
              message: 'EAS Hosting returned an invalid result.',
              target: 'web',
              provider: 'eas',
            },
          }
        : { status: 'completed', value: publication };
    },
  };
}

/*** Parse provider JSON output without throwing across the adapter boundary. */
function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
