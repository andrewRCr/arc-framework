/** Preserve the next request position established by verified current or retained terminal policy. */
import { projectReviewPolicyAttempt, type ReviewResolveEnvelope } from "./review-policy-driver.js";
import { terminalPolicyOutcome, type HostedReservationDischarge } from "./hosted-reservation-support.js";
import { projectHostedConvergedComplete } from "./hosted-coverage-selection.js";
import type { ReviewNextPassContext } from "./review-next-pass-schema.js";

type TerminalProducer = { attemptId: string; sourceId: string; outcome: string; chunkSeriesComplete?: boolean };
type RequestContext = Pick<HostedReservationDischarge, "requestAttempts" | "completedPasses" | "requestCoverage" | "invocation">;
type CorrectionContext = Pick<HostedReservationDischarge, "correctionScope" | "coverageSelectionAction" | "nextSource" | "requestCoverage">;

/** Keep outstanding findings authoritative while projecting an evidence-bound native grant's next source. */
export function createHostedTerminalDischargeProjection(input: {
  nativePassGrants?: true;
  sources: readonly string[];
  nextPassContext?: ReviewNextPassContext;
  retainedFindingsBeforeRequest: () => Promise<HostedReservationDischarge | null>;
  requestContext: () => RequestContext;
  correctionContext: () => Promise<Partial<CorrectionContext>>;
}) {
  const ready = async (policy: ReviewResolveEnvelope, terminal: TerminalProducer): Promise<HostedReservationDischarge | null> => {
    if (input.nativePassGrants !== true || policy.state !== "ready") return null;
    return await input.retainedFindingsBeforeRequest() ?? { discharged: false,
      detail: "The recorded extra-pass judgment admits another review.", ...input.requestContext(),
      terminalAttempt: projectReviewPolicyAttempt({ ...terminal, outcome: terminalPolicyOutcome(terminal.outcome) }),
      terminalPolicyState: policy.state, nextSource: policy.payload.sourceId, requestCoverage: "complete" };
  };
  const retained = async (policy: ReviewResolveEnvelope, terminal: TerminalProducer): Promise<HostedReservationDischarge> => {
    const nativeReady = await ready(policy, terminal);
    if (nativeReady !== null) return nativeReady;
    const context = policy.state === "coverage-required" ? await input.correctionContext() : {};
    return { discharged: false,
      detail: `The retained terminal review producer did not establish convergence (${policy.state}/${policy.nextAction}).`,
      terminalPolicyState: policy.state, nextSource: null, ...input.requestContext(), ...context,
      ...projectHostedConvergedComplete({ sources: input.sources,
        nextPassContext: input.nextPassContext, policyState: policy.state }) };
  };
  return { ready, retained };
}
