/** Work-unit readiness over current operational records and repository-qualified branch links. */
import type { ReviewReadinessFact, ReviewReadinessRequest } from "./readiness-contract.js";
import type { Store } from "../../lib/store/contract.js";
import type { StoreRecord } from "../../lib/store/read.js";
import { readWorkUnit, readLifecycleMetaFields, workUnitMetaPath } from "../../lib/store/lifecycle-write.js";
import { selectWorkBranchLink, workBranchName } from "../../lib/store/lifecycle-branch.js";
import { createProjectIdentityReader, ProjectIdentityError, resolveProjectIdentity } from "../../lib/store/project-identity.js";
import { lifecycleArtifactFacts } from "./readiness-artifact-facts.js";
import { listLifecycleIndex, type LifecycleEntry } from "../../lib/store/lifecycle-index.js";
import { storedCohortReadinessFacts } from "./readiness-store-cohort.js";
import { describeRecordConflicts } from "../../lib/store/conflict-diagnostics.js";

type WorkUnitRequest = Omit<ReviewReadinessRequest, "vehicle"> & {
  vehicle: Extract<ReviewReadinessRequest["vehicle"], { kind: "work-unit" }>;
};

function fact(code: string, path: string, message: string): ReviewReadinessFact { return { code, path, message }; }

/** Read lifecycle readiness from the selected store without consulting projected metadata. */
export async function evaluateStoredWorkUnitReadiness(request: WorkUnitRequest, store: Store): Promise<ReviewReadinessFact[]> {
  const selected = await readWorkUnit(store, request.vehicle.slug);
  if (selected.status === "refused") return [fact(selected.refusal.code === "not-found" ? "missing-artifact"
    : selected.refusal.code === "record-malformed" ? "malformed-artifact" : "unreadable-artifact",
  `work-item/meta:${request.vehicle.slug}`, `${selected.refusal.condition} ${selected.refusal.remedy.text}`)];
  // A planned meta's projected path reads its fields, so unreadable fields are reported under the record itself.
  const record = selected.result, fields = readLifecycleMetaFields(record);
  if (fields.status === "refused") return [fact("malformed-artifact", `work-item/meta:${request.vehicle.slug}`,
    `${fields.refusal.condition} ${fields.refusal.remedy.text}`)];
  const path = workUnitMetaPath(record);
  if (record.conflicts.length > 0) {
    return [fact("malformed-artifact", path, `The stored work-unit metadata has unresolved conflicts.${describeRecordConflicts(record.conflicts)}`)];
  }
  const manual = request.vehicle.archiveCadence === "manual";
  const position = storedPositionFacts(record, fields.result.state, manual, path);
  if (position.length > 0) return position;
  const facts = lifecycleArtifactFacts(record.content, path);
  facts.push(...await storedLinkFacts(request, record, store));
  if (!manual) {
    const inventory = await readStoredLifecycleInventory(store);
    facts.push(...inventory.facts);
    if (facts.length === 0) facts.push(...await storedCohortReadinessFacts(store, inventory.entries, fields.result.cohort, request.vehicle.slug));
  }
  return facts;
}

function storedPositionFacts(record: StoreRecord, state: string | null, manual: boolean, path: string): ReviewReadinessFact[] {
  if (state === (manual ? "Integrating" : "Shipped") && record.placement?.kind === (manual ? "active" : "completed")) return [];
  return [fact("wrong-cadence", path, manual ? "Manual cadence requires an active Integrating work unit."
    : "With-integration cadence requires a completed Shipped work unit.")];
}

async function storedLinkFacts(request: WorkUnitRequest, record: StoreRecord, store: Store): Promise<ReviewReadinessFact[]> {
  const facts: ReviewReadinessFact[] = [];
  const project = await resolveProjectIdentity(createProjectIdentityReader(store));
  if (project.status !== "ready") throw new ProjectIdentityError(project);
  const branch = selectWorkBranchLink(record, { repository: project.id });
  if (branch.kind !== "linked" || workBranchName(branch.link.ref) !== workBranchName(request.pullRequest.headBranch)) {
    facts.push(fact("vehicle-branch-mismatch", "pullRequest.headBranch", branch.kind === "ambiguous" ? branch.reason
      : "The pull-request head branch does not match the work unit's linked work branch."));
  }
  const changeRequest = record.links?.changeRequest;
  if (request.vehicle.archiveCadence !== "manual" && changeRequest !== undefined
    && (changeRequest.repository !== project.id || changeRequest.number !== request.target.pullRequest)) {
    facts.push(fact("pr-url-mismatch", workUnitMetaPath(record), "The stored change-request link does not name the guarded pull request."));
  }
  return facts;
}

async function readStoredLifecycleInventory(store: Store): Promise<{ entries: readonly LifecycleEntry[]; facts: ReviewReadinessFact[] }> {
  const result = await listLifecycleIndex(store), path = "work-item/meta";
  if (result.status === "refused") {
    return { entries: [], facts: [fact("unreadable-artifact", path, `${result.refusal.condition} ${result.refusal.remedy.text}`)] };
  }
  const listed = result.result;
  if (listed.status === "unreadable") return { entries: [], facts: [fact("unreadable-artifact", path, `${listed.condition} ${listed.remedy.text}`)] };
  if (listed.status === "absent") return { entries: [], facts: [] };
  const facts = listed.diagnostics.map(diagnostic => fact("malformed-artifact", diagnostic.key,
    `${diagnostic.condition} ${diagnostic.remedy.text}`));
  if (listed.missed) {
    facts.push(fact("unreadable-artifact", path, "The lifecycle inventory missed records. Repair the work-unit inventory, then retry."));
  }
  return { entries: listed.index.entries(), facts };
}
