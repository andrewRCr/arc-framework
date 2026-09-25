/** Proof that a private-member frontline fix was already settled into its bound Candidate. */

import { canonicalize } from "../../lib/canonical/canonical-json.js";
import { readConfigSettings } from "../../lib/config/status-reader.js";
import { RepositoryGitCommonStatePublisher } from "../../lib/git-common-state.js";
import type { GitExec } from "../../lib/git/index.js";
import { createRawGitExec } from "../../lib/io-context.js";
import {
  candidateReviewResponses,
  parseCandidateManagedRecord,
} from "../../lib/work-unit/candidate-attestation.js";
import {
  readCandidateRecord,
  resolveCandidateRecordRelativePath,
} from "../../lib/work-unit/candidate-record-store.js";
import { projectGitCandidateEffectiveTarget } from "../../lib/work-unit/git-candidate-effective-target.js";
import type { ApprovedDispositionRecord } from "../review-gate/core/advisory-records.js";
import type { ReviewTarget } from "../review-gate/core/gate-contract-v2-schema.js";
import { createFixAuthorization } from "../review-gate/core/fix-authorization.js";
import { frontlineResponseBindingMatchesTarget } from "../review-gate/core/frontline-response-binding.js";
import { parseReviewSourceReference } from "../review-gate/core/review-source-reference.js";
import { LocalApprovedDispositionRecordStore } from "../review-gate/hosts/local/disposition-record-store.js";
import { LocalFrontlineOutcomeStore } from "../review-gate/hosts/local/frontline-outcome-store.js";
import { LocalReviewOperationStateStore } from "../review-gate/hosts/local/operation-state-store.js";
import { computeFrontlineSourceBindingId } from "../review-gate/policy/frontline-operation.js";
import {
  composeCandidateResponseConfirmationAction,
  type CandidateResponseConfirmationAction,
} from "./settlement-plan.js";

/**
 * Candidate-span order used for both ordinary and private-response settlement composition.
 *
 * @param input - Git execution context.
 * @param baseRevision - The Candidate's attested base revision.
 * @param approvedHead - The checkpoint's approved head.
 * @returns Candidate revisions indexed oldest-first, with the base at index -1.
 */
export async function readCandidateSpan(
  input: { cwd: string; exec: GitExec },
  baseRevision: string,
  approvedHead: string,
): Promise<Map<string, number>> {
  const { stdout } = await input.exec("git", ["rev-list", `${baseRevision}..${approvedHead}`], {
    cwd: input.cwd,
    objectAccess: "local-only",
  });
  const order = new Map<string, number>();
  order.set(baseRevision, -1);
  stdout.trim().split("\n").filter((line) => line !== "").reverse().forEach((revision, index) => {
    order.set(revision, index);
  });
  return order;
}

async function requireExactTargetObjects(input: { cwd: string; exec: GitExec }, target: ReviewTarget): Promise<void> {
  const expressions = [
    `${target.headSha}^{commit}`,
    `${target.headSha}^{tree}`,
    `${target.diffBaseSha}^{commit}`,
    `${target.diffBaseSha}^{tree}`,
  ];
  const [head, headTree, base, baseTree] = await Promise.all(expressions.map(async (expression) => {
    const { stdout } = await input.exec("git", ["rev-parse", "--verify", expression], {
      cwd: input.cwd,
      objectAccess: "local-only",
    });
    return stdout.trim();
  }));
  if (head !== target.headSha || headTree !== target.headTree
    || base !== target.diffBaseSha || baseTree !== target.diffBaseTree) {
    throw new Error("The private review target no longer resolves to its recorded Git objects.");
  }
}

/**
 * Establish the existing response authority; this never authorizes or applies a new fix.
 *
 * @param input - The approved private disposition and exact Candidate checkpoint.
 * @returns A confirmation action and Candidate order, or null for an ineligible record.
 */
