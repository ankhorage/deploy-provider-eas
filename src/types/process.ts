export interface EasProcessRequest {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
}

export interface EasProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type EasProcessRunner = (request: EasProcessRequest) => Promise<EasProcessResult>;
