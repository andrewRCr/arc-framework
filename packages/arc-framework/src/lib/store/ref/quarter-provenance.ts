/** Select quarter provenance from batch order and the records held on either side of its change. */
import { sameOwner, type RecordReference } from "../identity.js";
import { expandStoredPath } from "../stored-path.js";
import { archiveOwnerTrees, archivedFolders, isArchiveMetadataPath, type ArchivedFolder } from "./archive-read.js";
import { readBatchObjects, readRefTrees, type RefTreeEntry } from "./batch-read.js";
import type { RefBackendContext } from "./context.js";
import type { ResolvedMutation } from "./write-resolution.js";

/** Prefer a held batch record, then a restored primary whose retained metadata the quarter changes. */
export async function quarterCommitReference(context: RefBackendContext, writes: readonly ResolvedMutation[], ref: string,
  entries: Iterable<RefTreeEntry>, tips: ReadonlyMap<string, string>): Promise<RecordReference> {
  const parent = tips.get(ref);
  const before = parent ? (await readRefTrees(context, new Map([[ref, parent]]))).get(ref) : [];
  if (!before) throw new Error("A planned quarter has no captured tree");
  const candidates = writes.flatMap(({ mutation, home }) => [{ reference: mutation.reference, home },
    ...(mutation.resolves ?? []).map(reference => ({ reference, home: expandStoredPath(reference, { registry: context.registry }) }))])
    .filter(({ home }) => /^refs\/arc\/(?:history\/)?(?:work|cohort)\//u.test(home.ref));
  const owners = candidates.map(({ reference }) => reference.owner);
  const snapshots = [before, [...entries]].map(snapshot => archiveOwnerTrees(new Map([[ref, snapshot]]), owners).get(ref) ?? []);
  const objects = await readBatchObjects(context, [...new Set(snapshots.flatMap(snapshot => snapshot
    .filter(({ path }) => isArchiveMetadataPath(path)).map(({ oid }) => oid)))]);
  const folders = snapshots.flatMap(snapshot => (["work-item", "cohort"] as const)
    .flatMap(family => archivedFolders(family, ref, snapshot, objects).folders));
  const first = candidates.find(({ reference }) => folders.some(folder => sameOwner(reference.owner, folder.owner)
    && folderHoldsRecord(context, folder, reference)));
  if (first) return first.reference;
  const restoring = writes.find(({ mutation }) => mutation.action === "put"
    && (mutation.reference.kind === "work-item/meta" || mutation.reference.kind === "work-item/record")
    && folders.some(folder => sameOwner(mutation.reference.owner, folder.owner) && folder.metadata.primary !== undefined));
  if (!restoring) throw new Error("A changed quarter holds no batch mutation");
  return restoring.mutation.reference;
}

function folderHoldsRecord(context: Pick<RefBackendContext, "registry">, folder: ArchivedFolder, reference: RecordReference): boolean {
  const primary = reference.kind === "work-item/meta" || reference.kind === "work-item/record";
  const role = primary ? folder.metadata.primary?.role : undefined;
  const home = expandStoredPath({ ...reference, owner: folder.owner, kind: role ?? reference.kind }, { registry: context.registry });
  return folder.entries.some(({ path }) => path === home.path);
}
