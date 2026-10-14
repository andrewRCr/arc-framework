/** Bounded observation of a pushed fix head while the host still reports its ancestor. */

import type { GitExec } from "../../../lib/git/exec.js";
import { isGitObjectId } from "../../../lib/git/object-id.js";
import { isGitProcessError } from "../../../lib/git/process-error.js";
import { boundedWait, type BoundedWaitClock } from "../bounded-wait.js";
import type { HostedTarget } from "./request.js";
import type { HostedSettlementPort } from "./settle.js";

export interface HostedSettlementHeadRegistration {
  /** True only when local commit objects prove ancestry; a missing observed commit supplies no proof. */
  isAncestor(ancestor: string, descendant: string, signal: AbortSignal): Promise<boolean>;
  clock: BoundedWaitClock;
}

type HeadObservation = { state: "current" } | { state: "stale" } | { state: "pending"; observedHeadSha: string };

/** Bind local ancestry evidence to the settlement checkout without fetching or changing refs. */
export function createHostedSettlementHeadRegistration(exec: GitExec, cwd: string): HostedSettlementHeadRegistration {
  return {
    clock: { now: () => Math.floor(performance.now()), sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) },
    isAncestor: async (ancestor, descendant, signal) => {
      if (!isGitObjectId(ancestor) || !isGitObjectId(descendant)) {
        throw new Error("Hosted settlement ancestry requires complete Git object ids.");
      }
      try {
        await exec("git", ["rev-parse", "--verify", "--quiet", "--end-of-options", `${ancestor}^{commit}`],
          { cwd, signal, objectAccess: "local-only" });
        await exec("git", ["merge-base", "--is-ancestor", ancestor, descendant], { cwd, signal, objectAccess: "local-only" });
        return true;
      } catch (error) {
        if (signal.aborted) throw signal.reason;
        if (isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 1) return false;
        throw error;
      }
    },
  };
}

/** Wait at most ten seconds for a proven ancestor to become the exact fix head; never authorize a mutation. */
export async function observeHostedFixHead(
  target: HostedTarget,
  port: HostedSettlementPort,
  registration: HostedSettlementHeadRegistration | undefined,
): Promise<HeadObservation> {
  if (registration === undefined) {
    return { state: await port.readHead(target) === target.headSha ? "current" : "stale" };
  }
  let observedHeadSha: string | undefined;
  return boundedWait<HeadObservation>({
    timeoutMs: 10_000, pollIntervalMs: 1_000, clock: registration.clock,
    attempt: async ({ signal }) => {
      const actual = await port.readHead(target, { signal });
      if (actual === target.headSha) return { kind: "return", value: { state: "current" } };
      if (!await registration.isAncestor(actual, target.headSha, signal)) {
        return { kind: "return", value: { state: "stale" } };
      }
      observedHeadSha = actual;
      return { kind: "continue" };
    },
    deadline: () => {
      if (observedHeadSha === undefined) throw new Error("Hosted settlement head observation timed out before proving registration lag.");
      return { state: "pending", observedHeadSha };
    },
  });
}
