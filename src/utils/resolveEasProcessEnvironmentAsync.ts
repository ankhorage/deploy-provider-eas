import type { AppDeployTargetId } from '@ankhorage/contracts/deploy';
import type {
  DeploymentAuthenticationRequiredAction,
  DeploymentCredentialReference,
  DeploymentSecretResolver,
} from '@ankhorage/contracts/deploy-provider';

export type EasProcessEnvironmentResult =
  | { readonly ok: true; readonly env?: Readonly<Record<string, string>> }
  | { readonly ok: false; readonly action: DeploymentAuthenticationRequiredAction };

/*** Resolve an optional EAS token credential into a child-process environment without leaking it. */
export async function resolveEasProcessEnvironmentAsync(options: {
  readonly target?: AppDeployTargetId;
  readonly credentials: readonly DeploymentCredentialReference[];
  readonly resolveSecret: DeploymentSecretResolver;
}): Promise<EasProcessEnvironmentResult> {
  const reference = options.credentials.find(
    (credential) => credential.provider === 'eas' && credential.kind === 'expo-token',
  );
  if (reference === undefined) return { ok: true };

  const token = await options.resolveSecret(reference).catch(() => null);
  if (token !== null && token.length > 0) return { ok: true, env: { EXPO_TOKEN: token } };

  return {
    ok: false,
    action: {
      type: 'authentication',
      provider: 'eas',
      ...(options.target === undefined ? {} : { target: options.target }),
      code: 'EAS_AUTHENTICATION_REQUIRED',
      message:
        options.target === undefined
          ? 'EAS authentication is required for deployment.'
          : `EAS authentication is required for ${options.target} deployment.`,
    },
  };
}
