export interface EasIosConfigSnapshot {
  readonly bundleIdentifier: string;
  readonly profileEnvironment: Readonly<Record<string, string>>;
}
