/** Settlement plan composed from one Candidate lineage's approved responses. */

import { readConfigSettings } from "../../lib/config/status-reader.js";
import { RepositoryGitCommonStatePublisher } from "../../lib/git-common-state.js";
import type { GitExec } from "../../lib/git/index.js";
import { createRawGitExec } from "../../lib/io-context.js";
import { readCandidateRecord } from "../../lib/work-unit/candidate-record-store.js";
import { candidateReviewResponses } from "../../lib/work-unit/candidate-attestation.js";
import {
  projectGitCandidateEffectiveTarget,
} from "../../lib/work-unit/git-candidate-effective-target.js";
import {
  currentApprovedDispositionNode,
  type ApprovedDispositionRecord,
} from "../review-gate/core/advisory-records.js";
import type { ReviewTarget } from "../review-gate/core/gate-contract-v2-schema.js";
import { composeReviewResponseSettlementAction } from "../review-gate/core/response-plan.js";
import { parseReviewSourceReference } from "../review-gate/core/review-source-reference.js";
import {
  LocalApprovedDispositionRecordStore,
} from "../review-gate/hosts/local/disposition-record-store.js";
import { LocalFrontlineOutcomeStore } from "../review-gate/hosts/local/frontline-outcome-store.js";
import { resolveRepositoryIdentity } from "../review-gate/hosts/local/git-common-state.js";
import {
  LocalReviewOperationStateStore,
} from "../review-gate/hosts/local/operation-state-store.js";
import { deriveLocalReviewTarget } from "../review-gate/hosts/local/repository-target.js";
import {
  composeCandidateResponseConfirmation,
  readCandidateSpan,
} from "./candidate-response-confirmation.js";
import type { CandidateResponseConfirmationAction } from "./settlement-plan.js";
import type { SettlementAction } from "./settlement-plan.js";

/** The settlement actions one Candidate span composes, with the approved sets they were built from. */
export interface LineageReviewComposition {
  dispositionIds: string[];
  actions: SettlementAction[];
}

async function resolveApprovedOriginTarget(
  record: ApprovedDispositionRecord,
  required: boolean,
  operationStore: LocalReviewOperationStateStore,
  outcomeStore: LocalFrontlineOutcomeStore,
): Promise<ReviewTarget | null> {
  let resolved: ReviewTarget | null;
  if (record.source.kind === "attested-local") {
    const { state } = await operationStore.readOperation(record.operationId);
    resolved = state !== null && state.kind === "local-review" ? state.target : null;
  } else if (record.source.kind === "frontline") {
    const { record: outcome } = await outcomeStore.readOutcome(record.operationId);
    resolved = outcome?.outcome.target ?? null;
  } else {
    const reference = parseReviewSourceReference(record.source.attemptRef, "hosted");
    if (reference.durableRef !== record.operationId) {
      throw new Error("The hosted review source reference moved attempt.");
    }
    const { state } = await operationStore.readOperation(reference.operationId);
    const attempt = state !== null && state.kind === "lane-progress"
      ? state.attempts.find(({ attemptId }) => attemptId === reference.durableRef)
      : undefined;
    resolved = attempt?.hosted?.reviewTarget ?? null;
  }
  if (resolved === null) {
    if (!required) return null;
    throw new Error(`The review operation behind approved dispositions ${record.operationId} is unavailable.`);
  }
  if (resolved.targetId
    !== currentApprovedDispositionNode(record).approvedDisposition.dispositionSet.targetId) {
    if (!required) return null;
    throw new Error(`The review operation behind approved dispositions ${record.operationId} moved target.`);
  }
  return resolved;
}

async function deriveApprovedSettledTarget(
  input: { cwd: string; exec: GitExec },
  publisher: RepositoryGitCommonStatePublisher,
  approvedHead: string,
): Promise<ReviewTarget> {
  const { settings } = await readConfigSettings(input.cwd);
  const target = await deriveLocalReviewTarget({
    exec: input.exec,
    cwd: input.cwd,
    baseRef: settings["branch.base"],
    repositoryId: await resolveRepositoryIdentity(publisher),
  });
  if (target.headSha !== approvedHead) {
    throw new Error("The current change set does not bind the approved head.");
  }
  return target;
}

function composeApprovedSettlementAction(input: {
  approved: ApprovedDispositionRecord;
  origin: ReviewTarget;
  privateAction: CandidateResponseConfirmationAction | null;
  fixTarget: ReviewTarget;
}): SettlementAction {
  if (input.privateAction !== null) return input.privateAction;
  const current = currentApprovedDispositionNode(input.approved);
  if (current.policyProjectionPending === true) {
    throw new Error(
      `The approved response ${input.approved.currentDispositionSetId} still needs policy projection; replay its approved review response before checkpointing.`,
    );
  }
  const dispositions = current.approvedDisposition;
  const hasFix = dispositions.dispositionSet.findings.some(({ disposition }) => disposition === "fix");
  return composeReviewResponseSettlementAction({
    originTarget: input.origin,
    fixTarget: !hasFix && input.origin.kind === "delivery-member" ? input.origin : input.fixTarget,
    request: {
      schemaVersion: 1,
      source: input.approved.source.kind === "attested-local"
        ? { kind: "attested-local", receiptRef: input.approved.source.receiptRef }
        : input.approved.source.kind === "frontline"
          ? { kind: "frontline", outcomeRef: input.approved.source.outcomeRef }
          : { kind: "hosted", attemptRef: input.approved.source.attemptRef },
      policyRequest: current.responsePolicyRequest,
      dispositions,
    },
  });
}

