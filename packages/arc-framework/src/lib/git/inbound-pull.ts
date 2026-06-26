/**
 * The shared inbound-pull decision — the pure matrix-outcome both inbound
 * consumers route through: the `arc sync` worktree leg (making it truly
 * bidirectional) and the session-init base-ref pull. Given a fetched compare
 * state, the working-tree state, the pull policy, and interactivity, it names
 * the safe action to take — without performing it.
 *
 * The policy is what lets one matrix serve both: `arc sync` passes `always`
 * (it fast-forwards whenever safe), while the base-ref pull passes the
 * `session.init_pull.base` config. Interactivity only narrows the prompt
 * policy: under a non-TTY a would-be prompt auto-skips to `surface` rather than
 * blocking or silently pulling — the agent-safe contract.
 *
 * Side-effect-free and exhaustive over {@link WorktreeSyncState}; the impure
 * fetch + fast-forward execution wraps this.
 *
 * @module
 */

import { runDirtyStateStatus } from "./dirty-state.js";
import { boundedFetch, type GitExec } from "./exec.js";
import { countAheadBehindRef, type WorktreeSyncState } from "./worktree-sync.js";

/** Pull policy gating whether a safe fast-forward auto-fires. Mirrors `session.init_pull.base`. */
export type InboundPullPolicy = "manual" | "prompt" | "always";

/** Working-tree cleanliness — a dirty tree refuses an inbound fast-forward. */
export type InboundTreeState = "clean" | "dirty";

/**
 * The action the inbound-pull primitive should take.
 *
 * - `ff-pull` — fast-forward the local ref to the remote tip.
 * - `prompt`  — ask before fast-forwarding (interactive, prompt policy).
 * - `block`   — diverged; refuse and surface, never auto-resolve.
 * - `refuse`  — dirty working tree; refuse and surface (no auto-stash).
 * - `no-op`   — nothing to pull (up to date, or only ahead).
 * - `surface` — report state without acting (degraded state, manual policy, or
 *               a prompt auto-skipped under a non-TTY).
 */
export type InboundPullDecision =
  | "ff-pull"
  | "prompt"
  | "block"
  | "refuse"
  | "no-op"
  | "surface";

/** Inputs to {@link decideInboundPull}. */
export interface InboundPullInput {
  /** The local-vs-remote compare state from the fetch/ref comparison. */
  compareState: WorktreeSyncState;
  /** Working-tree cleanliness. */
  tree: InboundTreeState;
  /** Pull policy. `arc sync` passes `always`; the base-ref pull passes config. */
  policy: InboundPullPolicy;
  /** Whether the session is interactive — a non-TTY auto-skips a would-be prompt. */
  isTty: boolean;
}

/**
 * Decide the inbound-pull action from probed inputs. Pure and exhaustive.
 *
 * `diverged` blocks regardless of tree or policy (never auto-resolve); a dirty
 * tree refuses an otherwise-fast-forwardable pull; an up-to-date or ahead-only
 * branch is a no-op; degraded states surface. Only `remote-ahead` + clean is
 * actionable, and the policy decides how: `always` fast-forwards, `manual`
 * surfaces, and `prompt` asks in a TTY but auto-skips to `surface` otherwise.
 *
 * @param input - The compare state, tree state, policy, and interactivity.
 * @returns The action the caller should take.
 */
export function decideInboundPull(input: InboundPullInput): InboundPullDecision {
  switch (input.compareState) {
    case "diverged":
      return "block";
    case "remote-ahead":
      if (input.tree === "dirty") return "refuse";
      switch (input.policy) {
        case "always":
          return "ff-pull";
        case "prompt":
          return input.isTty ? "prompt" : "surface";
        case "manual":
          return "surface";
      }
    // eslint-disable-next-line no-fallthrough -- the inner switch is exhaustive and returns.
    case "clean":
    case "local-ahead":
      return "no-op";
    case "no-upstream":
    case "no-remote":
    case "branch-gone":
    case "remote-unavailable":
    case "detached-head":
    case "skipped":
      return "surface";
  }
}

/** Inputs to {@link executeInboundPull}. */
export interface ExecuteInboundPullInput {
  /** Git executor pinned to the target worktree. */
  exec: GitExec;
  /** The checked-out branch to compare against `origin/<branch>` and fast-forward. */
  branch: string;
  /** Pull policy. `arc sync` passes `always`; the base-ref pull passes config. */
  policy: InboundPullPolicy;
  /** Whether the session is interactive — a non-TTY auto-skips a would-be prompt. */
  isTty: boolean;
  /** Abort the fetch leg after this many milliseconds. */
  fetchTimeoutMs: number;
}

/** The outcome of an {@link executeInboundPull} run. */
export interface InboundPullExecution {
  /** The decision taken — `block` when a fast-forward raced and no longer applied. */
  decision: InboundPullDecision;
  /** Whether the local branch ref was actually fast-forwarded. */
  fastForwarded: boolean;
  /** Local commits ahead of the remote at compare time (0 outside healthy states). */
  ahead: number;
  /** Remote commits ahead of local at compare time (0 outside healthy states). */
  behind: number;
}

/**
 * The impure shell wrapping {@link decideInboundPull}: fetch, compare, and
 * conflict-handled fast-forward on the `ff-pull` outcome; surface otherwise.
 *
 * The fast-forward is `git merge --ff-only`, so it can never produce a merge
 * commit — a non-fast-forwardable state errors and is caught as `block` rather
 * than auto-resolved. A degraded fetch (timeout / unreachable) surfaces without
 * comparing. Only the `ff-pull` decision mutates anything; `block`, `refuse`,
 * `no-op`, `prompt`, and `surface` leave the branch untouched.
 *
 * @param input - The worktree executor, target branch, policy, interactivity,
 *   and fetch timeout.
 * @returns The decision taken and whether the branch was fast-forwarded.
 */
export async function executeInboundPull(
  input: ExecuteInboundPullInput,
): Promise<InboundPullExecution> {
  const fetch = await boundedFetch(input.exec, input.branch, input.fetchTimeoutMs);
  if (fetch.outcome !== "ok") {
    return { decision: "surface", fastForwarded: false, ahead: 0, behind: 0 };
  }

  const { ahead, behind, state } = await countAheadBehindRef(
    input.exec,
    "HEAD",
    `origin/${input.branch}`,
  );
  const dirty = await runDirtyStateStatus({ exec: input.exec });
  const decision = decideInboundPull({
    compareState: state,
    tree: dirty.state,
    policy: input.policy,
    isTty: input.isTty,
  });

  if (decision !== "ff-pull") {
    return { decision, fastForwarded: false, ahead, behind };
  }

  try {
    await input.exec("git", ["merge", "--ff-only", `origin/${input.branch}`]);
    return { decision: "ff-pull", fastForwarded: true, ahead, behind };
  } catch {
    // The remote moved between the compare and the merge, so the fast-forward no
    // longer applies. Refuse to auto-resolve rather than fall back to a merge.
    return { decision: "block", fastForwarded: false, ahead, behind };
  }
}
