/** Content-derived identities for disposable check passes. */
import { createHash } from "node:crypto";
import type { CheckInvocationCoordinate } from "./shards.js";
import type { CheckDeclaration } from "./declaration.js";
import type { TreePathChange } from "./tree.js";
import type { SourceManifestEntry } from "./runner/contract-source.js";

/** Declared historical input content, including absent received paths. */
export interface CheckPathContent { path: string; content: { mode: string; blob: string } | null }

/** A canonical dependency label and its captured materialized presentation. */
export interface CheckMaterializedPathContent { readonly path: string; readonly entry: Readonly<SourceManifestEntry> }

/** Execution-relevant qualification in fixed invocation order, without transport identifiers. */
export interface CheckRuntimeIdentity {
  readonly identity: string;
  readonly globalRuntime: readonly string[];
  readonly runtime: readonly string[];
}

/** Resolved content participating in a check's execution identity. */
export interface CheckKeyInput {
  id: string;
  declaration: CheckDeclaration["checks"][string];
  inputs: readonly TreePathChange[];
  paths?: readonly string[];
  globalInputs?: readonly TreePathChange[];
  globalRuntime?: readonly string[];
  runtime?: readonly string[];
  /** Captured value/file content identity, independent of original and transport locations. */
  environmentIdentity?: string;
  /** Actual raw presentation for only the declared own and global dependencies. */
  materializedInputs?: readonly CheckMaterializedPathContent[];
  /** Qualified executors and exact applicable probe output for the complete check plan. */
  preparedRuntime?: readonly CheckRuntimeIdentity[];
  /** Canonical prepared commands; excludes wire IDs and raw content-coordinate object identities. */
  preparedPlan?: readonly { readonly coordinate: CheckInvocationCoordinate; readonly argv: readonly string[];
    readonly cwd: string; readonly shell: boolean }[];
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
    version: 6,
    id: input.id,
    declaration: input.declaration,
    inputs,
    globalInputs: digestEntries(input.globalInputs ?? []),
    globalRuntime: input.globalRuntime ?? [],
    runtime: input.runtime ?? [],
    environment: input.environmentIdentity ?? null,
    materializedInputs: input.materializedInputs === undefined ? null : [...input.materializedInputs]
      .sort((first, second) => first.path < second.path ? -1 : first.path > second.path ? 1 : 0)
      .map(({ path, entry }) => ({ path, entry: entry.kind === "file"
        ? { path: entry.path, kind: entry.kind, mode: entry.mode, bytes: entry.bytes, digest: entry.digest }
        : { path: entry.path, kind: entry.kind, target: entry.target } })),
    preparedPlan: input.preparedPlan?.map(({ coordinate, argv, cwd, shell }) => ({
      coordinate: { batch: coordinate.batch, ...(coordinate.shard === undefined ? {} : {
        shard: { index: coordinate.shard.index, count: coordinate.shard.count },
      }) }, argv, cwd, shell,
    })) ?? null,
    preparedRuntime: input.preparedRuntime?.map(({ identity, globalRuntime, runtime }) => ({ identity, globalRuntime, runtime })) ?? null,
    paths: input.paths ?? [],
    base: input.base ?? null,
    merged: input.merged ?? [],
  })).digest("hex");
}

function digestEntries(entries: readonly TreePathChange[]) {
  return entries.map(entry => ({ path: entry.path, mode: entry.newMode, blob: entry.newBlob }))
    .sort((first, second) => first.path < second.path ? -1 : first.path > second.path ? 1 : 0);
}
