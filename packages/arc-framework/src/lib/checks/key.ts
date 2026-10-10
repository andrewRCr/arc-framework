/** Content-derived identities for disposable check passes. */
import { createHash } from "node:crypto";
import type { CheckDeclaration } from "./declaration.js";
import type { TreePathChange } from "./tree.js";

/** Declared historical input content, including absent received paths. */
export interface CheckPathContent { path: string; content: { mode: string; blob: string } | null }

/** Resolved content participating in a check's execution identity. */
export interface CheckKeyInput {
  id: string;
  declaration: CheckDeclaration["checks"][string];
  inputs: readonly TreePathChange[];
  paths?: readonly string[];
  globalInputs?: readonly TreePathChange[];
  globalRuntime?: readonly string[];
  runtime?: readonly string[];
  base?: readonly CheckPathContent[];
  merged?: readonly (readonly CheckPathContent[])[];
}

/**
 * Digest a check's declaration and the content it reads.
 * @param input - Resolved check entry, tree contents, and received paths
 * @returns A content-addressed execution key
 */
export function checkContentKey(input: CheckKeyInput): string {
  const inputs = digestEntries(input.inputs);
  return createHash("sha256").update(JSON.stringify({
    version: 2,
    id: input.id,
    declaration: input.declaration,
    inputs,
    globalInputs: digestEntries(input.globalInputs ?? []),
    globalRuntime: input.globalRuntime ?? [],
    runtime: input.runtime ?? [],
    paths: input.paths ?? [],
    base: input.base ?? null,
    merged: input.merged ?? [],
  })).digest("hex");
}

function digestEntries(entries: readonly TreePathChange[]) {
  return entries.map(entry => ({ path: entry.path, mode: entry.newMode, blob: entry.newBlob }))
    .sort((first, second) => first.path < second.path ? -1 : first.path > second.path ? 1 : 0);
}