export async function composeCandidateResponseConfirmation(input: {
  cwd: string;
  exec: GitExec;
  workUnit: string;
  approvedHead: string;
  approvedBase: string;
  approved: ApprovedDispositionRecord;
}): Promise<{ action: CandidateResponseConfirmationAction; order: number } | null> {
  const { approved } = input;
  if (approved.source.kind !== "frontline" || approved.candidate === null
    || approved.deliveryMember === null || approved.errand !== null
    || !approved.approvedDisposition.dispositionSet.findings.some(({ disposition }) => disposition === "fix")) {
    return null;
  }
  const dispositionId = approved.approvedDisposition.dispositionSet.dispositionSetId;
  const { stdout: currentHead } = await input.exec("git", ["rev-parse", "HEAD^{commit}"], {
    cwd: input.cwd,
    objectAccess: "local-only",
  });
  if (currentHead.trim() !== input.approvedHead) {
    throw new Error(`The private disposition ${dispositionId} does not bind the current checkout head.`);
  }
  const candidate = await readCandidateRecord(input.cwd, input.workUnit);
  const { stdout: committedCandidateBytes } = await input.exec("git", [
    "show",
    `${input.approvedHead}:${resolveCandidateRecordRelativePath(input.workUnit)}`,
  ], { cwd: input.cwd, objectAccess: "local-only" });
  const committedCandidate = parseCandidateManagedRecord(committedCandidateBytes);
  if (candidate === null || candidate.attestation.workUnit !== input.workUnit
    || committedCandidate === null || canonicalize(candidate) !== canonicalize(committedCandidate)
    || candidate.attestation.candidateId !== approved.candidate.candidateId
    || approved.candidate.workUnit !== input.workUnit) {
    throw new Error(`The private disposition ${dispositionId} lacks its exact Candidate.`);
  }
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const outcomeStore = new LocalFrontlineOutcomeStore(publisher);
  const operationStore = new LocalReviewOperationStateStore(publisher);
  const sourceRef = parseReviewSourceReference(approved.source.outcomeRef, "frontline");
  if (sourceRef.operationId !== approved.operationId) {
    throw new Error(`The private disposition ${dispositionId} moved frontline operation.`);
  }
  const [{ record: outcome, outcomeRef }, { state }] = await Promise.all([
    outcomeStore.readOutcome(approved.operationId),
    operationStore.readOperation(approved.operationId),
  ]);
  const binding = outcome?.responseBinding;
  if (outcome === null || outcomeRef !== sourceRef.durableRef || binding === undefined
    || outcome.outcome.outcome !== "findings"
    || outcome.repositoryId !== approved.repositoryId
    || state === null || state.kind !== "frontline-run"
    || state.operationId !== approved.operationId
    || state.targetId !== outcome.outcome.target.targetId
    || state.sourceIdentity !== outcome.sourceIdentity
    || state.outcome !== outcome.outcome.outcome
    || state.passCount !== outcome.outcome.pass
    || state.sourceBindingId !== computeFrontlineSourceBindingId(outcome.outcome.source, binding)
    || canonicalize(state.responseBinding ?? null) !== canonicalize(binding)) {
    throw new Error(`The private disposition ${dispositionId} lacks its exact frontline source.`);
  }
  const origin = outcome.outcome.target;
  await Promise.all([
    requireExactTargetObjects(input, origin),
    requireExactTargetObjects(input, binding.candidate.target),
  ]);
  if (!frontlineResponseBindingMatchesTarget(origin, binding)
    || canonicalize(binding.deliveryMember) !== canonicalize(approved.deliveryMember)
    || binding.candidate.workUnit !== input.workUnit
    || binding.candidate.candidateId !== candidate.attestation.candidateId
    || origin.targetId !== approved.approvedDisposition.dispositionSet.targetId
    || approved.fixAuthorization === null
    || canonicalize(approved.fixAuthorization) !== canonicalize(createFixAuthorization({
      dispositionState: approved.approvedDisposition,
      oldTarget: origin,
    }))) {
    throw new Error(`The private disposition ${dispositionId} conflicts with its approved source.`);
  }
  const responses = candidateReviewResponses(candidate).filter((response) =>
    response.dispositionId === dispositionId);
  const response = responses[0];
  if (responses.length !== 1 || response === undefined
    || response.candidateId !== candidate.attestation.candidateId
    || response.oldTarget.revision !== binding.candidate.target.headSha
    || response.approvedBy !== approved.approvedDisposition.approval.approvedBy
    || response.appliedBy !== approved.approvedDisposition.dispositionSet.proposedBy) {
    throw new Error(`The private disposition ${dispositionId} lacks one matching Candidate response.`);
  }
  const span = await readCandidateSpan(input, candidate.attestation.baseRevision, input.approvedHead);
  const order = span.get(binding.candidate.target.headSha);
  const responseOrder = span.get(response.newTarget.revision);
  if (span.has(origin.headSha) || order === undefined || responseOrder === undefined || responseOrder <= order) {
    throw new Error(`The private disposition ${dispositionId} lacks Candidate-span continuation.`);
  }
  const baseBranch = (await readConfigSettings(input.cwd)).settings["branch.base"];
  const effective = await projectGitCandidateEffectiveTarget({
    cwd: input.cwd,
    name: input.workUnit,
    baseBranch,
    record: candidate,
    exec: input.exec,
    rawExec: createRawGitExec(input.cwd),
    target: { revision: input.approvedHead, currentBase: input.approvedBase },
  });
  if (effective.state !== "current" || effective.recognizedTarget.revision !== input.approvedHead) {
    throw new Error(`The private disposition ${dispositionId} has no current Candidate continuation.`);
  }
  return {
    order,
    action: composeCandidateResponseConfirmationAction({
      dispositionId,
      operationId: approved.operationId,
      workUnit: approved.candidate.workUnit,
      candidateId: candidate.attestation.candidateId,
      responseId: response.responseId,
      memberTargetId: origin.targetId,
      candidateOriginTargetId: binding.candidate.target.targetId,
      deliveryMember: binding.deliveryMember,
      approvedBase: input.approvedBase,
    }),
  };
}

