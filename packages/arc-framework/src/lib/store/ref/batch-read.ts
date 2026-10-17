/** One-shot, byte-framed Git acquisition for state refs and their objects. */

import { logicalReadRef, physicalReadRef } from "./read-source-namespace.js";
import type { RefBackendContext } from "./context.js";
import { isGitProcessError } from "../../git/process-error.js";

/** A present Git object returned by a batch request. */
export interface BatchObject { oid: string; type: string; bytes: Uint8Array }
/** A recursive tree entry, retaining its exact path and mode. */
export interface RefTreeEntry { path: string; oid: string; mode: string }
const decoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();

/** Capture local ref tips without dereferencing their potentially missing objects. */
export async function readRefTips(context: RefBackendContext, options: { includeHistory?: boolean } = {}): Promise<Map<string, string>> {
  const { stdout } = await context.rawExec(["for-each-ref", ...(options.includeHistory ? [] : [`--exclude=${physicalReadRef(context, "refs/arc/history/")}`]),
    "--format=%(objectname) %(refname)", physicalReadRef(context, "refs/arc/"),
    ...context.readSource ? [context.readSource.versionRef] : []], { cwd: context.checkoutRoot, objectAccess: "local-only" });
  return new Map(decoder.decode(stdout).split("\n").filter(Boolean).map((line) => {
    const separator = line.indexOf(" ");
    if (separator < 1) throw new Error("Malformed ref-tip response");
    return [logicalReadRef(context, line.slice(separator + 1)), line.slice(0, separator)];
  }));
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
  try {
    const physical = context.readSource ? queries.map((query) => physicalReadRef(context, query)) : queries;
    const { stdout } = await context.rawExec(["cat-file", "--batch"], {
      cwd: context.checkoutRoot, objectAccess: "local-only", input: encoder.encode(`${physical.join("\n")}\n`),
    });
    const objects = parseBatch(stdout, physical);
    return context.readSource ? new Map(queries.map((query, index) => [query, objects.get(physical[index] ?? query) ?? null])) : objects;
  } catch (error) {
    if (!isGitProcessError(error) || error.kind !== "output-limit" || queries.length === 1) throw error;
    const middle = Math.ceil(queries.length / 2);
    const left = await readBatchObjects(context, queries.slice(0, middle));
    const right = await readBatchObjects(context, queries.slice(middle));
    return new Map([...left, ...right]);
  }
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

/** Resolve each tip's root tree and enumerate it, optionally limited to literal paths. */
export async function readRefTrees(context: RefBackendContext, tips: ReadonlyMap<string, string>, paths?: readonly string[]): Promise<Map<string, RefTreeEntry[]>> {
  const pairs = [...tips];
  const queries = pairs.map(([, tip]) => `${tip}^{tree}`);
  const { stdout } = await context.rawExec(["cat-file", "--batch-check"], {
    cwd: context.checkoutRoot, objectAccess: "local-only", input: encoder.encode(`${queries.join("\n")}\n`),
  });
  const trees = decoder.decode(stdout).trimEnd().split("\n").map((line) => {
    const match = /^([0-9a-f]{40}|[0-9a-f]{64}) tree \d+$/u.exec(line);
    return match?.[1] ?? null;
  });
  if (trees.length !== pairs.length) throw new Error("Incomplete tree batch-check response");
  const input = trees.filter((tree): tree is string => tree !== null).map((tree) => `${emptyTree(tree.length)} ${tree}\n`).join("");
  const result = await context.rawExec(["diff-tree", "--stdin", "-r", "-t", "-z", ...(paths ? ["--", ...paths.map((path) => `:(literal)${path}`)] : [])], {
    cwd: context.checkoutRoot, objectAccess: "local-only", input: encoder.encode(input),
  });
  const byTree = parseTreeDiff(result.stdout);
  const byRef = new Map<string, RefTreeEntry[]>();
  pairs.forEach(([ref], index) => {
    const tree = trees[index];
    if (tree) byRef.set(ref, byTree.get(tree) ?? []);
  });
  return byRef;
}

function emptyTree(length: number): string {
  return length === 64 ? "6ef19b41225c5369f1c104d45d8d85efa9b057b53b14b4b9b939dd74decc5321"
    : "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
}

function parseTreeDiff(bytes: Uint8Array): Map<string, RefTreeEntry[]> {
  const tokens = decoder.decode(bytes).split("\0");
  const trees = new Map<string, RefTreeEntry[]>();
  let current: RefTreeEntry[] | undefined;
  for (let index = 0; index < tokens.length; index += 1) {
    let token = tokens[index] ?? "";
    let pair = /^[0-9a-f]{40,64} ([0-9a-f]{40,64})\n/u.exec(token);
    while (pair?.[1]) {
      current = [];
      trees.set(pair[1], current);
      token = token.slice(pair[0].length);
      pair = /^[0-9a-f]{40,64} ([0-9a-f]{40,64})\n/u.exec(token);
    }
    if (!token) continue;
    const entry = /^:\d{6} (\d{6}) [0-9a-f]{40,64} ([0-9a-f]{40,64}) A$/u.exec(token);
    const path = tokens[++index];
    if (!current || !entry?.[1] || !entry[2] || path === undefined) throw new Error("Malformed recursive tree diff");
    // Recursive enumeration omits empty trees unless tree rows are requested.
    // Keep only empty tree rows; nonempty parents are rebuilt from their leaves.
    if (entry[1] !== "040000" || entry[2] === emptyTree(entry[2].length)) current.push({ mode: entry[1], oid: entry[2], path });
  }
  return trees;
}
