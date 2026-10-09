/** Content-derived identities for disposable check passes. */
import { createHash } from "node:crypto";
import type { CheckDeclaration } from "./declaration.js";
import type { TreePathChange } from "./tree.js";

/** Resolved content participating in a check's execution identity. */
export interface CheckKeyInput {
  id: string;
  declaration: CheckDeclaration["checks"][string];
  inputs: readonly TreePathChange[];
  paths?: readonly string[];
}

/**
 * Digest a check's declaration and the content it reads.
 * @param input - Resolved check entry, tree contents, and received paths
 * @returns A content-addressed execution key
 */
export function checkContentKey(input: CheckKeyInput): string {
  const inputs = input.inputs.map(entry => ({ path: entry.path, mode: entry.newMode, blob: entry.newBlob }))
    .sort((first, second) => first.path < second.path ? -1 : first.path > second.path ? 1 : 0);
  return createHash("sha256").update(JSON.stringify({
    id: input.id, declaration: input.declaration, inputs, paths: input.paths ?? [],
  })).digest("hex");
}
