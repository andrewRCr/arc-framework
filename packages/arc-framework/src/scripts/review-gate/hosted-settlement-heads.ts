/** Exact response-head checks shared by native receipts and repository lane progress. */
import type { LaneProgressState, HostedSettlementEvidence, LaneResponsePerformance } from "./core/operation-state-schema.js";
import type { ResponseContinuationContext } from "./hosted-response-completion.js";

/** The recorded facts needed to prove the heads of a completed hosted fix settlement. */
export interface HostedFixSettlementHeadsInput {
  producerId: string;
  dispositionSetId: string | null;
  performance: LaneResponsePerformance;
  findingActions: Readonly<NonNullable<LaneProgressState["attempts"][number]["hosted"]>["dispositionSetLineage"][number]["findingActions"]>;
  settlementEvidence: readonly HostedSettlementEvidence[];
  context?: ResponseContinuationContext;
}

/** Require every host fix receipt to name the verified head or its proved record continuation. */
export async function assertHostedFixSettlementHeads(input: HostedFixSettlementHeadsInput): Promise<void> {
  const { performance, context } = input;
  const hostFixFindingIds = input.findingActions
    .filter(({ disposition, channelAction }) =>
      disposition === "fix" && channelAction === "reply-and-resolve")
    .map(({ findingId }) => findingId);
  const fixEvidence = input.settlementEvidence.filter((evidence) =>
    evidence.dispositionSetId === input.dispositionSetId
    && hostFixFindingIds.includes(evidence.findingId));
  if (fixEvidence.length !== hostFixFindingIds.length) {
    throw new Error("hosted fix settlement does not match durable response-head evidence");
  }
  for (const evidence of fixEvidence) {
    if (evidence.channelAction !== "reply-and-resolve") {
      throw new Error("hosted fix settlement does not match durable response-head evidence");
    }
    const head = evidence.fixTarget?.headSha;
    if (head === undefined
      || (head !== performance.producedHeadSha && !await context?.confirmResponseHeadContinuation?.({
        repositoryId: context.repositoryId, lineage: context.lineage, producerId: input.producerId,
        dispositionSetId: performance.dispositionSetId, originatingHeadSha: performance.originatingHeadSha,
        fromHeadSha: performance.producedHeadSha, toHeadSha: head,
      }))) throw new Error("hosted fix settlement does not match durable response-head evidence");
  }
}
