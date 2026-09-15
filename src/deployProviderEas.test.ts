import { describe, expect, it } from 'bun:test';

import { createEasDeploymentProvider } from './deployProviderEas.js';

describe('createEasDeploymentProvider', () => {
  it('registers the EAS shipment capabilities without a Deploy dependency', () => {
    const provider = createEasDeploymentProvider();

    expect(provider.descriptor).toEqual({
      id: 'eas',
      packageName: '@ankhorage/deploy-provider-eas',
      displayName: 'EAS',
      capabilities: [
        { id: 'setup', targets: ['web', 'android', 'ios'] },
        { id: 'web-publish', targets: ['web'] },
        { id: 'android-build', targets: ['android'] },
        { id: 'ios-build', targets: ['ios'] },
      ],
    });
    expect(provider.setup).toBeDefined();
    expect(provider.webPublisher).toBeDefined();
    expect(provider.androidBuilder).toBeDefined();
    expect(provider.iosBuilder).toBeDefined();
    expect(provider.androidPublisher).toBeUndefined();
    expect(provider.iosPublisher).toBeUndefined();
  });
});
