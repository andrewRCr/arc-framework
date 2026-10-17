/** Parse fetch porcelain without losing per-ref refusal evidence. */

import type { ExecResult } from "./exec.js";
import type { RemoteFailureReason } from "../kernel/index.js";
import { GitProcessError, isCompletedGitFailure } from "./process-error.js";
import { classifyRemoteFailure } from "./remote-ref-reader.js";

/** One reported fetch update, including both tips on refusal. */
export interface FetchRefOutcome { flag: " " | "+" | "*" | "-" | "!" | "="; old: string; next: string; ref: string }

/** Original process evidence plus per-ref reports or a rowless remote failure. */
export type FetchOutcome = { stdout: string; stderr: string } & (
  | { status: "refs"; refs: FetchRefOutcome[] }
  | { status: "unreachable"; cause: RemoteFailureReason }
);

/** Interpret complete fetch output or a typed process rejection. */
export function parseFetchPorcelain(input: ExecResult | GitProcessError): FetchOutcome {
  if (input instanceof GitProcessError && !isCompletedGitFailure(input)) return {
    status: "unreachable", cause: input.timedOut ? "timeout" : "error", stdout: input.stdout, stderr: input.stderr,
  };
  const refs = input.stdout.split(/\r?\n/u).flatMap((line) => {
    const row = /^([ +*\-!=]) ([0-9a-f]{40}|[0-9a-f]{64}) ([0-9a-f]{40}|[0-9a-f]{64}) (\S+)$/u.exec(line);
    const [, flag, old, next, ref] = row ?? [];
    return flag && old && next && ref ? [{ flag: flag as FetchRefOutcome["flag"], old, next, ref }] : [];
  });
  const evidence = { stdout: input.stdout, stderr: input.stderr ?? "" };
  if (refs.length > 0 || !(input instanceof GitProcessError)) return { status: "refs", refs, ...evidence };
  return { status: "unreachable", cause: classifyRemoteFailure(input), ...evidence };
}
