/** Work-unit and Errand readiness over current operational records and repository-qualified branch links. */
import { deserializeTransientIdentityRecord } from "../../lib/errand/identity-record.js";
import { SlugSchema } from "../../lib/kernel/index.js";
import { storeRemedyText } from "../../lib/store/native-refusal.js";
import type { StoreRefusal } from "../../lib/store/refusal.js";
import type { ReviewReadinessFact, ReviewReadinessRequest } from "./readiness-contract.js";
import type { Store } from "../../lib/store/contract.js";
import { sameOwner, sameReference, type OwnerIdentity, type RecordReference } from "../../lib/store/identity.js";
import type { StoreRecord } from "../../lib/store/read.js";
import { readWorkUnit, readLifecycleMetaFields, workUnitMetaPath } from "../../lib/store/lifecycle-write.js";
import { selectWorkBranchLink, workBranchName } from "../../lib/store/lifecycle-branch.js";
import { lifecycleArtifactFacts } from "./readiness-artifact-facts.js";
import { listLifecycleIndex, type LifecycleEntry } from "../../lib/store/lifecycle-index.js";
import { storedCohortReadinessFacts } from "./readiness-store-cohort.js";
import { describeRecordConflicts } from "../../lib/store/conflict-diagnostics.js";

type WorkUnitRequest = Omit<ReviewReadinessRequest, "vehicle"> & {
  vehicle: Extract<ReviewReadinessRequest["vehicle"], { kind: "work-unit" }>;
};
type ErrandRequest = Omit<ReviewReadinessRequest, "vehicle"> & {
  vehicle: Extract<ReviewReadinessRequest["vehicle"], { kind: "errand" }>;
};

function fact(code: string, path: string, message: string): ReviewReadinessFact { return { code, path, message }; }

/** Operational authority carried into native lifecycle readiness. */
export interface StoredReadinessAuthority {
  store: Store;
  projectId: () => Promise<string>;
  workItem?: OwnerIdentity;
  errand?: { claimId: string; branch: string };
}

/** Read lifecycle readiness from the selected store without consulting projected metadata. */
export async function evaluateStoredWorkUnitReadiness(request: WorkUnitRequest, authority: StoredReadinessAuthority): Promise<ReviewReadinessFact[]> {
  const { store, workItem } = authority, { slug } = request.vehicle, subject = `work-item/meta:${slug}`;
  if (workItem !== undefined && (workItem.type !== "work-item" || workItem.uid === undefined)) {
    return [workUnitOwnerMismatch(subject, slug, workItem)];
  }
  const selected = await readWorkUnit(store, slug, workItem);
  if (selected.status === "refused") return [refusedFact(store, selected.refusal, subject)];
  if (workItem !== undefined && (selected.result.reference.kind !== "work-item/meta"
    || !sameOwner(selected.result.reference.owner, workItem) || selected.result.reference.owner.name !== slug)) {
    return [workUnitOwnerMismatch(subject, slug, selected.result.reference.owner)];
  }
  // A planned meta's projected path reads its fields, so unreadable fields are reported under the record itself.
  const record = selected.result, fields = readLifecycleMetaFields(record);
  if (fields.status === "refused") return [fact("malformed-artifact", `work-item/meta:${request.vehicle.slug}`,
    `${fields.refusal.condition} ${fields.refusal.remedy.text}`)];
  const path = await workUnitMetaPath(request.treeRoot, record);
  if (record.conflicts.length > 0) {
    return [fact("malformed-artifact", path, `The stored work-unit metadata has unresolved conflicts.${describeRecordConflicts(record.conflicts)}`)];
  }
  const manual = request.vehicle.archiveCadence === "manual";
  const position = storedPositionFacts(record, fields.result.state, manual, path);
  if (position.length > 0) return position;
  const facts = lifecycleArtifactFacts(record.content, path);
  facts.push(...await storedLinkFacts(request, record, authority.projectId));
  if (!manual) {
    const inventory = await readStoredLifecycleInventory(store);
    facts.push(...inventory.facts);
    if (facts.length === 0) facts.push(...await storedCohortReadinessFacts(store, inventory.entries, fields.result.cohort));
  }
  return facts;
}

function workUnitOwnerMismatch(path: string, slug: string, owner: OwnerIdentity): ReviewReadinessFact {
  return fact("malformed-artifact", path, `The bound owner ${JSON.stringify(owner)} does not identify work-unit metadata for \`${slug}\`. Select the intended work unit and recompose the request or checkpoint, then retry.`);
}

/** Match a live pull request with the current Errand selected by claim or project branch. */
export async function evaluateStoredErrandReadiness(request: ErrandRequest, authority: StoredReadinessAuthority): Promise<ReviewReadinessFact[]> {
  const { store, errand } = authority, slug = SlugSchema.parse(request.vehicle.slug);
  const path = `work-item/record:${slug}`, branch = workBranchName(request.pullRequest.headBranch);
  const repository = await authority.projectId();
  const found = errand === undefined ? await store.lookup({ kind: "ref", repository, ref: branch })
    : await store.lookup({ kind: "claim", claim: { kind: "errand", slug, claimId: errand.claimId } });
  if (found.status === "refused") {
    if (errand === undefined && found.refusal.code === "not-found") {
      return [errandBranchMismatch(`No stored record in project ${repository} links pull-request branch "${branch}".`)];
    }
    return [refusedFact(store, found.refusal, path)];
  }
  const read = await store.read({ reference: found.result.reference });
  if (read.status === "refused") return [refusedFact(store, read.refusal, path)];
  const record = read.result;
  const recordFacts = errandRecordFacts(record, found.result.reference, slug, path, errand);
  if (recordFacts.length > 0) return recordFacts;
  const linked = selectWorkBranchLink(record, { repository });
  if (errand !== undefined && workBranchName(errand.branch) !== branch) {
    return [fact("vehicle-branch-mismatch", "pullRequest.headBranch",
      `The pull request now names "${branch}" and the approved Errand names "${errand.branch}". Recompose the request for the current pull request and obtain approval.`)];
  }
  if (linked.kind === "linked" && workBranchName(linked.link.ref) === branch) return [];
  const detail = linked.kind === "ambiguous" ? linked.reason : linked.kind === "linked"
    ? `The Errand links "${linked.link.ref}" in project ${repository} and the pull request names "${branch}".`
    : `The Errand has no branch link in project ${repository} for pull-request branch "${branch}".`;
  return [errandBranchMismatch(detail)];
}

