/** Dependency-injectable launcher contract for repository-only passive waiting. */

import { runAwait, type AwaitClock, type AwaitHostPort, type AwaitKind, type AwaitTerminal } from "./await.js";

export interface AwaitArguments {
  kind: AwaitKind;
  expectedHeadSha: string;
  intervalMs: number;
  timeoutMs: number;
}

function positive(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Parse the stable private launcher arguments. */
export function parseAwaitArguments(args: string[]): AwaitArguments {
  const usage = "usage: review-gate:await <ci|review> --head <sha> [--interval-ms <n>] [--timeout-ms <n>]";
  const kind = args[0];
  if (kind !== "ci" && kind !== "review") throw new Error(usage);
  const values = new Map<string, string>();
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === undefined || value === undefined || !["--head", "--interval-ms", "--timeout-ms"].includes(flag)) {
      throw new Error(usage);
    }
    values.set(flag, value);
  }
  const expectedHeadSha = values.get("--head");
  const intervalMs = values.has("--interval-ms") ? positive(values.get("--interval-ms")) : 30_000;
  const timeoutMs = values.has("--timeout-ms") ? positive(values.get("--timeout-ms")) : 3_600_000;
  if (expectedHeadSha === undefined || !/^[a-f0-9]{40}$/u.test(expectedHeadSha)
    || intervalMs === null || timeoutMs === null) throw new Error(usage);
  return { kind, expectedHeadSha, intervalMs, timeoutMs };
}

/** Run the watcher and serialize every transition/result through one output port. */
export async function runAwaitMain(input: {
  args: string[];
  repositoryRef: string;
  pullRequestNumber: number;
  host: AwaitHostPort;
  clock: AwaitClock;
  write(line: string): void;
}): Promise<AwaitTerminal> {
  const args = parseAwaitArguments(input.args);
  const result = await runAwait({
    ...args,
    repositoryRef: input.repositoryRef,
    pullRequestNumber: input.pullRequestNumber,
    host: input.host,
    clock: input.clock,
    backoff: (attempt, interval) => Math.min(interval * 2 ** Math.min(attempt, 3), interval * 8),
    output: {
      emit: (transition) => {
        input.write(JSON.stringify({ type: "transition", ...transition }));
        return Promise.resolve();
      },
    },
  });
  input.write(JSON.stringify({ type: "terminal", ...result }));
  return result;
}
