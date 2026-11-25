/** Exact response-head checks shared by native receipts and repository lane progress. */
import type { LaneProgressState, HostedSettlementEvidence, LaneResponsePerformance } from "./core/operation-state-schema.js";
import type { ResponseContinuationContext } from "./hosted-response-completion.js";

/** The recorded facts needed to prove the heads of a completed hosted fix settlement. */
interface HostedFixSettlementHeadsInput {
  producerId: string;
  dispositionSetId: string | null;
  performance: LaneResponsePerformance;
  findingActions: Readonly<NonNullable<LaneProgressState["attempts"][number]["hosted"]>["dispositionSetLineage"][number]["findingActions"]>;
  settlementEvidence: readonly HostedSettlementEvidence[];
  context?: ResponseContinuationContext;
}

/**
 * Require every host fix receipt, and every deferred or rejected receipt this response settled after its fix push, to
 * name the verified head or its proved record continuation. A receipt carried from a predecessor response was checked
 * against that response's head when it settled.
 */
export async function assertHostedFixSettlementHeads(input: HostedFixSettlementHeadsInput): Promise<void> {
  const { performance, context } = input;
  const hostFixFindingIds = input.findingActions
    .filter(({ disposition, channelAction }) =>
      disposition === "fix" && channelAction === "reply-and-resolve")
    .map(({ findingId }) => findingId);
  const setEvidence = input.settlementEvidence.filter((evidence) =>
    evidence.dispositionSetId === input.dispositionSetId);
  const fixEvidence = setEvidence.filter((evidence) => hostFixFindingIds.includes(evidence.findingId));
  if (fixEvidence.length !== hostFixFindingIds.length) {
    throw new Error("hosted fix settlement does not match durable response-head evidence");
  }
  const afterFixEvidence = setEvidence.filter((evidence) => !hostFixFindingIds.includes(evidence.findingId)
    && evidence.channelAction === "reply-and-resolve" && evidence.fixTarget !== null
    && evidence.carriedFromDispositionSetId === null);
  for (const evidence of [...fixEvidence, ...afterFixEvidence]) {
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
