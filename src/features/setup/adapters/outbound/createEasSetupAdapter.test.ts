import { expect, test } from 'bun:test';

import type { EasProcessRequest, EasProcessRunner } from '../../../../types/process.js';
import { createEasSetupAdapter } from './createEasSetupAdapter.js';

const CREDENTIAL = { provider: 'eas', id: 'build', kind: 'expo-token' } as const;

test('EAS setup checks account and project from the provided project root', async () => {
  const requests: EasProcessRequest[] = [];
  const runProcess: EasProcessRunner = (request) => {
    requests.push(request);
    return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
  };
  const adapter = createEasSetupAdapter(runProcess);

  const result = await adapter.inspectSetup({
    projectRoot: '/project',
    target: 'android',
    credentials: [CREDENTIAL],
    resolveSecret: () => Promise.resolve('secret-token'),
  });

  expect(result.authentication.status).toBe('authenticated');
  expect(result.capabilities).toEqual([{ capability: 'build', status: 'available' }]);
  expect(requests.map((request) => request.args)).toEqual([['account:view'], ['project:info']]);
  expect(requests.every((request) => request.cwd === '/project')).toBe(true);
  expect(requests.every((request) => request.env?.EXPO_TOKEN === 'secret-token')).toBe(true);
  expect(JSON.stringify(result)).not.toContain('secret-token');
});

test('EAS setup reports project linkage as a manual action', async () => {
  const adapter = createEasSetupAdapter((request) =>
    Promise.resolve({
      exitCode: request.args[0] === 'project:info' ? 1 : 0,
      stdout: '',
      stderr: '',
    }),
  );

  const result = await adapter.inspectSetup({
    projectRoot: '/project',
    target: 'web',
    credentials: [],
    resolveSecret: () => Promise.resolve(null),
  });

  expect(result.authentication.status).toBe('authenticated');
  expect(result.provisioning[0]).toEqual({
    type: 'manual-action',
    action: {
      type: 'manual-action',
      target: 'web',
      provider: 'eas',
      code: 'EAS_PROJECT_LINK_REQUIRED',
      message: 'Link the Expo project to an EAS project before deployment.',
    },
  });
});
