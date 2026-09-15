import { expect, test } from 'bun:test';

import type { EasProcessRequest, EasProcessRunner } from '../../../../types/process.js';
import { createEasWebPublisher } from './createEasWebPublisher.js';

const CREDENTIAL = { provider: 'eas', id: 'hosting', kind: 'expo-token' } as const;

test('EAS web publisher maps production intent and normalizes publication output', async () => {
  const requests: EasProcessRequest[] = [];
  const runProcess: EasProcessRunner = (request) => {
    requests.push(request);
    return Promise.resolve({
      exitCode: 0,
      stdout: JSON.stringify({ identifier: 'deployment-1', url: 'https://example.test' }),
      stderr: '',
    });
  };
  const publisher = createEasWebPublisher(runProcess);

  const result = await publisher.publishAsync({
    projectRoot: '/project',
    exportDirectory: 'dist',
    revision: 'rev-1',
    intent: { mode: 'production', alias: 'prod', environment: 'production' },
    credentials: [CREDENTIAL],
    resolveSecret: () => Promise.resolve('secret-token'),
  });

  expect(result).toEqual({
    status: 'completed',
    value: {
      target: 'web',
      revision: 'rev-1',
      provider: 'eas',
      deploymentId: 'deployment-1',
      url: 'https://example.test',
      production: true,
    },
  });
  expect(requests[0]?.args).toEqual([
    'deploy',
    '--json',
    '--non-interactive',
    '--export-dir',
    'dist',
    '--prod',
    '--alias',
    'prod',
    '--environment',
    'production',
  ]);
  expect(requests[0]?.env?.EXPO_TOKEN).toBe('secret-token');
  expect(JSON.stringify(result)).not.toContain('secret-token');
});
