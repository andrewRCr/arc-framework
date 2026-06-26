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

import type { WorktreeSyncState } from "./worktree-sync.js";

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
