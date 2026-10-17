/** Prepare record trees over captured tips and publish their commits in one transaction. */

import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import { updateRefTransaction } from "../../git/ref-transaction.js";
import type { BatchInput, BatchResult, WriteResult } from "../write.js";
import type { StoreResult, StoreRefusal } from "../refusal.js";
import { readBatchObjects, readRefTrees, type RefTreeEntry } from "./batch-read.js";
import { metadataFailure, parseRefMetadata, type RefMetadata } from "./metadata.js";
import { refRecordVersion } from "./record-version.js";
import { writeRefBlob } from "./tree-write.js";
import type { RefBackendContext } from "./context.js";
import type { ResolvedBatch, ResolvedMutation } from "./write-resolution.js";
import { refWriteTargets } from "./write-resolution.js";
import type { RecordReference } from "../identity.js";
import { prepareCapturedWrites } from "./write-current.js";
import { checkSerializationRules } from "../serialization.js";
import { checkRefPathCollision, type RefPathNeighbor } from "./path-admission.js";
import { decodeStoredReference } from "./path-decode.js";
import { familyOf } from "../catalog.js";
import { refFormatKey } from "./format-key.js";
import { prepareRefCommits, type RefWriteGroup } from "./write-commits.js";
import { expandStoredPath } from "../stored-path.js";
import { checkRefWrites } from "./write-checks.js";
import { prepareRefAnchors } from "./write-anchors.js";
import { prepareRefConflicts } from "./write-conflicts.js";

type RefGroup = RefWriteGroup;

/** Land prepared mutations over one captured namespace using expected old ref values. */
export async function commitRefWrites(context: RefBackendContext, resolved: ResolvedBatch,
  provenance: BatchInput["provenance"], batchId: string): Promise<StoreResult<BatchResult> | "retry" | "resolve"> {
  const loaded = await readWriteGroups(context, resolved);
  if (loaded.status === "refused") return loaded;
  const groups = loaded.result;
  if (resolved.writes.some(({ mutation, home }) => /^refs\/arc\/(?:work|cohort)\//u.test(home.ref)
    && groups.get(home.ref)?.metadata.slug !== mutation.reference.owner.name)) return "resolve";
  const refusal = capturedWriteRefusal(context, resolved, groups);
  if (refusal) return { status: "refused", refusal };
  const prepared = await prepareCapturedWrites(context, resolved, groups, provenance);
  if (prepared.status === "refused") return prepared;
  applyResolutions(context, resolved, groups);
  const tips = resolved.tips;
  const results: WriteResult[] = [];
  for (const write of prepared.result) {
    const group = groups.get(write.home.ref);
    if (!group) throw new Error("A resolved mutation has no captured ref group");
    const applied = await applyMutation(context, group, write);
    if (applied.status === "refused") return applied;
    results.push(applied.result);
  }
  const anchorRefusal = await prepareRefAnchors(context, prepared.result, groups);
  if (anchorRefusal) return { status: "refused", refusal: anchorRefusal };
  const completed = await prepareRefConflicts(context, prepared.result, groups, results);
  const broken = await checkRefWrites(context, prepared.result, completed, tips, provenance);
  if (broken) return { status: "refused", refusal: broken };
  const changes = await prepareRefCommits(context, prepared.result, refWriteTargets(context, resolved), groups, completed, tips, provenance, batchId);
  if (changes.length === 0) return { status: "ok", result: { batchId, writes: results } };
  const outcome = await updateRefTransaction(context, changes, { cwd: context.checkoutRoot });
  if (outcome.status !== "committed") return "retry";
  return { status: "ok", result: { batchId, writes: results } };
}

function applyResolutions(context: RefBackendContext, resolved: ResolvedBatch, groups: ReadonlyMap<string, RefGroup>): void {
  for (const { mutation } of resolved.writes) {
    for (const reference of mutation.resolves ?? []) {
      const target = expandStoredPath(reference, { registry: context.registry });
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
  const queries = targets.flatMap(({ home }) => {
    const tip = tips.get(home.ref);
    return tip ? [`${tip}:${home.metadataPath}`] : [];
  });
  const objects = await readBatchObjects(context, [...new Set(queries)]);
  const groups = new Map<string, RefGroup>();
  for (const { reference, home } of targets) {
    let group = groups.get(home.ref);
    if (!group) {
      const tip = tips.get(home.ref);
      const metadata = tip ? parseRefMetadata(objects.get(`${tip}:${home.metadataPath}`), home.ref)
        : { formatVersion: 1 as const, formats: {},
          ...(/^refs\/arc\/(?:work|cohort)\//u.test(home.ref)
            ? { slug: reference.owner.name } : {}) };
      if (!metadata) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal",
        namespace: home.ref, ...metadataFailure(home.ref) } };
      const entries = new Map((trees.get(home.ref) ?? []).map((entry) => [entry.path, entry]));
      group = { metadata, entries, original: new Map(entries) };
      groups.set(home.ref, group);
    }
  }
  return { status: "ok", result: groups };
}