/**
 * Recompute the pinned proof before terminal merge; changed or missing evidence invalidates it.
 *
 * @param input - The checkpoint context and previously composed confirmation action.
 * @returns Confirmation only while the exact approved evidence is still current.
 */
export async function confirmCandidateResponseAction(input: {
  cwd: string;
  exec: GitExec;
  workUnit: string;
  approvedHead: string;
  action: CandidateResponseConfirmationAction;
}): Promise<{ state: "confirmed" } | { state: "invalidated"; reason: "missing" | "stale" | "ambiguous" }> {
  if (input.action.workUnit !== input.workUnit) return { state: "invalidated", reason: "stale" };
  try {
    const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
    const index = new LocalApprovedDispositionRecordStore(publisher);
    const [approved, enumerated] = await Promise.all([
      index.readDispositionRecord(input.action.operationId),
      index.listDispositionRecords(),
    ]);
    if (approved === null) return { state: "invalidated", reason: "missing" };
    const matching = enumerated.filter((record) => record.candidate?.workUnit === input.workUnit
      && record.candidate.candidateId === input.action.candidateId
      && record.approvedDisposition.dispositionSet.dispositionSetId === input.action.dispositionId);
    if (matching.length !== 1 || matching[0]?.operationId !== input.action.operationId) {
      return { state: "invalidated", reason: "ambiguous" };
    }
    const recomposed = await composeCandidateResponseConfirmation({
      ...input,
      approvedBase: input.action.approvedBase,
      approved,
    });
    return recomposed !== null && canonicalize(recomposed.action) === canonicalize(input.action)
      ? { state: "confirmed" }
      : { state: "invalidated", reason: "stale" };
  } catch {
    return { state: "invalidated", reason: "ambiguous" };
  }
}
