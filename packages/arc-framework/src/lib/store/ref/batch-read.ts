/** Byte-framed Git acquisition for state refs and their objects. */

import { directoryExists } from "./designation.js";
import { logicalReadRef, physicalReadRef } from "./read-source-namespace.js";
import type { RefBackendContext } from "./context.js";
import { isGitProcessError } from "../../git/process-error.js";
import { retryTornRefListing } from "../../git/ref-listing.js";
import { enumerateRefTrees } from "./tree-enumeration.js";

/** A present Git object returned by a batch request. */
export interface BatchObject { oid: string; type: string; bytes: Uint8Array }
/** A recursive tree entry, retaining its exact path and mode. */
export interface RefTreeEntry {
  path: string; oid: string; mode: string;
  /** Git's name for it is not UTF-8: `path` decodes it with replacement, so it lists as malformed and no tree is rebuilt from it. */
  invalidName?: true;
  /** Original bytes retained only when a decoded path cannot establish the names of its structural ancestors. */
  rawPath?: Uint8Array;
}
/** One enumerated tree: its entries, and the ID of every tree the enumeration traversed, root first. */
export interface ListedTree { entries: readonly RefTreeEntry[]; directories: readonly string[] }
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const encoder = new TextEncoder();

/** Capture local ref tips without dereferencing their potentially missing objects. */
export async function readRefTips(context: RefBackendContext, options: { includeHistory?: boolean } = {}): Promise<Map<string, string>> {
  const { stdout } = await retryTornRefListing(() => context.rawExec(["for-each-ref",
    ...(options.includeHistory ? [] : [`--exclude=${physicalReadRef(context, "refs/arc/history/")}`]),
    "--format=%(objectname) %(refname)", physicalReadRef(context, "refs/arc/"),
    ...context.readSource ? [context.readSource.versionRef] : []], { cwd: context.checkoutRoot, objectAccess: "local-only" }));
  const tips = new Map<string, string>();
  let cursor = 0;
  while (cursor < stdout.length) {
    const newline = stdout.indexOf(10, cursor), end = newline < 0 ? stdout.length : newline;
    const bytes = stdout.subarray(cursor, end);
    cursor = end + 1;
    if (!bytes.length) continue;
    let line: string;
    try { line = decoder.decode(bytes); }
    catch { continue; }
    const separator = line.indexOf(" ");
    if (separator < 1) throw new Error("Malformed ref-tip response");
    tips.set(logicalReadRef(context, line.slice(separator + 1)), line.slice(0, separator));
  }
  return tips;
}

/** Read objects in one process, recursively partitioning only an exceeded output bound. */
export async function readBatchObjects(context: RefBackendContext, queries: readonly string[]): Promise<Map<string, BatchObject | null>> {
  if (queries.length === 0) return new Map();
  if (context.blobStage) {
    const buffered = new Map<string, BatchObject>();
    for (const query of queries) {
      const bytes = context.blobStage.blobs.get(query);
      if (bytes) buffered.set(query, { oid: query, type: "blob", bytes });
    }
    if (buffered.size > 0) {
      const stored = await readBatchObjects({ ...context, blobStage: undefined }, queries.filter((query) => !buffered.has(query)));
      return new Map(queries.map((query) => [query, buffered.get(query) ?? stored.get(query) ?? null]));
    }
  }
  const retained = await readRetainedObjects(context, queries);
  if (retained) return retained;
  try { return await readStoredObjects(context, queries);
  } catch (error) {
    if (!isGitProcessError(error) || error.kind !== "output-limit" || queries.length === 1) throw error;
    const middle = Math.ceil(queries.length / 2);
    const left = await readBatchObjects(context, queries.slice(0, middle));
    const right = await readBatchObjects(context, queries.slice(middle));
    return new Map([...left, ...right]);
  }
}

async function readStoredObjects(context: RefBackendContext, queries: readonly string[]): Promise<Map<string, BatchObject | null>> {
  const physical = context.readSource ? queries.map((query) => physicalReadRef(context, query)) : queries;
  const { stdout } = await context.rawExec(["cat-file", "--batch"], {
    cwd: context.checkoutRoot, objectAccess: "local-only", input: encoder.encode(`${physical.join("\n")}\n`),
    batchReader: context.batchReader,
  });
  const objects = parseBatch(stdout, physical);
  if (await missingFromDepartedStore(context, objects)) {
    return await readBatchObjects({ ...context, batchReader: undefined }, queries);
  }
  retainObjects(context, objects);
  return context.readSource ? new Map(queries.map((query, index) => [query, objects.get(physical[index] ?? query) ?? null])) : objects;
}