function errandRecordFacts(record: StoreRecord, selected: RecordReference, slug: string, path: string,
  errand: StoredReadinessAuthority["errand"]): ReviewReadinessFact[] {
  const { reference, placement } = record;
  if (reference.kind !== "work-item/record" || !sameReference(reference, selected)
    || reference.owner.name !== slug || placement?.kind !== "active") {
    return [fact("malformed-artifact", path, `The selected ${placement?.kind ?? "unplaced"} ${reference.kind} for \`${reference.owner.name}\` is not the active Errand \`${slug}\`. Run \`arc status --json\` and use the current vehicle for this branch.`)];
  }
  const conflictFacts = record.conflicts.length === 0 ? [] : [
    fact("errand-record-conflict", path, `The stored Errand has unresolved conflicts.${describeRecordConflicts(record.conflicts)}`),
  ];
  const decoded = deserializeTransientIdentityRecord(record.content, slug);
  if (decoded.kind !== "valid" || decoded.record.kind !== "errand" || decoded.record.purpose !== "errand") {
    return [fact("malformed-artifact", path, `The active record does not encode an ordinary Errand named \`${slug}\`. Restore its valid identity from authoritative state, then retry.`), ...conflictFacts];
  }
  if (decoded.record.owner === undefined) {
    return [fact("malformed-artifact", path, `The active Errand \`${slug}\` has no owner. Restore its owner from authoritative state, then retry.`), ...conflictFacts];
  }
  if (errand !== undefined && (decoded.record.claimId !== errand.claimId || decoded.record.branch !== errand.branch)) {
    return [fact("malformed-artifact", path, `The Errand records claim ${decoded.record.claimId} on \`${decoded.record.branch}\`, which differs from the approved claim or branch. Recompose the request for the current Errand and obtain approval.`), ...conflictFacts];
  }
  return conflictFacts;
}

function errandBranchMismatch(detail: string): ReviewReadinessFact {
  return fact("errand-branch-mismatch", "pullRequest.headBranch", `${detail} Correct the Errand's project branch link, then retry.`);
}

function refusedFact(store: Store, refusal: StoreRefusal, path: string): ReviewReadinessFact {
  const code = refusal.code === "not-found" ? "missing-artifact" : refusal.code === "record-malformed" ? "malformed-artifact"
    : "unreadable-artifact";
  return fact(code, path, `${refusal.condition} ${storeRemedyText(store, refusal.remedy)}`);
}

function storedPositionFacts(record: StoreRecord, state: string | null, manual: boolean, path: string): ReviewReadinessFact[] {
  if (state === (manual ? "Integrating" : "Shipped") && record.placement?.kind === (manual ? "active" : "completed")) return [];
  return [fact("wrong-cadence", path, manual ? "Manual cadence requires an active Integrating work unit."
    : "With-integration cadence requires a completed Shipped work unit.")];
}

async function storedLinkFacts(request: WorkUnitRequest, record: StoreRecord, projectId: () => Promise<string>): Promise<ReviewReadinessFact[]> {
  const facts: ReviewReadinessFact[] = [];
  const repository = await projectId();
  const branch = selectWorkBranchLink(record, { repository });
  if (branch.kind !== "linked" || workBranchName(branch.link.ref) !== workBranchName(request.pullRequest.headBranch)) {
    facts.push(fact("vehicle-branch-mismatch", "pullRequest.headBranch", branch.kind === "ambiguous" ? branch.reason
      : "The pull-request head branch does not match the work unit's linked work branch."));
  }
  const changeRequest = record.links?.changeRequest;
  if (request.vehicle.archiveCadence !== "manual" && changeRequest !== undefined
    && (changeRequest.repository !== repository || changeRequest.number !== request.target.pullRequest)) {
    facts.push(fact("pr-url-mismatch", await workUnitMetaPath(request.treeRoot, record), "The stored change-request link does not name the guarded pull request."));
  }
  return facts;
}

async function readStoredLifecycleInventory(store: Store): Promise<{ entries: readonly LifecycleEntry[]; facts: ReviewReadinessFact[] }> {
  const result = await listLifecycleIndex(store), path = "work-item/meta";
  if (result.status === "refused") {
    return { entries: [], facts: [fact("unreadable-artifact", path, `${result.refusal.condition} ${storeRemedyText(store, result.refusal.remedy)}`)] };
  }
  const listed = result.result;
  if (listed.status === "unreadable") return { entries: [], facts: [fact("unreadable-artifact", path, `${listed.condition} ${storeRemedyText(store, listed.remedy)}`)] };
  if (listed.status === "absent") return { entries: [], facts: [] };
  const facts = listed.diagnostics.map(diagnostic => fact("malformed-artifact", diagnostic.key,
    `${diagnostic.condition} ${storeRemedyText(store, diagnostic.remedy)}`));
  if (listed.missed) {
    facts.push(fact("unreadable-artifact", path, "The lifecycle inventory missed records. Repair the work-unit inventory, then retry."));
  }
  return { entries: listed.index.entries(), facts };
}
