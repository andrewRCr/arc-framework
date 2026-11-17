/** Enumerate captured trees through the owning operation's object reader, retaining raw foreign names and empty trees. */
import type { RefBackendContext } from "./context.js";
import { readBatchObjects, type BatchObject, type RefTreeEntry } from "./batch-read.js";
import { parseRefTreeObject } from "./tree-content.js";
import { isCompletedGitFailure, isGitProcessError } from "../../git/process-error.js";

interface EnumeratedTree { entries: RefTreeEntry[]; directories: string[] }
interface Visit { root: string; oid: string; prefix: string; rawPrefix?: Uint8Array }

/** Walk only literal selected subtrees; an unreadable descendant faults its root without hiding another root. */
export async function enumerateRefTrees(context: RefBackendContext, roots: readonly string[], paths?: readonly string[]): Promise<Map<string, EnumeratedTree | null>> {
  const result = new Map<string, EnumeratedTree | null>(roots.map(oid => [oid, { entries: [], directories: [] }]));
  const decoded = new Map<string, RefTreeEntry[] | null>();
  let pending: Visit[] = roots.map(oid => ({ root: oid, oid, prefix: "" }));
  while (pending.length > 0) {
    const missing = [...new Set(pending.map(visit => visit.oid).filter(oid => !decoded.has(oid)))];
    const objects = await readTreeObjects(context, missing);
    for (const oid of missing) decoded.set(oid, parseRefTreeObject(objects.get(oid), { preserveInvalidNames: true }));
    const next: Visit[] = [];
    for (const visit of pending) visitTree(result, decoded, visit, paths, next);
    pending = next;
  }
  for (const tree of result.values()) tree?.entries.sort((left, right) => Buffer.compare(sortPath(left), sortPath(right)));
  return result;
}

/**
 * Read one level's trees, splitting a batch Git fails on until each damaged tree reads as unreadable, as a missing one does.
 * A repository that cannot show the failing tree at all, as when its store directory is gone, keeps the original error.
 */
async function readTreeObjects(context: RefBackendContext, oids: readonly string[]): Promise<Map<string, BatchObject | null>> {
  try { return await readBatchObjects(context, oids); }
  catch (error) {
    if (!isGitProcessError(error) || !isCompletedGitFailure(error)) throw error;
    const [oid] = oids;
    if (oids.length === 1 && oid !== undefined) {
      if (!await objectShown(context, oid)) throw error;
      return new Map([[oid, null]]);
    }
    const middle = Math.ceil(oids.length / 2);
    return new Map([...await readTreeObjects(context, oids.slice(0, middle)), ...await readTreeObjects(context, oids.slice(middle))]);
  }
}

async function objectShown(context: RefBackendContext, oid: string): Promise<boolean> {
  try {
    await context.rawExec(["cat-file", "-e", oid], { cwd: context.checkoutRoot, objectAccess: "local-only" });
    return true;
  } catch (error) {
    if (isGitProcessError(error) && isCompletedGitFailure(error)) return false;
    throw error;
  }
}

function visitTree(result: Map<string, EnumeratedTree | null>, decoded: ReadonlyMap<string, RefTreeEntry[] | null>,
  visit: Visit, paths: readonly string[] | undefined, next: Visit[]): void {
  const tree = result.get(visit.root), entries = decoded.get(visit.oid);
  if (!tree) return;
  if (!entries) { result.set(visit.root, null); return; }
  if (entries.length === 0 && visit.prefix !== "" && selected(visit.prefix, false, paths)) {
    tree.entries.push({ path: visit.prefix, mode: "040000", oid: visit.oid,
      ...visit.rawPrefix ? { invalidName: true, rawPath: visit.rawPrefix } : {} });
  }
  for (const entry of entries) visitEntry(tree, visit, entry, paths, next);
}

function visitEntry(tree: EnumeratedTree, visit: Visit, entry: RefTreeEntry, paths: readonly string[] | undefined, next: Visit[]): void {
  const path = visit.prefix ? `${visit.prefix}/${entry.path}` : entry.path;
  const directory = entry.mode === "040000";
  if (!selected(path, directory, paths)) return;
  const rawPath = appendRawPath(visit, entry);
  if (directory) {
    tree.directories.push(entry.oid);
    next.push({ root: visit.root, oid: entry.oid, prefix: path, ...rawPath ? { rawPrefix: rawPath } : {} });
  } else tree.entries.push({ ...entry, path, ...rawPath ? { invalidName: true, rawPath } : {} });
}

function selected(path: string, directory: boolean, paths?: readonly string[]): boolean {
  return !paths?.length || paths.some(wanted => path === wanted || path.startsWith(`${wanted}/`) || directory && wanted.startsWith(`${path}/`));
}

function appendRawPath(visit: Visit, entry: RefTreeEntry): Uint8Array | undefined {
  if (!visit.rawPrefix && !entry.rawPath) return undefined;
  const name = entry.rawPath ?? Buffer.from(entry.path);
  return visit.prefix === "" ? Uint8Array.from(name)
    : Buffer.concat([visit.rawPrefix ?? Buffer.from(visit.prefix), Buffer.from("/"), name]);
}

function sortPath(entry: RefTreeEntry): Buffer {
  const name = entry.rawPath ?? Buffer.from(entry.path);
  return entry.mode === "040000" ? Buffer.concat([name, Buffer.from("/")]) : Buffer.from(name);
}