async function missingFromDepartedStore(context: RefBackendContext, objects: ReadonlyMap<string, BatchObject | null>): Promise<boolean> {
  const gitDir = context.repository?.gitDir;
  return !!context.batchReader && !!gitDir && [...objects.values()].some((object) => object === null)
    && !await directoryExists(context, gitDir);
}

function retainObjects(context: RefBackendContext, objects: ReadonlyMap<string, BatchObject | null>): void {
  if (!context.writeEvidence) return;
  for (const [query, object] of objects) {
    if (object && /^(?:[0-9a-f]{40}|[0-9a-f]{64})(?:$|:|\^)/u.test(query)) {
      context.writeEvidence.objects.set(query, object);
      context.writeEvidence.objects.set(object.oid, object);
    }
  }
}

async function readRetainedObjects(context: RefBackendContext, queries: readonly string[]): Promise<Map<string, BatchObject | null> | null> {
  if (!context.writeEvidence) return null;
  const found = new Map(queries.flatMap(query => {
    const object = context.writeEvidence?.objects.get(query);
    return object ? [[query, object] as const] : [];
  }));
  if (!found.size) return null;
  const stored = await readBatchObjects(context, queries.filter(query => !found.has(query)));
  return new Map(queries.map(query => [query, found.get(query) ?? stored.get(query) ?? null]));
}

function parseBatch(bytes: Uint8Array, queries: readonly string[]): Map<string, BatchObject | null> {
  const objects = new Map<string, BatchObject | null>();
  let cursor = 0;
  for (const query of queries) {
    const end = bytes.indexOf(10, cursor);
    if (end < 0) throw new Error("Truncated Git batch header");
    const header = decoder.decode(bytes.subarray(cursor, end));
    cursor = end + 1;
    if (header === `${query} missing`) { objects.set(query, null); continue; }
    const match = /^([0-9a-f]{40}|[0-9a-f]{64}) (blob|tree|commit|tag) (\d+)$/u.exec(header);
    const size = Number(match?.[3]);
    if (!match?.[1] || !match[2] || !Number.isSafeInteger(size) || size < 0 || bytes[cursor + size] !== 10) {
      throw new Error("Malformed Git batch object");
    }
    objects.set(query, { oid: match[1], type: match[2], bytes: bytes.subarray(cursor, cursor + size) });
    cursor += size + 1;
  }
  if (cursor !== bytes.length) throw new Error("Unexpected trailing Git batch output");
  return objects;
}

/**
 * Resolve each tip's root tree and enumerate it, optionally limited to literal paths.
 * @param directories - Receives, per enumerated ref, the ID of every tree traversed, root first
 * @returns Each readable ref's entries; a ref whose tip or any traversed tree is missing is absent
 */
export async function readRefTrees(context: RefBackendContext, tips: ReadonlyMap<string, string>, paths?: readonly string[],
  directories?: Map<string, readonly string[]>): Promise<Map<string, RefTreeEntry[]>> {
  const pairs = [...tips];
  if (pairs.length === 0) return new Map();
  const retained = context.writeEvidence?.trees;
  if (retained && paths === undefined) {
    const found = new Map(pairs.flatMap(([ref, tip]) => {
      const listed = retained.get(tip);
      return listed ? [[ref, listed] as const] : [];
    }));
    if (found.size) {
      const stored = await readRefTrees(context, new Map(pairs.filter(([ref]) => !found.has(ref))), undefined, directories);
      for (const [ref, listed] of found) directories?.set(ref, listed.directories);
      return new Map(pairs.flatMap(([ref]) => {
        const entries = found.get(ref)?.entries.map(entry => ({ ...entry })) ?? stored.get(ref);
        return entries ? [[ref, entries] as const] : [];
      }));
    }
  }
  const queries = pairs.map(([, tip]) => `${tip}^{tree}`);
  const objects = await readBatchObjects(context, queries);
  const trees = queries.map((query) => {
    const object = objects.get(query);
    return object?.type === "tree" ? object.oid : null;
  });
  const byTree = await enumerateRefTrees(context, [...new Set(trees.filter((tree): tree is string => tree !== null))], paths);
  const byRef = new Map<string, RefTreeEntry[]>();
  pairs.forEach(([ref, tip], index) => {
    const tree = trees[index];
    const listed = tree ? byTree.get(tree) : null;
    if (tree && listed !== null) {
      const entries = listed?.entries ?? [];
      const traversed = [tree, ...listed?.directories ?? []];
      if (paths === undefined) retained?.set(tip, { entries: entries.map(entry => ({ ...entry })), directories: traversed });
      byRef.set(ref, entries);
      directories?.set(ref, traversed);
    }
  });
  return byRef;
}
