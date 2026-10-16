/** Porcelain push outcomes and a leased, non-interactive Git push boundary. */

import type { GitExec, GitExecOptions } from "./exec.js";
import type { RemoteFailureReason } from "../kernel/index.js";
import { isCompletedGitFailure, normalizeGitRejection } from "./process-error.js";
import { classifyRemoteFailure, PASSIVE_REMOTE_INTERACTION } from "./remote-ref-reader.js";

/** One remote ref's reported push result. */
export type PushRefOutcome =
  | { ref: string; status: "ok" }
  | { ref: string; status: "rejected" | "remote-rejected"; reason: string }
  | { ref: string; status: "atomic-collateral" };

/** Captured process output, retained verbatim for refusal diagnostics. */
export interface PushEvidence { stdout: string; stderr: string }

/** Per-ref reports, or a whole-push failure before any reports. */
export type PushOutcome = PushEvidence & (
  | { status: "refs"; refs: PushRefOutcome[] }
  | { status: "hook-declined" | "atomic-unsupported" }
  | { status: "unreachable"; cause: RemoteFailureReason }
);

/** Interpret porcelain rows and whole-push failures without discarding their diagnostics. */
export function parsePushPorcelain(
  stdout: string, stderr: string, exitCode: number, cause: RemoteFailureReason = "error",
): PushOutcome {
  const refs = stdout.split(/\r?\n/u).flatMap((line) => {
    const row = parseRefLine(line);
    return row ? [row] : [];
  });
  const evidence = { stdout, stderr };
  if (refs.length > 0 || exitCode === 0) return { status: "refs", refs, ...evidence };
  if (`${stdout}\n${stderr}`.includes("the receiving end does not support --atomic push")) {
    return { status: "atomic-unsupported", ...evidence };
  }
  if (exitCode === 1) return { status: "hook-declined", ...evidence };
  return { status: "unreachable", cause, ...evidence };
}

function parseRefLine(line: string): PushRefOutcome | null {
  const row = /^([ +*=\-!])\t([^\t]+)\t(.*)$/u.exec(line);
  if (!row) return null;
  const ref = row[2]?.split(":").at(-1);
  if (!ref) return null;
  if (row[1] !== "!") return { ref, status: "ok" };
  const summary = row[3] ?? "";
  const rejection = /^\[([^\]]+)\](?: \((.*)\))?$/u.exec(summary);
  const reason = rejection?.[2] ?? summary;
  if (reason === "atomic push failed" || reason === "atomic push failure") {
    return { ref, status: "atomic-collateral" };
  }
  return { ref, status: rejection?.[1] === "remote rejected" ? "remote-rejected" : "rejected", reason };
}

/** An explicit source tip (null deletes), optionally leased on the remote's old tip or absence. */
export interface PushRefChange { ref: string; next: string | null; expected?: string | null }

/** Push explicit ref changes, preserving per-ref porcelain and whole-push failures. */
export async function pushRefs(
  exec: GitExec, remote: string, changes: readonly PushRefChange[],
  options: Pick<GitExecOptions, "cwd" | "signal"> = {},
): Promise<PushOutcome> {
  const leases = changes.flatMap(({ ref, expected }) => expected === undefined
    ? [] : [`--force-with-lease=${ref}:${expected ?? ""}`]);
  const args = ["push", "--porcelain", ...(changes.length > 1 ? ["--atomic"] : []), ...leases, "--", remote,
    ...changes.map(({ ref, next }) => `${next ?? ""}:${ref}`)];
  try {
    const { stdout, stderr = "" } = await exec("git", args, {
      ...options, diagnosticLocale: "stable", interaction: PASSIVE_REMOTE_INTERACTION, preserveOutput: true,
    });
    return parsePushPorcelain(stdout, stderr, 0);
  } catch (error) {
    const failure = normalizeGitRejection(error, { command: "git", args });
    const cause = failure.kind === "canceled" && options.signal?.aborted ? "timeout" : classifyRemoteFailure(failure);
    if (!isCompletedGitFailure(failure)) {
      return { status: "unreachable", cause, stdout: failure.stdout, stderr: failure.stderr };
    }
    return parsePushPorcelain(failure.stdout, failure.stderr, failure.exitCode ?? 128, cause);
  }
}
