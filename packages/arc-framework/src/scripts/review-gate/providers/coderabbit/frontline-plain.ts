/** Version-pinned fail-closed parser for CodeRabbit plain frontline output. */

export const CODERABBIT_FRONTLINE_CLI_VERSION = "0.6.5";
export const CODERABBIT_FRONTLINE_MODE = "plain-compatibility";

export type CodeRabbitPlainProviderResult =
  | { kind: "clean" }
  | { kind: "rate-limited" }
  | { kind: "stale-head"; expectedHeadSha: string; observedHeadSha: string }
  | { kind: "malformed" }
  | { kind: "failed"; reason: string };

/**
 * Parse only fixture-qualified plain output; unknown or incomplete text remains non-clean.
 *
 * @param input - Captured direct-process result plus exact target head binding.
 * @returns A provider result accepted by frontline outcome normalization.
 */
export function parseCodeRabbitPlainResult(input: {
  cliVersion: string;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  expectedHead: string;
  observedHead: string;
}): CodeRabbitPlainProviderResult {
  if (input.cliVersion !== CODERABBIT_FRONTLINE_CLI_VERSION) return { kind: "malformed" };
  if (input.observedHead !== input.expectedHead) {
    return {
      kind: "stale-head",
      expectedHeadSha: input.expectedHead,
      observedHeadSha: input.observedHead,
    };
  }
  if (/rate limit(?:ed| exceeded)?/iu.test(`${input.stdout}\n${input.stderr}`)) {
    return { kind: "rate-limited" };
  }
  if (input.signal !== null) return { kind: "failed", reason: `process-signal:${input.signal}` };
  if (input.exitCode !== 0) return { kind: "failed", reason: "process-exit" };

  const explicitClean = /(?:^|\n)Review complete\r?\nNo findings ✔(?:\r?\n|$)/u.test(input.stdout)
    && /(?:^|\n)\d+ files? reviewed:\r?\n-/u.test(input.stdout);
  return explicitClean ? { kind: "clean" } : { kind: "malformed" };
}
