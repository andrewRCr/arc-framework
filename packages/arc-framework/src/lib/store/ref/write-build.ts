/** Prepare record trees over captured tips and publish their commits in one transaction. */

import { BatchCreationReceiptSchema } from "../creation-receipt.js";
import { readObjectFormat } from "./manifest.js";
import { commitRefStep } from "./commit-step.js";
import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import type { BatchInput, BatchResult, WriteResult, RecordObservation } from "../write.js";
import type { StoreResult, StoreRefusal } from "../refusal.js";
import { readBatchObjects, readRefTrees, type BatchObject, type RefTreeEntry } from "./batch-read.js";
import { readRefMetadata, type RefMetadata } from "./metadata.js";
import { refRecordVersion } from "./record-version.js";
import { writeRefBlob } from "./tree-write.js";
import type { RefBackendContext } from "./context.js";
import type { ResolvedBatch, ResolvedMutation, RefWriteTarget } from "./write-resolution.js";
import { refWriteTargets, mutationHome } from "./write-resolution.js";
import { expandStoredPath, holdsNoRecord } from "../stored-path.js";
import type { RecordReference } from "../identity.js";
import { prepareCapturedWrites } from "./write-current.js";
import { checkSerializationRules } from "../serialization.js";
import { checkRefPathCollision, findRefNamespaceCollision, type RefPathNeighbor } from "./path-admission.js";
import { decodeStoredReference } from "./path-decode.js";
import { familyOf } from "../catalog.js";
import { refFormatKey } from "./format-key.js";
import { prepareRefCommits, type RefWriteGroup } from "./write-commits.js";
import { checkRefWrites } from "./write-checks.js";
import { bindProjectMutations } from "./project-identity.js";
import { planRefReopens, reopenRefChanges, type RefReopenPlan } from "./write-reopen.js";
import { archiveRefChanges, type RefArchivePlan } from "./write-archive.js";
import { planRefCloseouts } from "./write-closeouts.js";
import { prepareRefAnchors } from "./write-anchors.js";
import { stampCompletedWrites, refreshCompletedChanges } from "./write-completed.js";
import { refObjectFault } from "./object-fault.js";
import { missingHistoryRefs } from "./missing-history.js";
import { latestFolderPlacement } from "./archive-read.js";
import { withCompletedPlacement } from "./archive-refresh.js";
import { planRefRetirements, sweepRefRetirements, retirementRefChanges, type RefRetirementPlan } from "./write-retirement.js";
import { prepareRefConflicts } from "./write-conflicts.js";
import { proposedRefCreatedOwners } from "./write-creation.js";
import { refAdmissionBasisChanged } from "./write-admission.js";
import { stagePublicationMetadata } from "./write-metadata.js";
import { anchorRefWriteManifest } from "./write-manifest.js";
import { checkRefHistoryDestinations } from "./write-history.js";
import { publishRefBatchChanges } from "./write-publication.js";
import type { PreparedRefMutation } from "./write-merge.js";
import type { RefWriteRetry } from "./write-retry.js";

import { prepareRefRenames } from "./write-rename.js";

type RefGroup = RefWriteGroup;

interface RefWriteProposal {
  context: RefBackendContext; resolved: ResolvedBatch; groups: Map<string, RefGroup>;
  writes: PreparedRefMutation[]; results: WriteResult[];
  reopens: RefReopenPlan[]; archives: RefArchivePlan[]; retirements: RefRetirementPlan[];
  historyMoves: { live: string; history: string }[];
}

/** Inspect exact destinations over a coherent capture without publishing the provisional proposal. */
export async function capturedRefHistoryDestinations(context: RefBackendContext, resolved: ResolvedBatch,
  provenance: BatchInput["provenance"], batchId: string): Promise<ReadonlyMap<string, string | null> | null> {
  const proposal = await prepareRefWriteProposal(context, resolved, provenance, batchId);
  if (proposal === "resolve" || proposal.status === "refused") return null;
  return new Map(proposal.result.historyMoves.map(({ history }) => [history, resolved.tips.get(history) ?? null]));
}

