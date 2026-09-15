import { expect, test } from 'bun:test';

import type { EasProcessRequest, EasProcessRunner } from '../../../../types/process.js';
import { createEasAndroidBuilder } from './createEasAndroidBuilder.js';

const CREDENTIAL = { provider: 'eas', id: 'build', kind: 'expo-token' } as const;
const ACCESS = {
  credentials: [CREDENTIAL],
  resolveSecret: () => Promise.resolve('secret-token'),
} as const;

function androidConfig(): string {
  return JSON.stringify({
    buildProfile: { env: { APP_ENV: 'prod' } },
    appConfig: { android: { package: 'com.example.app' } },
  });
}

test('EAS Android builder inspects config and produces a local fingerprint', async () => {
  const requests: EasProcessRequest[] = [];
  const runProcess: EasProcessRunner = (request) => {
    requests.push(request);
    return Promise.resolve(
      request.command === 'node'
        ? { exitCode: 0, stdout: JSON.stringify({ hash: 'a'.repeat(40) }), stderr: '' }
        : { exitCode: 0, stdout: androidConfig(), stderr: '' },
    );
  };
  const builder = createEasAndroidBuilder(runProcess);

  const result = await builder.inspectAsync({
    projectRoot: '/project',
    packageName: 'com.example.app',
    buildProfile: 'production',
    ...ACCESS,
  });

  expect(result).toEqual({ status: 'completed', value: { fingerprint: 'a'.repeat(40) } });
  expect(requests[0]?.args).toEqual([
    'config',
    '--platform',
    'android',
    '--profile',
    'production',
    '--json',
    '--non-interactive',
  ]);
  expect(requests[0]?.env?.EXPO_TOKEN).toBe('secret-token');
  expect(requests[1]?.command).toBe('node');
  expect(requests[1]?.env?.APP_ENV).toBe('prod');
});

test('EAS Android builder normalizes one finished AAB artifact', async () => {
  const fingerprint = 'b'.repeat(40);
  const builder = createEasAndroidBuilder(() =>
    Promise.resolve({
      exitCode: 0,
      stdout: JSON.stringify([
        {
          id: 'build-id',
          status: 'FINISHED',
          platform: 'ANDROID',
          buildProfile: 'production',
          appBuildVersion: '42',
          fingerprint: { hash: fingerprint },
          artifacts: { applicationArchiveUrl: 'https://example.test/app.aab' },
        },
      ]),
      stderr: '',
    }),
  );

  const result = await builder.buildAsync({
    projectRoot: '/project',
    packageName: 'com.example.app',
    buildProfile: 'production',
    expectedFingerprint: fingerprint,
    ...ACCESS,
  });

  expect(result).toEqual({
    status: 'completed',
    value: {
      provider: 'eas',
      buildId: 'build-id',
      buildProfile: 'production',
      fingerprint,
      versionCode: 42,
      archiveUrl: 'https://example.test/app.aab',
    },
  });
  expect(JSON.stringify(result)).not.toContain('secret-token');
});
