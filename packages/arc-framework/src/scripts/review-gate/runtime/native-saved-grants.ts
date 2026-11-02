/** Verify old singleton call inputs against the selected owner's exact stored authority without writes. */
import type { CanonicalDigest } from "../../../lib/kernel/index.js";
import { readLaneProgress } from "../lane-progress.js";
import { ReviewLaneJudgmentSchema } from "../policy/review-policy-driver.js";
import { createReviewCompositionContext } from "./composition-context.js";
import { recordedNativeExtraPassJudgmentMatches } from "./native-extra-pass.js";
import { resolveReviewInvocation, type ReviewInvocationInput } from "./invocation.js";
import { createPrePublicationCompositionDependencies } from "../policy/pre-publication-composition.js";

/** Match only exact singleton authority; an unbound delivery subject cannot be inferred from a Candidate. */
export async function nativeSavedCandidateGrantMatches(invocation: ReviewInvocationInput, input: {
  workUnit: string; candidateId: CanonicalDigest; subjectDigest: CanonicalDigest; headSha: string;
  lane: "frontline" | "standard"; judgment: unknown;
}): Promise<boolean> {
  const bound = { ...invocation, ...resolveReviewInvocation(invocation) };
  const { family } = createReviewCompositionContext(bound);
  const store = family.ports.inFlight;
  if (store.nativeFacts === undefined) return false;
  const composition = createPrePublicationCompositionDependencies(bound);
  if ((await composition.readDeliveryReviewTargets(input.workUnit)).status !== "absent") return false;
  const target = await composition.resolveTarget(input.headSha);
  if (target.status !== "resolved") return false;
  const repositoryId = await bound.projectId();
  const lineage = { kind: "candidate" as const, candidateId: input.candidateId };
  const progress = await readLaneProgress(store, { lane: input.lane, repositoryId, lineage, headSha: input.headSha });
  return recordedNativeExtraPassJudgmentMatches({ facts: store.nativeFacts, repositoryId, lane: input.lane,
    subject: { lineage, headSha: input.headSha, subjectDigest: input.subjectDigest },
    completedPasses: progress.status === "recorded" ? progress.completedPasses : 0,
    policyTarget: target.target,
    judgment: ReviewLaneJudgmentSchema.parse(input.judgment) });
}