async function prepareRefWriteProposal(context: RefBackendContext, resolved: ResolvedBatch,
  provenance: BatchInput["provenance"], batchId: string): Promise<StoreResult<RefWriteProposal> | "resolve"> {
  const project = await bindLockedProjects(context, resolved);
  if (project.status === "refused") return project;
  resolved = project.result;
  const loaded = await readWriteGroups(context, resolved);
  if (loaded.status === "refused") return loaded;
  const groups = loaded.result;
  if (resolved.writes.some(({ mutation, home, prior }) => /^refs\/arc\/(?:work|cohort)\//u.test(home.ref)
    && groups.get(home.ref)?.metadata.slug !== (prior?.reference.owner.name ?? mutation.reference.owner.name))) return "resolve";
  const prepared = await prepareCapturedWrites(context, resolved, groups, provenance);
  if (prepared.status === "refused") return prepared;
  const refusal = prepareRefRenames(context, resolved, groups) ?? capturedWriteRefusal(context, resolved, groups);
  if (refusal) return { status: "refused", refusal };
  applyResolutions(context, resolved, groups);
  const tips = resolved.tips;
  context = { ...context, blobStage: { format: await readObjectFormat(context), blobs: new Map() } };
  const applied = await applyPreparedMutations(context, prepared.result, groups);
  if (applied.status === "refused") return applied;
  const results = applied.result;
  const anchorRefusal = await prepareRefAnchors(context, prepared.result, groups);
  if (anchorRefusal) return { status: "refused", refusal: anchorRefusal };
  const reopens = await planRefReopens(context, resolved, groups, tips);
  if (reopens.status === "refused") return reopens;
  const archives = await planRefCloseouts(context, resolved, prepared.result, groups, batchId, reopens.result[0]?.quarters);
  if (archives.status === "refused") return archives;
  await stampCompletedWrites(context, resolved, prepared.result, groups, batchId);
  const retirements = await planRefRetirements(context, resolved, refWriteTargets(context, resolved), groups);
  if (retirements.status === "refused") return retirements;
  const historyMoves = [...archives.result.map(({ source, history }) => ({ live: source, history })), ...retirements.result];
  return { status: "ok", result: { context, resolved, groups, writes: prepared.result, results,
    reopens: reopens.result, archives: archives.result, retirements: retirements.result, historyMoves } };
}

/** Land prepared mutations over one captured namespace using expected old ref values. */
export async function commitRefWrites(context: RefBackendContext, resolved: ResolvedBatch,
  provenance: BatchInput["provenance"], batchId: string, observations: readonly RecordObservation[],
  observeHistory: (destinations: ReadonlyMap<string, string | null>) => StoreRefusal | undefined): Promise<StoreResult<BatchResult> | RefWriteRetry | "resolve" | "layout-changed"> {
  const proposal = await prepareRefWriteProposal(context, resolved, provenance, batchId);
  if (proposal === "resolve" || proposal.status === "refused") return proposal;
  const { groups, writes, results, reopens, archives, retirements, historyMoves } = proposal.result;
  context = proposal.result.context;
  resolved = proposal.result.resolved;
  const tips = resolved.tips;
  const destinations = new Map(historyMoves.map(({ history }) => [history, tips.get(history) ?? null]));
  const historyRefusal = await checkRefHistoryDestinations(context, tips, historyMoves);
  if (historyRefusal) return { status: "refused", refusal: historyRefusal };
  const captureRefusal = observeHistory(destinations);
  if (captureRefusal) return { status: "refused", refusal: captureRefusal };
  const completed = await prepareRefConflicts(context, writes, groups, results);
  await stagePublicationMetadata(context, resolved, groups, completed);
  const namespace = finalWriteNamespaceRefusal(context, resolved, groups, completed);
  if (namespace) return { status: "refused", refusal: namespace };
  const step = await commitRefStep(context, async (physical): Promise<StoreResult<BatchResult> | RefWriteRetry> => {
    const admission = await refAdmissionBasisChanged(physical, tips);
    if (admission.size) return { status: "retry", destinations, observed: admission };
    const proposedCreatedOwners = proposedRefCreatedOwners(resolved, writes, completed);
    const broken = await checkRefWrites(physical, writes, completed, tips, provenance, proposedCreatedOwners, observations);
    if (broken) return { status: "refused", refusal: broken };
    const receipt = BatchCreationReceiptSchema.parse({ schemaVersion: 1, batchId, createdOwners: proposedCreatedOwners });
    sweepRefRetirements(retirements, groups, completed);
    const identity = await physical.identity(), actor = identity === null ? undefined : await physical.actor(identity);
    const committed = await prepareRefCommits(physical, writes, refWriteTargets(context, resolved), groups, completed, tips, provenance, batchId, receipt, actor);
    const archived = await archiveRefChanges(physical, committed, archives, groups, completed, writes, tips, provenance, batchId, receipt);
    if (archived.status === "refused") return archived;
    const reopened = await reopenRefChanges(physical, archived.result, reopens, resolved.writes, tips, provenance, batchId, receipt);
    const refreshed = await refreshCompletedChanges(physical, reopened, resolved, completed, provenance, batchId, receipt, actor);
    if (refreshed.status === "refused") return refreshed;
    const anchored = await anchorRefWriteManifest(physical, { changes: retirementRefChanges(refreshed.result, retirements, tips),
      ended: archives.length > 0 || retirements.length > 0, tips, provenance, batchId, actor, receipt });
    if (anchored.status === "refused") return anchored;
    const changes = anchored.result;
    return publishRefBatchChanges(physical, changes, destinations, { batchId, writes: results });
  });
  return step.status === "layout-changed" ? "layout-changed" : step.result;
}

