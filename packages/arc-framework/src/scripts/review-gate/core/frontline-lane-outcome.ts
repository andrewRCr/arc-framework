/** Shared mapping from provider result reasons to lane attempt outcomes. */
import type { LaneProgressState } from "./operation-state-schema.js";
type LaneAttemptOutcome = LaneProgressState["attempts"][number]["outcome"];

/**
 * Frontline reason classes keyed to the driver's outcome vocabulary.
 *
 * The four retryable carrier failures map onto `transient-unavailable` because that is the lane's
 * own classification of them — the frontline run command routes exactly these to a retry action —
 * and it is the only value in the driver's vocabulary carrying that meaning.
 */
const FRONTLINE_REASON_OUTCOMES = {
  "rate-limited": "rate-limited",
  "transient-unavailable": "transient-unavailable",
  "source-unbound": "source-unbound",
  "capability-unsupported": "capability-unsupported",
  "execution-timeout": "timed-out",
  "head-mismatch": "stale-target",
  "target-mismatch": "stale-target",
  "invalid-output": "malformed",
  "authorization-rejected": "terminal-failure",
  "transient-transport": "transient-unavailable",
  "process-failure": "transient-unavailable",
  "signal-termination": "transient-unavailable",
  "unexpected-adapter-failure": "transient-unavailable",
} as const satisfies Record<string, LaneAttemptOutcome>;

/**
 * Map one frontline execution outcome onto the driver's attempt vocabulary.
 *
 * @param outcome - The outcome discriminator.
 * @param reasonClass - The outcome's reason class, or `null` for a verdict-bearing outcome.
 * @returns The driver-grade outcome, or `null` when the outcome concluded no attempt.
 */
export function frontlineLaneOutcome(outcome: string, reasonClass: string | null): LaneAttemptOutcome | null {
  if (outcome === "clean" || outcome === "findings") return outcome;
  if (reasonClass !== null && reasonClass in FRONTLINE_REASON_OUTCOMES) {
    return FRONTLINE_REASON_OUTCOMES[reasonClass as keyof typeof FRONTLINE_REASON_OUTCOMES];
  }
  return null;
}
