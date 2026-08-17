/** Settlement plan composed from one Candidate lineage's approved responses. */

import { readConfigSettings } from "../../lib/config/status-reader.js";
import { RepositoryGitCommonStatePublisher } from "../../lib/git-common-state.js";
import type { GitExec } from "../../lib/git/index.js";
import { readCandidateRecord } from "../../lib/work-unit/candidate-record-store.js";
import type { ApprovedDispositionRecord } from "../review-gate/core/advisory-records.js";
import type { ReviewTarget } from "../review-gate/core/gate-contract-v2-schema.js";
import { composeReviewResponseSettlementAction } from "../review-gate/core/response-plan.js";
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
 * The plan answers "which approved dispositions exist", which the Candidate lineage cannot: a set
 * that authorized no fix moves no implementation, so it correctly appends nothing to the lineage and
 * would vanish from a plan indexed off it. Approved records are therefore enumerated and then scoped
 * to the **full Candidate span** — `attestation.baseRevision..approvedHead`, not the candidate-tail
 * span, whose lower bound advances past a review that ran before a fix landed.
 *
 * Records the lineage names are still resolved strictly: anything it names but the repository cannot
 * produce refuses rather than composing a partial plan, because a plan missing an action would settle
 * less than approval covered. The disposition store is repository-common, so enumeration also returns
 * other work units' records; one whose originating operation is unreadable cannot be placed in any
 * span and is left out rather than refusing this work unit's checkpoint.
 *
 * @param input - The repository root and its Git boundary.
 * @returns A composer memoized per work unit and approved head.
 */
export function createLineageReviewComposer(input: {
  cwd: string;
  exec: GitExec;
}): (workUnit: string, approvedHead: string) => Promise<LineageReviewComposition> {
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
    const resolved = await (record.source.kind === "attested-local"
      ? operationStore.readOperation(record.operationId).then(({ state }) => (
          state !== null && state.kind === "local-review" ? state.target : null
        ))
      : outcomeStore.readOutcome(record.operationId).then(({ record: outcome }) => (
          outcome?.outcome.target ?? null
        )));
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

  const compose = async (workUnit: string, approvedHead: string): Promise<LineageReviewComposition> => {
    const record = await readCandidateRecord(input.cwd, workUnit);
    if (record === null) {
      throw new Error("The managed Candidate record disappeared during checkpoint composition.");
    }
    const named = new Set(record.responses.map(({ dispositionId }) => dispositionId));
    const [span, enumerated] = await Promise.all([
      candidateSpan(record.attestation.baseRevision, approvedHead),
      dispositionIndex.listDispositionRecords(),
    ]);

    const covered = new Map<string, { approved: ApprovedDispositionRecord; origin: ReviewTarget }>();
    for (const approved of enumerated) {
      const dispositionId = approved.approvedDisposition.dispositionSet.dispositionSetId;
      const required = named.has(dispositionId);
      const origin = await originTarget(approved, required);
      // A named record settles a response this Candidate already recorded, so it is covered whatever
      // the span read says; everything else is covered only by landing inside the span.
      if (origin === null || !(required || span.has(origin.headSha))) continue;
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
            : { kind: "frontline", outcomeRef: approved.source.outcomeRef },
          dispositions,
        },
      });
    });
    return { dispositionIds: scoped.map(([dispositionId]) => dispositionId), actions };
  };

  return (workUnit, approvedHead) => {
    const key = `${workUnit} ${approvedHead}`;
    let value = compositions.get(key);
    if (value === undefined) {
      value = compose(workUnit, approvedHead);
      compositions.set(key, value);
    }
    return value;
  };
}
