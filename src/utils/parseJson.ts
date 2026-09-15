/*** Parse provider JSON output without throwing across adapter boundaries. */
export function parseJson(value: string): unknown {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed;
  } catch {
    return null;
  }
}
