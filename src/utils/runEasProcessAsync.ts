import { spawn } from 'node:child_process';

import type { EasProcessResult, EasProcessRunner } from '../types/process.js';

/*** Execute one provider-owned process and capture stdout, stderr, and its exit code. */
export const runEasProcessAsync: EasProcessRunner = async (request): Promise<EasProcessResult> =>
  await new Promise((resolve) => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const child = spawn(request.command, [...request.args], {
      cwd: request.cwd,
      env: { ...process.env, ...request.env },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => stdout.push(chunk));
    child.stderr.on('data', (chunk: string) => stderr.push(chunk));
    child.once('error', () =>
      resolve({ exitCode: -1, stdout: stdout.join(''), stderr: stderr.join('') }),
    );
    child.once('close', (code) =>
      resolve({ exitCode: code ?? -1, stdout: stdout.join(''), stderr: stderr.join('') }),
    );
  });
