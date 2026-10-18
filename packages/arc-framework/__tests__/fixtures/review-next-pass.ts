/** Explicit internal policy context for direct reducer and admission test callers. */
import type { ReviewNextPassContext } from "../../src/scripts/review-gate/policy/review-next-pass-schema.js";

export const firstReviewNextPassContext: ReviewNextPassContext = { convergence: "none", responseDue: false, incremental: null };

export function withReviewNextPassContext<Input extends object>(input: Input): Input & {
  readonly nextPassContext?: ReviewNextPassContext;
} {
  const request = input as { lane?: string; nextPassContext?: ReviewNextPassContext;
    attempts?: readonly { outcome: string }[]; terminalResponseSettled?: boolean;
    verifiedTerminalSignal?: { materialFix: boolean } };
  if (request.lane === "frontline" || request.nextPassContext !== undefined) return input;
  const outcome = request.attempts?.at(-1)?.outcome;
  return { ...input, nextPassContext: {
    convergence: request.verifiedTerminalSignal?.materialFix === true ? "unconverged"
      : outcome === "clean" ? "converged" : outcome === "findings" ? "pending" : "none",
    responseDue: outcome === "findings" && request.terminalResponseSettled !== true,
    incremental: null,
  } };
}