function finalWriteNamespaceRefusal(context: RefBackendContext, resolved: ResolvedBatch,
  groups: ReadonlyMap<string, RefWriteGroup>, completed: ReadonlyMap<string, RefWriteGroup>): StoreRefusal | undefined {
  const targets = refWriteTargets(context, resolved);
  for (const [ref, group] of [...groups, ...completed]) {
    const target = targets.find(({ home }) => home.ref === ref);
    if (!target) throw new Error("A prepared namespace has no write target");
    const paths = new Set(group.entries.keys());
    if (!group.retired) paths.add(target.home.metadataPath);
    const collision = findRefNamespaceCollision(ref, paths);
    if (collision) return { code: "namespace-corrupt", class: "terminal", namespace: ref,
      condition: `The final write namespace on ${ref} collides at ${collision.path} and ${collision.other}.`,
      remedy: { text: "Rename or remove the colliding retained source entries in a new commit, then retry the write." } };
  }
  return undefined;
}

async function bindLockedProjects(context: RefBackendContext, resolved: ResolvedBatch): Promise<StoreResult<ResolvedBatch>> {
  const project = await bindProjectMutations(context, resolved.writes.map(({ mutation }) => mutation), resolved.tips);
  if (project.status === "refused") return project;
  return { status: "ok", result: { ...resolved, writes: resolved.writes.map((write, index) => {
    const mutation = project.result[index];
    if (!mutation) throw new Error("A project-bound mutation is missing");
    return { ...write, mutation };
  }) } };
}

async function applyPreparedMutations(context: RefBackendContext, writes: readonly ResolvedMutation[],
  groups: ReadonlyMap<string, RefGroup>): Promise<StoreResult<WriteResult[]>> {
  const results: WriteResult[] = [];
  for (const write of writes) {
    const group = groups.get(write.home.ref);
    if (!group) throw new Error("A resolved mutation has no captured ref group");
    const applied = await applyMutation(context, group, write);
    if (applied.status === "refused") return applied;
    results.push(applied.result);
  }
  return { status: "ok", result: results };
}

function applyResolutions(context: RefBackendContext, resolved: ResolvedBatch, groups: ReadonlyMap<string, RefGroup>): void {
  for (const { mutation } of resolved.writes) {
    for (const reference of mutation.resolves ?? []) {
      const target = mutationHome(context, reference, resolved.archived ?? [], resolved.retained);
      const group = groups.get(target.ref);
      if (!group) throw new Error("A resolved conflict has no captured ref group");
      group.entries.delete(target.path);
      const key = refFormatKey(reference);
      group.metadata.formats = Object.fromEntries(Object.entries(group.metadata.formats).filter(([candidate]) => candidate !== key));
    }
  }
}

