/** Prepare record trees over captured tips and publish their commits in one transaction. */

import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import { updateRefTransaction, type RefChange } from "../../git/ref-transaction.js";
import type { BatchInput, BatchResult, WriteResult } from "../write.js";
import type { StoreResult } from "../refusal.js";
import { readBatchObjects, readRefTrees, type RefTreeEntry } from "./batch-read.js";
import { metadataFailure, parseRefMetadata, type RefMetadata } from "./metadata.js";
import { refRecordVersion } from "./record-version.js";
import { writeRefBlob, writeRefTree } from "./tree-write.js";
import type { RefBackendContext } from "./context.js";
import type { ResolvedBatch, ResolvedMutation } from "./write-resolution.js";
import type { RecordReference } from "../identity.js";

interface RefGroup { entries: Map<string, RefTreeEntry>; metadata: RefMetadata }

/** Land prepared mutations over one captured namespace using expected old ref values. */
export async function commitRefWrites(context: RefBackendContext, resolved: ResolvedBatch,
  provenance: BatchInput["provenance"], batchId: string): Promise<StoreResult<BatchResult> | "retry" | "resolve"> {
  const loaded = await readWriteGroups(context, resolved);
  if (loaded.status === "refused") return loaded;
  const groups = loaded.result;
  if (resolved.writes.some(({ mutation, home }) => /^refs\/arc\/(?:work|cohort)\//u.test(home.ref)
    && groups.get(home.ref)?.metadata.slug !== mutation.reference.owner.name)) return "resolve";
  const stale = staleMutations(resolved, groups);
  if (stale.length > 0) return { status: "refused", refusal: {
    code: "version-conflict", class: "recoverable", records: stale,
    condition: "The expected record versions do not match the captured state",
    remedy: { text: "Read every conflicting record, then retry the whole batch with its current versions." },
  } };
  const tips = resolved.tips;
  const results: WriteResult[] = [];
  for (const write of resolved.writes) {
    const group = groups.get(write.home.ref);
    if (!group) throw new Error("A resolved mutation has no captured ref group");
    results.push(await applyMutation(context, group, write));
  }
  const changes: RefChange[] = [];
  for (const [ref, group] of groups) {
    const write = resolved.writes.find((write) => write.home.ref === ref);
    if (!write) throw new Error("A changed ref has no mutation");
    const path = write.home.metadataPath;
    group.entries.set(path, { path, mode: "100644", oid: await writeRefBlob(context, canonicalize(group.metadata)) });
    const tree = await writeRefTree(context, group.entries.values());
    const parent = tips.get(ref);
    const { stdout } = await context.exec("git", ["commit-tree", tree, ...(parent ? ["-p", parent] : []),
      "-m", `${provenance.verb} ${write.mutation.reference.owner.name}`], { cwd: context.checkoutRoot });
    changes.push({ ref, next: stdout.trim(), expected: parent ?? null });
  }
  const outcome = await updateRefTransaction(context, changes, { cwd: context.checkoutRoot });
  if (outcome.status !== "committed") return "retry";
  return { status: "ok", result: { batchId, writes: results } };
}

function staleMutations(resolved: ResolvedBatch, groups: ReadonlyMap<string, RefGroup>): RecordReference[] {
  return resolved.writes.flatMap(({ mutation, home }) => {
    const group = groups.get(home.ref);
    if (!group) throw new Error("A resolved mutation has no captured ref group");
    const entry = group.entries.get(home.path);
    const { kind, key } = mutation.reference;
    const format = group.metadata.formats[canonicalize({ kind, ...(key === undefined ? {} : { key }) })] ?? 1;
    const version = entry ? refRecordVersion(mutation.reference, entry.oid, group.metadata, format) : null;
    return mutation.expected === version ? [] : [mutation.reference];
  });
}

async function applyMutation(context: RefBackendContext, group: RefGroup, write: ResolvedMutation): Promise<WriteResult> {
  const { mutation, home } = write;
  const { kind, key } = mutation.reference;
  const formatKey = canonicalize({ kind, ...(key === undefined ? {} : { key }) });
  if (mutation.action === "remove") {
    group.entries.delete(home.path);
    group.metadata.formats = Object.fromEntries(Object.entries(group.metadata.formats).filter(([key]) => key !== formatKey));
    return { reference: mutation.reference, conflicts: [] };
  }
  const formatVersion = context.registry[mutation.reference.kind].formatVersion;
  const content = context.registry[mutation.reference.kind].projection === "never"
    ? canonicalize(JSON.parse(mutation.content)) : mutation.content;
  const oid = await writeRefBlob(context, content);
  group.entries.set(home.path, { path: home.path, mode: "100644", oid });
  group.metadata.formats[formatKey] = formatVersion;
  if ((kind === "work-item/meta" || kind === "work-item/record") && mutation.placement) {
    const links = mutation.links ?? group.metadata.primary?.links;
    group.metadata.primary = { role: kind, placement: mutation.placement, ...(links === undefined ? {} : { links }) };
  }
  return { reference: mutation.reference, conflicts: [], version: refRecordVersion(mutation.reference, oid, group.metadata, formatVersion) };
}

async function readWriteGroups(context: RefBackendContext, resolved: ResolvedBatch): Promise<StoreResult<Map<string, RefGroup>>> {
  const refs = new Set(resolved.writes.map((write) => write.home.ref));
  const tips = new Map([...resolved.tips].filter(([ref]) => refs.has(ref)));
  const trees = tips.size > 0 ? await readRefTrees(context, tips) : new Map<string, RefTreeEntry[]>();
  const queries = resolved.writes.flatMap(({ home }) => {
    const tip = tips.get(home.ref);
    return tip ? [`${tip}:${home.metadataPath}`] : [];
  });
  const objects = await readBatchObjects(context, [...new Set(queries)]);
  const groups = new Map<string, RefGroup>();
  for (const write of resolved.writes) {
    const { mutation, home } = write;
    let group = groups.get(home.ref);
    if (!group) {
      const tip = tips.get(home.ref);
      const metadata = tip ? parseRefMetadata(objects.get(`${tip}:${home.metadataPath}`), home.ref)
        : { formatVersion: 1 as const, formats: {},
          ...(mutation.reference.owner.type === "work-item" || mutation.reference.owner.type === "cohort"
            ? { slug: mutation.reference.owner.name } : {}) };
      if (!metadata) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal",
        namespace: home.ref, ...metadataFailure(home.ref) } };
      group = { metadata, entries: new Map((trees.get(home.ref) ?? []).map((entry) => [entry.path, entry])) };
      groups.set(home.ref, group);
    }
  }
  return { status: "ok", result: groups };
}
