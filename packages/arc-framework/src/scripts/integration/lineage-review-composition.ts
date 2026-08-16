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

/** The settlement actions one lineage composes, with the approved sets they were built from. */
export interface LineageReviewComposition {
  dispositionIds: string[];
  actions: SettlementAction[];
}

/**
 * Bind the durable review records one Candidate lineage points at to its settlement plan.
 *
 * The lineage records which approved set each response settled, not the operation that produced it,
 * so the approved records are reached by identity and the originating target is read back from the
 * lane that owns it. Anything the lineage names but the repository cannot produce refuses rather
 * than composing a partial plan: a plan missing an action would settle less than approval covered.
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

  const originTarget = async (record: ApprovedDispositionRecord): Promise<ReviewTarget> => {
    const resolved = await (record.source.kind === "attested-local"
      ? operationStore.readOperation(record.operationId).then(({ state }) => (
          state !== null && state.kind === "local-review" ? state.target : null
        ))
      : outcomeStore.readOutcome(record.operationId).then(({ record: outcome }) => (
          outcome?.outcome.target ?? null
        )));
    if (resolved === null) {
      throw new Error(`The review operation behind approved dispositions ${record.operationId} is unavailable.`);
    }
    if (resolved.targetId !== record.approvedDisposition.dispositionSet.targetId) {
      throw new Error(`The review operation behind approved dispositions ${record.operationId} moved target.`);
    }
    return resolved;
  };

  // Every approved fix in the lineage settles at the head the checkpoint approves, so one derivation
  // of the current change set serves the whole plan — and refusing a head that is not the approved
  // one keeps composition bound to the exact revision the reducer validated.
  const settledFixTarget = async (approvedHead: string): Promise<ReviewTarget> => {
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
    const dispositionIds = [...new Set(record.responses.map(({ dispositionId }) => dispositionId))];
    if (dispositionIds.length === 0) return { dispositionIds, actions: [] };

    const indexed = new Map((await dispositionIndex.listDispositionRecords()).map(
      (approved) => [approved.approvedDisposition.dispositionSet.dispositionSetId, approved],
    ));
    const approvedRecords = dispositionIds.map((dispositionId) => {
      const approved = indexed.get(dispositionId);
      if (approved === undefined) {
        throw new Error(`The approved disposition record ${dispositionId} is unavailable.`);
      }
      return approved;
    });
    const fixTarget = await settledFixTarget(approvedHead);
    const actions = await Promise.all(approvedRecords.map(async (approved) => {
      const dispositions = approved.approvedDisposition;
      const hasFix = dispositions.dispositionSet.findings.some(({ disposition }) => disposition === "fix");
      return composeReviewResponseSettlementAction({
        originTarget: await originTarget(approved),
        fixTarget: hasFix ? fixTarget : null,
        request: {
          schemaVersion: 1,
          source: approved.source.kind === "attested-local"
            ? { kind: "attested-local", receiptRef: approved.source.receiptRef }
            : { kind: "frontline", outcomeRef: approved.source.outcomeRef },
          dispositions,
        },
      });
    }));
    return { dispositionIds, actions };
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