function capturedWriteRefusal(context: RefBackendContext, resolved: ResolvedBatch, groups: ReadonlyMap<string, RefGroup>): StoreRefusal | undefined {
  const collision = storedPathCollision(context, resolved, groups);
  if (collision) return collision;
  const primary = primaryPlacementRefusal(resolved, groups);
  if (primary) return primary;
  return undefined;
}

function primaryPlacementRefusal(resolved: ResolvedBatch, groups: ReadonlyMap<string, RefGroup>): StoreRefusal | undefined {
  const primaryPuts = new Set(resolved.writes.filter(({ mutation }) => mutation.action === "put"
    && (mutation.reference.kind === "work-item/meta" || mutation.reference.kind === "work-item/record")).map(({ home }) => home.ref));
  for (const { mutation, home } of resolved.writes) {
    const { reference } = mutation;
    if (mutation.action !== "put" || reference.kind.endsWith("/conflict-record")
      || !["work-item", "review"].includes(familyOf(reference.kind))) continue;
    if (primaryPuts.has(home.ref) || groups.get(home.ref)?.metadata.primary !== undefined) continue;
    return { code: "record-malformed", class: "recoverable", reference, rule: "store.primary-placement",
      condition: "This work-item or review record has no primary or retained placement.",
      remedy: { text: "Create its work-item primary with placement, separately or in the same atomic batch, then retry the companion write." } };
  }
  return undefined;
}

function storedPathCollision(context: RefBackendContext, resolved: ResolvedBatch, groups: ReadonlyMap<string, RefGroup>): StoreRefusal | undefined {
  for (const { mutation, home } of resolved.writes) {
    if (mutation.action !== "put") continue;
    const group = groups.get(home.ref);
    if (!group) throw new Error("A resolved mutation has no captured ref group");
    const removed = new Set(resolved.writes.filter((write) => write.home.ref === home.ref && write.mutation.action === "remove")
      .map((write) => write.home.path));
    const neighbors: RefPathNeighbor[] = [...group.entries.values()].filter((entry) => !removed.has(entry.path) && entry.path !== home.path).map((entry) => {
      const reference = decodeStoredReference(context.registry, mutation.reference.owner, context.registry[mutation.reference.kind].family,
        entry.path, group.metadata);
      return { home: { ref: home.ref, path: entry.path }, ...(reference && "owner" in reference ? { reference } : {}) };
    });
    const refusal = checkRefPathCollision(mutation.reference, home, neighbors);
    if (refusal) return refusal;
  }
  return undefined;
}

async function applyMutation(context: RefBackendContext, group: RefGroup, write: ResolvedMutation): Promise<StoreResult<WriteResult>> {
  const { mutation, home } = write;
  const { kind } = mutation.reference;
  const formatKey = refFormatKey(mutation.reference);
  if (mutation.action === "remove") {
    group.entries.delete(home.path);
    if (kind === "lineage/transition") removeLineageOwner(group.metadata, mutation.reference);
    group.metadata.formats = Object.fromEntries(Object.entries(group.metadata.formats).filter(([key]) => key !== formatKey));
    return { status: "ok", result: { reference: mutation.reference, conflicts: [] } };
  }
  if (write.prior && write.prior.reference.kind !== kind) {
    const priorPath = expandStoredPath({ ...write.prior.reference, owner: mutation.reference.owner }, { registry: context.registry }).path;
    group.entries.delete(priorPath);
    const priorFormat = refFormatKey(write.prior.reference);
    group.metadata.formats = Object.fromEntries(Object.entries(group.metadata.formats).filter(([key]) => key !== priorFormat));
  }
  const formatVersion = context.registry[mutation.reference.kind].formatVersion;
  const content = context.registry[mutation.reference.kind].projection === "never"
    ? canonicalize(JSON.parse(mutation.content)) : mutation.content;
  const refusal = checkSerializationRules(mutation.reference, content);
  if (refusal) return { status: "refused", refusal };
  const oid = await writeRefBlob(context, content);
  if (kind === "lineage/transition" && mutation.reference.owner.type === "work-item" && mutation.reference.owner.uid) {
    group.metadata.lineage = { ...group.metadata.lineage, [mutation.reference.owner.uid]: mutation.reference.owner.name };
  }
  group.entries.set(home.path, { path: home.path, mode: "100644", oid });
  group.metadata.formats[formatKey] = formatVersion;
  if ((kind === "work-item/meta" || kind === "work-item/record") && mutation.placement) {
    const links = mutation.links ?? group.metadata.primary?.links;
    group.metadata.primary = { role: kind, placement: mutation.placement, ...(links === undefined ? {} : { links }) };
  }
  if (kind === "cohort/document" && mutation.placement?.kind === "completed") group.metadata.placement = mutation.placement;
  return { status: "ok", result: { reference: mutation.reference, conflicts: [], version: refRecordVersion(mutation.reference, oid, group.metadata, formatVersion) } };
}

