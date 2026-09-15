import type {
  DeploymentAuthenticationRequiredAction,
  DeploymentProviderCapabilityState,
  DeploymentProviderSetupAdapter,
} from '@ankhorage/contracts/deploy-provider';

import type { EasProcessRunner } from '../../../../types/process.js';
import { resolveEasProcessEnvironmentAsync } from '../../../../utils/resolveEasProcessEnvironmentAsync.js';

/*** Create the EAS setup adapter used by Deploy to inspect authentication and project linkage. */
export function createEasSetupAdapter(runProcess: EasProcessRunner): DeploymentProviderSetupAdapter {
  return {
    provider: 'eas',
    inspectSetup: async (context) => {
      const environment = await resolveEasProcessEnvironmentAsync({
        ...(context.target === undefined ? {} : { target: context.target }),
        credentials: context.credentials,
        resolveSecret: context.resolveSecret,
      });
      if (!environment.ok) {
        return {
          provider: 'eas',
          authentication: { status: 'required', action: environment.action },
          capabilities: createCapabilityStates(context.target, 'unavailable', 'Authentication required.'),
          provisioning: [{ type: 'authentication', action: environment.action }],
        };
      }

      const processEnvironment = environment.env === undefined ? {} : { env: environment.env };
      const account = await runProcess({
        command: 'eas',
        args: ['account:view'],
        cwd: context.projectRoot,
        ...processEnvironment,
      });
      if (account.exitCode !== 0) {
        const action: DeploymentAuthenticationRequiredAction = {
          type: 'authentication',
          provider: 'eas',
          ...(context.target === undefined ? {} : { target: context.target }),
          code: 'EAS_AUTHENTICATION_REQUIRED',
          message:
            context.target === undefined
              ? 'EAS authentication is required for deployment.'
              : `EAS authentication is required for ${context.target} deployment.`,
        };
        return {
          provider: 'eas',
          authentication: { status: 'required', action },
          capabilities: createCapabilityStates(context.target, 'unavailable', 'Authentication required.'),
          provisioning: [{ type: 'authentication', action }],
        };
      }

      const project = await runProcess({
        command: 'eas',
        args: ['project:info'],
        cwd: context.projectRoot,
        ...processEnvironment,
      });
      if (project.exitCode !== 0) {
        const targets = context.target === undefined ? (['web', 'android', 'ios'] as const) : [context.target];
        return {
          provider: 'eas',
          authentication: { status: 'authenticated' },
          capabilities: createCapabilityStates(
            context.target,
            'unavailable',
            'EAS project link required.',
          ),
          provisioning: targets.map((target) => ({
            type: 'manual-action' as const,
            action: {
              type: 'manual-action' as const,
              target,
              provider: 'eas',
              code: 'EAS_PROJECT_LINK_REQUIRED',
              message: 'Link the Expo project to an EAS project before deployment.',
            },
          })),
        };
      }

      return {
        provider: 'eas',
        authentication: { status: 'authenticated' },
        capabilities: createCapabilityStates(context.target, 'available'),
        provisioning: [],
      };
    },
  };
}

/*** Map an optional deployment target to the EAS capabilities that setup inspection unlocks. */
function createCapabilityStates(
  target: 'web' | 'android' | 'ios' | undefined,
  status: DeploymentProviderCapabilityState['status'],
  reason?: string,
): readonly DeploymentProviderCapabilityState[] {
  const capabilities = target === undefined ? (['build', 'publish'] as const) : [target === 'web' ? 'publish' : 'build'];
  return capabilities.map((capability) => ({
    capability,
    status,
    ...(reason === undefined ? {} : { reason }),
  }));
}
