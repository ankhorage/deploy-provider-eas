import { expect, test } from 'bun:test';

import type { EasProcessRequest, EasProcessRunner } from '../../../../types/process.js';
import { createEasIosBuilder } from './createEasIosBuilder.js';

const CREDENTIAL = { provider: 'eas', id: 'build', kind: 'expo-token' } as const;
const ACCESS = {
  credentials: [CREDENTIAL],
  resolveSecret: () => Promise.resolve('secret-token'),
} as const;

function iosConfig(): string {
  return JSON.stringify({
    buildProfile: { env: { APP_ENV: 'prod' } },
    appConfig: { ios: { bundleIdentifier: 'com.example.app' } },
  });
}

test('EAS iOS builder inspects config and produces a local fingerprint', async () => {
  const requests: EasProcessRequest[] = [];
  const runProcess: EasProcessRunner = (request) => {
    requests.push(request);
    return Promise.resolve(
      request.command === 'node'
        ? { exitCode: 0, stdout: JSON.stringify({ hash: 'c'.repeat(40) }), stderr: '' }
        : { exitCode: 0, stdout: iosConfig(), stderr: '' },
    );
  };
  const builder = createEasIosBuilder(runProcess);

  const result = await builder.inspectAsync({
    projectRoot: '/project',
    bundleIdentifier: 'com.example.app',
    buildProfile: 'production',
    ...ACCESS,
  });

  expect(result).toEqual({ status: 'completed', value: { fingerprint: 'c'.repeat(40) } });
  expect(requests[0]?.args).toEqual([
    'config',
    '--platform',
    'ios',
    '--profile',
    'production',
    '--json',
    '--non-interactive',
  ]);
  expect(requests[0]?.env?.EXPO_TOKEN).toBe('secret-token');
  expect(requests[1]?.command).toBe('node');
  expect(requests[1]?.env?.APP_ENV).toBe('prod');
});

test('EAS iOS builder normalizes one finished IPA artifact', async () => {
  const fingerprint = 'd'.repeat(40);
  const builder = createEasIosBuilder(() =>
    Promise.resolve({
      exitCode: 0,
      stdout: JSON.stringify([
        {
          id: 'build-id',
          status: 'FINISHED',
          platform: 'IOS',
          buildProfile: 'production',
          appVersion: '1.2.3',
          appBuildVersion: '17',
          fingerprint: { hash: fingerprint },
          artifacts: { applicationArchiveUrl: 'https://example.test/app.ipa' },
        },
      ]),
      stderr: '',
    }),
  );

  const result = await builder.buildAsync({
    projectRoot: '/project',
    bundleIdentifier: 'com.example.app',
    buildProfile: 'production',
    expectedFingerprint: fingerprint,
    version: '1.2.3',
    ...ACCESS,
  });

  expect(result).toEqual({
    status: 'completed',
    value: {
      provider: 'eas',
      buildId: 'build-id',
      buildProfile: 'production',
      fingerprint,
      version: '1.2.3',
      buildNumber: '17',
      archiveUrl: 'https://example.test/app.ipa',
    },
  });
  expect(JSON.stringify(result)).not.toContain('secret-token');
});