function removeLineageOwner(metadata: RefMetadata, reference: RecordReference): void {
  if (reference.owner.type !== "work-item") return;
  const ownerUid = reference.owner.uid;
  metadata.lineage = Object.fromEntries(Object.entries(metadata.lineage ?? {}).filter(([uid]) => uid !== ownerUid));
}

async function readWriteGroups(context: RefBackendContext, resolved: ResolvedBatch): Promise<StoreResult<Map<string, RefGroup>>> {
  const targets = refWriteTargets(context, resolved);
  const refs = new Set(targets.map(({ home }) => home.ref));
  const tips = new Map([...resolved.tips].filter(([ref]) => refs.has(ref)));
  const trees = tips.size > 0 ? await readRefTrees(context, tips) : new Map<string, RefTreeEntry[]>();
  const metadataOids = new Map(targets.map(({ home }) => [home.ref,
    trees.get(home.ref)?.find(({ path }) => path === home.metadataPath)?.oid]));
  const queries = [...metadataOids.values()].filter((oid): oid is string => oid !== undefined);
  const objects = await readBatchObjects(context, [...new Set(queries)]);
  const groups = new Map<string, RefGroup>();
  for (const { reference, home } of targets) {
    if (groups.has(home.ref)) continue;
    const tip = tips.get(home.ref);
    // A tip whose tree cannot be read names restoration; only a readable tree without usable metadata needs a forward repair.
    if (tip && !trees.has(home.ref)) return { status: "refused", refusal: refObjectFault(home.ref, "missing", {
      historyRefs: await missingHistoryRefs(context, [home.ref], resolved.tips),
      condition: `The tip or a tree of ${home.ref} is unavailable locally.`,
    }).refusal };
    const metadata = await capturedGroupMetadata(context, resolved, { reference, home }, trees.get(home.ref) ?? [], objects);
    if (metadata.status === "refused") return metadata;
    const entries = new Map((trees.get(home.ref) ?? []).map((entry) => [entry.path, entry]));
    groups.set(home.ref, { metadata: metadata.result, entries, original: new Map(entries) });
  }
  return { status: "ok", result: groups };
}

/**
 * Read a captured ref's metadata, or start a readable record-free ref's. An ended owner's version names its latest folder's quarter,
 * so admission and results agree with what reads return.
 */
async function capturedGroupMetadata(context: RefBackendContext, resolved: ResolvedBatch, { reference, home }: RefWriteTarget,
  entries: readonly RefTreeEntry[], objects: ReadonlyMap<string, BatchObject | null>): Promise<StoreResult<RefMetadata>> {
  const entry = entries.find(({ path }) => path === home.metadataPath);
  const read = readRefMetadata(home.ref, entry, objects);
  if (read.kind !== "parsed" && (read.kind === "missing" || !holdsNoRecord(home, entries.map(({ path }) => path)))) {
    return { status: "refused", refusal: refObjectFault(home.ref, read.kind === "absent" ? "no-metadata" : read.kind, {
      historyRefs: read.kind === "missing" ? await missingHistoryRefs(context, [home.ref], resolved.tips) : undefined,
    }).refusal };
  }
  const metadata = read.kind === "parsed" ? read.metadata
    : { formatVersion: 1 as const, formats: {}, ...(/^refs\/arc\/(?:work|cohort)\//u.test(home.ref) ? { slug: reference.owner.name } : {}) };
  const latest = latestFolderPlacement(resolved.archived ?? [], home.ref);
  return { status: "ok", result: latest ? withCompletedPlacement(metadata, latest) : metadata };
}
