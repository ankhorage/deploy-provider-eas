export interface EasAndroidConfigSnapshot {
  readonly packageName: string;
  readonly profileEnvironment: Readonly<Record<string, string>>;
}
