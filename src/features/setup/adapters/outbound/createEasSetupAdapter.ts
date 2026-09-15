import type {
  DeploymentAuthenticationRequiredAction,
  DeploymentProviderCapabilityState,
  DeploymentProviderSetupAdapter,
  DeploymentProviderSetupContext,
  DeploymentProviderSetupInspection,
  DeploymentProvisioningRequirement,
} from '@ankhorage/contracts/deploy-provider';

import type { EasProcessRunner } from '../../../../types/process.js';
import { resolveEasProcessEnvironmentAsync } from '../../../../utils/resolveEasProcessEnvironmentAsync.js';

type EasSetupTarget = DeploymentProviderSetupContext['target'];

/*** Create the EAS setup adapter used by Deploy to inspect authentication and project linkage. */
export function createEasSetupAdapter(
  runProcess: EasProcessRunner,
): DeploymentProviderSetupAdapter {
  return {
    provider: 'eas',
    inspectSetup: (context) => inspectEasSetupAsync(context, runProcess),
  };
}

/*** Inspect EAS authentication and project linkage for one deployment context. */
async function inspectEasSetupAsync(
  context: DeploymentProviderSetupContext,
  runProcess: EasProcessRunner,
): Promise<DeploymentProviderSetupInspection> {
  const environment = await resolveEasProcessEnvironmentAsync({
    ...(context.target === undefined ? {} : { target: context.target }),
    credentials: context.credentials,
    resolveSecret: context.resolveSecret,
  });
  if (!environment.ok) {
    return authenticationRequiredInspection(context.target, environment.action);
  }
  return inspectAuthenticatedProjectAsync(context, environment.env, runProcess);
}

/*** Inspect the authenticated EAS account and project linkage. */
async function inspectAuthenticatedProjectAsync(
  context: DeploymentProviderSetupContext,
  environment: Readonly<Record<string, string>> | undefined,
  runProcess: EasProcessRunner,
): Promise<DeploymentProviderSetupInspection> {
  const processEnvironment = environment === undefined ? {} : { env: environment };
  const account = await runProcess({
    command: 'eas',
    args: ['account:view'],
    cwd: context.projectRoot,
    ...processEnvironment,
  });
  if (account.exitCode !== 0) {
    const action = createAuthenticationRequiredAction(context.target);
    return authenticationRequiredInspection(context.target, action);
  }

  const project = await runProcess({
    command: 'eas',
    args: ['project:info'],
    cwd: context.projectRoot,
    ...processEnvironment,
  });
  return project.exitCode === 0
    ? readyInspection(context.target)
    : projectLinkRequiredInspection(context.target);
}

/*** Build the authentication action emitted when EAS account access is unavailable. */
function createAuthenticationRequiredAction(
  target: EasSetupTarget,
): DeploymentAuthenticationRequiredAction {
  return {
    type: 'authentication',
    provider: 'eas',
    ...(target === undefined ? {} : { target }),
    code: 'EAS_AUTHENTICATION_REQUIRED',
    message:
      target === undefined
        ? 'EAS authentication is required for deployment.'
        : `EAS authentication is required for ${target} deployment.`,
  };
}

/*** Build one setup result that requests EAS authentication. */
function authenticationRequiredInspection(
  target: EasSetupTarget,
  action: DeploymentAuthenticationRequiredAction,
): DeploymentProviderSetupInspection {
  return {
    provider: 'eas',
    authentication: { status: 'required', action },
    capabilities: createCapabilityStates(target, 'unavailable', 'Authentication required.'),
    provisioning: [{ type: 'authentication', action }],
  };
}

/*** Build one setup result that requests project linkage for all affected targets. */
function projectLinkRequiredInspection(target: EasSetupTarget): DeploymentProviderSetupInspection {
  return {
    provider: 'eas',
    authentication: { status: 'authenticated' },
    capabilities: createCapabilityStates(target, 'unavailable', 'EAS project link required.'),
    provisioning: resolveSetupTargets(target).map(createProjectLinkRequirement),
  };
}

/*** Build one project-link requirement for a deployment target. */
function createProjectLinkRequirement(
  target: 'web' | 'android' | 'ios',
): DeploymentProvisioningRequirement {
  return {
    type: 'manual-action',
    action: {
      type: 'manual-action',
      target,
      provider: 'eas',
      code: 'EAS_PROJECT_LINK_REQUIRED',
      message: 'Link the Expo project to an EAS project before deployment.',
    },
  };
}

/*** Build the successful EAS setup inspection. */
function readyInspection(target: EasSetupTarget): DeploymentProviderSetupInspection {
  return {
    provider: 'eas',
    authentication: { status: 'authenticated' },
    capabilities: createCapabilityStates(target, 'available'),
    provisioning: [],
  };
}

/*** Resolve the concrete targets affected by a targetless setup inspection. */
function resolveSetupTargets(target: EasSetupTarget): readonly ('web' | 'android' | 'ios')[] {
  return target === undefined ? ['web', 'android', 'ios'] : [target];
}

/*** Map an optional deployment target to the EAS capabilities that setup inspection unlocks. */
function createCapabilityStates(
  target: EasSetupTarget,
  status: DeploymentProviderCapabilityState['status'],
  reason?: string,
): readonly DeploymentProviderCapabilityState[] {
  const capabilities: readonly DeploymentProviderCapabilityState['capability'][] =
    target === undefined ? ['build', 'publish'] : [target === 'web' ? 'publish' : 'build'];
  return capabilities.map<DeploymentProviderCapabilityState>((capability) =>
    reason === undefined ? { capability, status } : { capability, status, reason },
  );
}
