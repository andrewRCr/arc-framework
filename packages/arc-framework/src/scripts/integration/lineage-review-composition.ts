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
import type { ApprovedDispositionRecord } from "../review-gate/core/advisory-records.js";
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
import type { SettlementAction } from "./settlement-plan.js";

/** The settlement actions one Candidate span composes, with the approved sets they were built from. */
export interface LineageReviewComposition {
  dispositionIds: string[];
  actions: SettlementAction[];
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

  // `required` marks a record the Candidate lineage names: those refuse, while a record enumeration
  // merely surfaced resolves to null so an unrelated work unit's residue cannot block this one.
  const originTarget = async (
    record: ApprovedDispositionRecord,
    required: boolean,
  ): Promise<ReviewTarget | null> => {
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
    if (resolved.targetId !== record.approvedDisposition.dispositionSet.targetId) {
      if (!required) return null;
      throw new Error(`The review operation behind approved dispositions ${record.operationId} moved target.`);
    }
    return resolved;
  };

  // Revisions the Candidate covers, indexed oldest-first so the plan follows the work's own order.
  const candidateSpan = async (baseRevision: string, approvedHead: string): Promise<Map<string, number>> => {
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
  };

  // Every approved response in the lineage settles at the head the checkpoint approves, so one
  // derivation of the current change set serves the whole plan — including sets that authorized no
  // fix and therefore moved no implementation themselves. Refusing a different head keeps
  // composition bound to the exact revision the reducer validated.
  const settledTarget = async (approvedHead: string): Promise<ReviewTarget> => {
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
  };

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
      candidateSpan(record.attestation.baseRevision, approvedHead),
      dispositionIndex.listDispositionRecords(),
    ]);

    const covered = new Map<string, { approved: ApprovedDispositionRecord; origin: ReviewTarget }>();
    for (const approved of enumerated) {
      const dispositionId = approved.approvedDisposition.dispositionSet.dispositionSetId;
      const required = approved.candidate !== null
        && approved.candidate.workUnit === workUnit
        && approved.candidate.candidateId === record.attestation.candidateId;
      if (!required) continue;
      const origin = await originTarget(approved, required);
      if (origin === null || !span.has(origin.headSha)) {
        throw new Error(`The approved disposition record ${dispositionId} is outside the Candidate span.`);
      }
      if (!covered.has(dispositionId)) covered.set(dispositionId, { approved, origin });
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
      (span.get(left.origin.headSha) ?? Number.MAX_SAFE_INTEGER)
        - (span.get(right.origin.headSha) ?? Number.MAX_SAFE_INTEGER)
      || leftId.localeCompare(rightId)
    ));
    const fixTarget = await settledTarget(approvedHead);
    const actions = scoped.map(([, { approved, origin }]) => {
      const dispositions = approved.approvedDisposition;
      return composeReviewResponseSettlementAction({
        originTarget: origin,
        fixTarget,
        request: {
          schemaVersion: 1,
          source: approved.source.kind === "attested-local"
            ? { kind: "attested-local", receiptRef: approved.source.receiptRef }
            : approved.source.kind === "frontline"
              ? { kind: "frontline", outcomeRef: approved.source.outcomeRef }
              : { kind: "hosted", attemptRef: approved.source.attemptRef },
          dispositions,
        },
      });
    });
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
