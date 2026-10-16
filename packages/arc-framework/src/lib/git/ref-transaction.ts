/** Atomic compare-and-swap updates of Git refs with state-based race reporting. */

import type { GitExec, GitExecInput, GitExecOptions } from "./exec.js";
import { isCompletedGitFailure } from "./process-error.js";
import { checkGitVersionFloor } from "./version-floor.js";

/** One ref change whose old value must match, with null requiring absence. */
export type RefChange =
  | { ref: string; next: string; expected: string | null }
  | { ref: string; delete: true; expected: string };

/** A committed transaction or every ref whose observed value defeated it. */
export type RefTransactionOutcome =
  | { status: "committed" }
  | { status: "lost-race"; refs: { ref: string; expected: string | null; actual: string | null }[] };

/** Git process boundaries used by a ref transaction and its failure observations. */
export interface RefTransactionPorts {
  exec: GitExec;
  execInput: GitExecInput;
}

/** Invocation controls shared by the transaction, observations, and version probe. */
export interface RefTransactionOptions extends Pick<GitExecOptions, "cwd" | "signal"> {
  lockWaitMs?: number;
}

/** Give ref writes and tracking fetches the same bounded lock wait in either ref format. */
export function gitRefLockArgs(waitMs = 5_000): string[] {
  return ["-c", `reftable.lockTimeout=${waitMs}`, "-c", `core.filesRefLockTimeout=${waitMs}`];
}

/** Apply every ref change in one expected-value transaction. */
export async function updateRefTransaction(
  ports: RefTransactionPorts,
  changes: readonly RefChange[],
  options: RefTransactionOptions = {},
): Promise<RefTransactionOutcome> {
  const commands = changes.map((change) => {
    if ("delete" in change) return `delete ${change.ref} ${change.expected}`;
    return change.expected === null
      ? `create ${change.ref} ${change.next}`
      : `update ${change.ref} ${change.next} ${change.expected}`;
  });
  const execution = { cwd: options.cwd, signal: options.signal };
  try {
    await ports.execInput([
      ...gitRefLockArgs(options.lockWaitMs), "update-ref", "--no-deref", "--stdin",
    ], ["start", ...commands, "prepare", "commit", ""].join("\n"), execution);
    return { status: "committed" };
  } catch (error) {
    if (!isCompletedGitFailure(error)) throw error;
    const { stdout } = await ports.exec("git", [
      "for-each-ref", "--format=%(refname) %(objectname)", "--", ...changes.map((change) => change.ref),
    ], execution);
    const tips = new Map<string, string>();
    for (const line of stdout.split("\n")) {
      const [ref, oid] = line.split(" ");
      if (ref && oid) tips.set(ref, oid);
    }
    const raced = changes.flatMap((change) => {
      const actual = tips.get(change.ref) ?? null;
      return actual === change.expected ? [] : [{ ref: change.ref, expected: change.expected, actual }];
    });
    if (raced.length > 0) return { status: "lost-race", refs: raced };
    await checkGitVersionFloor(async () => (await ports.exec("git", ["--version"], execution)).stdout, error);
    throw error;
  }
}
