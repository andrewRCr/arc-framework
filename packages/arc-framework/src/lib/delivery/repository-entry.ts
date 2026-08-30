/** Repository-backed adapter for read-only delivery-entry inspection. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { RepositoryGitCommonStatePublisher } from "../git-common-state.js";
import type { GitExec } from "../git/exec.js";
import { createRawGitExec } from "../io-context.js";
import { readSubmissionBoundary } from "../work-unit/submission-boundary-store.js";
import { RepositoryDeliveryAuthoringStore } from "./authoring-store.js";
import { resolveExistingDeliveryAuthoringMap } from "./authoring-resolution.js";
import {
  inspectDeliveryEntry,
  type DeliveryEntryInspectionRequest,
  type DeliveryEntryInspectionResult,
} from "./entry-inspection.js";
import {
  RepositoryDeliveryPlanStore,
  RepositoryDeliveryStateStore,
} from "./local-stores.js";
import { DeliveryPlanV1Codec } from "./plan.js";
import {
  GitDeliveryRenameTransitionSource,
  resolveExistingDeliveryPlan,
} from "./plan-resolution.js";

/** Inspect one exact work unit through repository-backed read-only delivery stores. */
export async function inspectRepositoryDeliveryEntry(input: {
  readonly cwd: string;
  /** Validated repository-relative task-list path. */
  readonly taskListPath: string;
  readonly request: DeliveryEntryInspectionRequest;
  readonly baseBranch: string;
  readonly exec: GitExec;
}): Promise<DeliveryEntryInspectionResult> {
  const workUnitId = input.request.workUnitId;
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const planStore = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
  const stateStore = new RepositoryDeliveryStateStore(publisher);
  const authoringStore = new RepositoryDeliveryAuthoringStore(publisher);
  const transitionSource = new GitDeliveryRenameTransitionSource(createRawGitExec(input.cwd));
  const base = input.baseBranch.trim();
  const authority = base === ""
    ? { status: "unestablished" as const }
    : { status: "established" as const, ref: `refs/heads/${base}` };

  return inspectDeliveryEntry(input.request, {
    readTaskList: () => readFile(join(input.cwd, input.taskListPath), "utf8"),
    resolvePlan: async () => {
      const result = await resolveExistingDeliveryPlan({
        planStore: { enumerateCurrent: () => planStore.enumerateCurrentReadOnly() },
        currentWorkUnitId: workUnitId,
        planWorkUnitId: (plan) => plan.workUnitId,
        authority,
        transitionSource,
      });
      return result.status === "match" ? result : { status: result.status };
    },
    resolveAuthoring: async () => {
      const result = await resolveExistingDeliveryAuthoringMap({
        store: { enumerate: () => authoringStore.enumerateReadOnly() },
        currentWorkUnitId: workUnitId,
        authority,
        transitionSource,
      });
      return result.status === "match"
        ? {
            status: "match",
            mapId: result.record.snapshot.mapId,
            candidatePlanDigest: result.record.snapshot.candidatePlanDigest,
          }
        : { status: result.status };
    },
    readState: async (planId) => {
      const result = await stateStore.read(planId);
      return result.status === "refused"
        ? { status: "refused" }
        : result.value === null
          ? { status: "ok", value: null, revision: null }
          : { status: "ok", value: result.value.value, revision: result.value.revision };
    },
    readIntegrationBoundary: async () => ({
      status: "ok",
      value: await readSubmissionBoundary(input.cwd, workUnitId),
    }),
  });
}