/**
 * Compose the settlement plan from every approved disposition record the Candidate covers.
 *
 * The plan answers which approved responses still need exact-target replay. Record-only and fix-bearing
 * dispositions both enter the post-approval plan: approval is durable before checkpointing, while replay
 * performs the channel settlement the approved record authorizes. Records are enumerated and scoped to the
 * **full Candidate span** — `attestation.baseRevision..approvedHead`,
 * not the candidate-tail span, whose lower bound advances past a review that ran before a fix landed.
 *
 * Records the lineage names are still resolved strictly: anything it names but the repository cannot
 * produce refuses rather than composing a partial plan, because a plan missing an action would settle
 * less than approval covered. The disposition store is repository-common, so broad enumeration omits
 * malformed records and also returns other work units' readable records. Candidate-named malformed
 * records remain unavailable at the completeness check below, while a readable record whose originating
 * operation is unavailable cannot be placed in any span and is left out when it is unrelated.
 *
 * @param input - The repository root and its Git boundary.
 * @returns A composer memoized per work unit, approved head, and checkpoint-validated base.
 */
export function createLineageReviewComposer(input: {
  cwd: string;
  exec: GitExec;
}): (
  workUnit: string,
  approvedHead: string,
  approvedBase: string,
) => Promise<LineageReviewComposition> {
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const dispositionIndex = new LocalApprovedDispositionRecordStore(publisher);
  const operationStore = new LocalReviewOperationStateStore(publisher);
  const outcomeStore = new LocalFrontlineOutcomeStore(publisher);
  const compositions = new Map<string, Promise<LineageReviewComposition>>();

  const compose = async (
    workUnit: string,
    approvedHead: string,
    approvedBase: string,
  ): Promise<LineageReviewComposition> => {
    const record = await readCandidateRecord(input.cwd, workUnit);
    if (record === null) {
      throw new Error("The managed Candidate record disappeared during checkpoint composition.");
    }
    const baseBranch = (await readConfigSettings(input.cwd)).settings["branch.base"];
    const effective = await projectGitCandidateEffectiveTarget({
      cwd: input.cwd,
      name: workUnit,
      baseBranch,
      record,
      exec: input.exec,
      rawExec: createRawGitExec(input.cwd),
      target: { revision: approvedHead, currentBase: approvedBase },
    });
    if (effective.state !== "current" || effective.recognizedTarget.revision !== approvedHead) {
      throw new Error("The approved head is not a current Candidate subject.");
    }
    const named = new Set(candidateReviewResponses(record).map(({ dispositionId }) => dispositionId));
    const [span, enumerated] = await Promise.all([
      readCandidateSpan(input, record.attestation.baseRevision, approvedHead),
      dispositionIndex.listDispositionRecords(),
    ]);

    const covered = new Map<string, {
      approved: ApprovedDispositionRecord;
      origin: ReviewTarget;
      order: number;
      privateAction: CandidateResponseConfirmationAction | null;
    }>();
    for (const approved of enumerated) {
      const dispositionId = approved.currentDispositionSetId;
      const required = approved.candidate !== null
        && approved.candidate.workUnit === workUnit
        && approved.candidate.candidateId === record.attestation.candidateId;
      if (!required) continue;
      const origin = await resolveApprovedOriginTarget(approved, required, operationStore, outcomeStore);
      if (origin === null) {
        throw new Error(`The approved disposition record ${dispositionId} is outside the Candidate span.`);
      }
      const ordinaryOrder = span.get(origin.headSha);
      const privateProof = ordinaryOrder === undefined
        ? await composeCandidateResponseConfirmation({
            ...input,
            workUnit,
            approvedHead,
            approvedBase,
            approved,
          })
        : null;
      const order = ordinaryOrder ?? privateProof?.order;
      if (order === undefined) {
        throw new Error(`The approved disposition record ${dispositionId} is outside the Candidate span.`);
      }
      if (covered.has(dispositionId)) {
        throw new Error(`The approved disposition record ${dispositionId} has ambiguous Candidate origins.`);
      }
      covered.set(dispositionId, {
        approved,
        origin,
        order,
        privateAction: privateProof?.action ?? null,
      });
    }
    for (const dispositionId of named) {
      if (!covered.has(dispositionId)) {
        throw new Error(`The approved disposition record ${dispositionId} is unavailable.`);
      }
    }
    if (covered.size === 0) return { dispositionIds: [], actions: [] };

    // Lineage order no longer supplies a composition order, so span position — tiebroken by the
    // disposition identity — supplies one that two runs at the same head reproduce exactly.
    const scoped = [...covered].sort(([leftId, left], [rightId, right]) => (
      left.order - right.order || leftId.localeCompare(rightId)
    ));
    // Fix-bearing responses settle at the approved head. A no-fix member response keeps its
    // exact origin target, which the action helper selects before constructing settlement.
    const fixTarget = await deriveApprovedSettledTarget(input, publisher, approvedHead);
    const actions = scoped.map(([, { approved, origin, privateAction }]) =>
      composeApprovedSettlementAction({ approved, origin, privateAction, fixTarget }));
    return { dispositionIds: scoped.map(([dispositionId]) => dispositionId), actions };
  };

  return (workUnit, approvedHead, approvedBase) => {
    const key = `${workUnit} ${approvedHead} ${approvedBase}`;
    let value = compositions.get(key);
    if (value === undefined) {
      value = compose(workUnit, approvedHead, approvedBase);
      compositions.set(key, value);
    }
    return value;
  };
}
