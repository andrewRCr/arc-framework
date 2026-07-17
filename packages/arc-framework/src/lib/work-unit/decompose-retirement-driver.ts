/** Production Git/filesystem binding for two-stage decompose retirement. */

import { atomicWriteFile } from "../fs.js";
import { canonicalize, isCanonicalDigest, type CanonicalDigest } from "../canonical/canonical-json.js";
import { receiptId } from "../canonical/receipt-id.js";
import { validateManagedPath, type ManagedPath } from "../canonical/managed-path.js";
import type { GitExec } from "../git/exec.js";
import { parseMetaRecord } from "../active/meta-reader.js";
import { buildLifecycleIndex, type LifecycleIndexFs } from "./lifecycle-index.js";
import {
  parseDecomposePreparationRecord,
  prepareDecomposeRetirement,
} from "./decompose-preparation.js";
import {
  finalizeDecomposeRetirement,
  type DecomposeFinalTarget,
  type DecomposeFinalizationProjection,
} from "./decompose-finalization.js";
import type { DecomposeAllocationMap } from "./decompose-cut-map.js";
import {
  bindDecomposePreparation,
  destinationArtifactPath,
  readDecomposeAuthorityVersion,
  readDecomposeRecord,
  readDecomposeStagedPatch,
  readDecomposeStagedPaths,
  readDecomposeTargetGroup,
  stageDecomposePaths,
} from "./decompose-retirement-projection.js";
import {
  resolveRetirementRecordPath,
  resolveRetirementRecordRelativePath,
} from "./retirement-record-store.js";
import type {
  PreparedDecomposeRetirement,
  RetirementReceipt,
} from "./retirement-authority.js";

/** Exact Git blob reader; `null` reads the current index. */
export type DecomposeBlobReader = (ref: string | null, path: ManagedPath) => Promise<Uint8Array | null>;

/** Production boundaries for the in-repository decompose driver. */
export interface InRepoDecomposeRetirementDeps {
  cwd: string;
  exec: GitExec;
  lifecycleFs: LifecycleIndexFs;
  readFile(path: string): Promise<string>;
  readBlob: DecomposeBlobReader;
  createRecord(receiptId: CanonicalDigest, content: string): Promise<void>;
  removeRecord(receiptId: CanonicalDigest): Promise<void>;
  atomicWriteFile?: typeof atomicWriteFile;
}

export type PrepareDecomposeDriverResult =
  | { status: "prepared"; preparation: PreparedDecomposeRetirement }
  | { status: "refused"; reason: string };

export type FinalizeDecomposeDriverResult =
  | { status: "recorded"; receipt: RetirementReceipt; authorityVersion: string }
  | { status: "refused"; reason: string };

/** Production two-stage decompose authority surface consumed by the CLI handler. */
export interface InRepoDecomposeRetirementDriver {
  prepare(allocation: DecomposeAllocationMap): Promise<PrepareDecomposeDriverResult>;
  revalidate(preparation: PreparedDecomposeRetirement): Promise<
    { status: "valid" } | { status: "refused"; reason: string }
  >;
  stagePreparedResult(preparation: PreparedDecomposeRetirement): Promise<void>;
  finalize(origin: string, receiptId: CanonicalDigest): Promise<FinalizeDecomposeDriverResult>;
}

function createDriver(deps: InRepoDecomposeRetirementDeps): InRepoDecomposeRetirementDriver {
  return {
    prepare: async (allocation) => {
      try {
        const binding = await bindDecomposePreparation(deps, allocation);
        const id = receiptId({
          schemaVersion: 1,
          subject: binding.scope.subject,
          transition: "decompose",
          sourceBranch: binding.scope.source.branch,
          sourceHead: binding.scope.source.head,
        });
        const currentRecord = async () => await readDecomposeRecord(deps, id);
        const snapshot = await readDecomposeAuthorityVersion(
          deps,
          binding.scope,
          await currentRecord(),
          binding.sourceArtifactDigest,
          binding.inventories,
        );
        return await prepareDecomposeRetirement(
          {
            readAuthoritySnapshot: async () => await readDecomposeAuthorityVersion(
              deps,
              binding.scope,
              await currentRecord(),
              binding.sourceArtifactDigest,
              binding.inventories,
            ),
            readProjection: () => Promise.resolve({
              sourceArtifactDigest: binding.sourceArtifactDigest,
              inventories: binding.inventories,
              allowedPaths: binding.allowedPaths,
            }),
            readStagedPaths: async () => await readDecomposeStagedPaths(deps),
            readRecord: async (recordId) => await readDecomposeRecord(deps, recordId),
            createRecord: (recordId, content) => deps.createRecord(recordId, content),
            removeRecord: (recordId) => deps.removeRecord(recordId),
            stagePaths: (paths) => stageDecomposePaths(deps, paths),
          },
          binding.scope,
          allocation,
          snapshot.authorityVersion,
        );
      } catch (error) {
        return { status: "refused", reason: error instanceof Error ? error.message : "authority-unavailable" };
      }
    },
    revalidate: async (preparation) => {
      try {
        const id = preparation.locator.receiptId;
        const stored = await readDecomposeRecord(deps, id);
        if (stored === null) return { status: "refused", reason: "evidence-missing" };
        const record = parseDecomposePreparationRecord(stored, id);
        if (record === null
          || canonicalize(record) !== canonicalize(preparation.record)
          || canonicalize(record.locator) !== canonicalize(preparation.locator)) {
          return { status: "refused", reason: "evidence-mismatch" };
        }
        const binding = await bindDecomposePreparation(deps, record.allocation);
        if (canonicalize(binding.scope) !== canonicalize(record.locator.scope)
          || binding.sourceArtifactDigest !== record.sourceArtifactDigest
          || canonicalize(binding.inventories) !== canonicalize({
            sourceInventory: record.sourceInventory,
            incomingEdgeInventory: record.incomingEdgeInventory,
            outgoingEdgeInventory: record.outgoingEdgeInventory,
          })
          || canonicalize(binding.allowedPaths) !== canonicalize(record.allowedPaths)) {
          return { status: "refused", reason: "authority-conflict" };
        }
        const snapshot = await readDecomposeAuthorityVersion(
          deps,
          binding.scope,
          stored,
          binding.sourceArtifactDigest,
          binding.inventories,
        );
        if (snapshot.recordState !== "prepared-decompose"
          || snapshot.authorityVersion !== preparation.authorityVersion) {
          return { status: "refused", reason: "authority-conflict" };
        }
        const recordPath = resolveRetirementRecordRelativePath(id);
        const stagedPaths = await readDecomposeStagedPaths(deps);
        const admitted = new Set([recordPath, ...record.allowedPaths]);
        if (!stagedPaths.includes(recordPath) || stagedPaths.some((path) => !admitted.has(path))) {
          return { status: "refused", reason: "authority-conflict" };
        }
        return { status: "valid" };
      } catch (error) {
        return { status: "refused", reason: error instanceof Error ? error.message : "authority-unavailable" };
      }
    },
    stagePreparedResult: async (preparation) => {
      await stageDecomposePaths(deps, [
        resolveRetirementRecordRelativePath(preparation.locator.receiptId),
        ...preparation.record.allowedPaths,
      ]);
    },
    finalize: async (origin, id) => {
      try {
        if (!isCanonicalDigest(id)) return { status: "refused", reason: "invalid receipt ID" };
        const stored = await readDecomposeRecord(deps, id);
        if (stored === null) return { status: "refused", reason: "evidence-missing" };
        const record = parseDecomposePreparationRecord(stored, id);
        if (record === null) return { status: "refused", reason: "evidence-mismatch" };
        if (record.locator.scope.subject.kind !== "work-unit" || record.locator.scope.subject.name !== origin) {
          return { status: "refused", reason: "evidence-mismatch" };
        }
        const inventories = {
          sourceInventory: record.sourceInventory,
          incomingEdgeInventory: record.incomingEdgeInventory,
          outgoingEdgeInventory: record.outgoingEdgeInventory,
        };
        const snapshot = await readDecomposeAuthorityVersion(
          deps,
          record.locator.scope,
          stored,
          record.sourceArtifactDigest,
          inventories,
        );
        const index = await buildLifecycleIndex({ cwd: deps.cwd, fs: deps.lifecycleFs });
        const entries = new Map(record.allocation.entries.map((entry) => [entry.destinationId, entry]));
        const projection = async (): Promise<DecomposeFinalizationProjection> => {
          const patch = await readDecomposeStagedPatch(deps, resolveRetirementRecordRelativePath(id));
          const targets = (await Promise.all(
            record.allocation.entries.map((entry) => readDecomposeTargetGroup(deps, index, entry)),
          )).filter((target): target is DecomposeFinalTarget => target !== null);
          return {
            sourceArtifactDigest: record.sourceArtifactDigest,
            inventories,
            stagedPaths: patch.paths,
            transitionPatch: patch.operations,
            targets,
          };
        };
        const finalized = await finalizeDecomposeRetirement(
          {
            readAuthoritySnapshot: async () => await readDecomposeAuthorityVersion(
              deps,
              record.locator.scope,
              await readDecomposeRecord(deps, id),
              record.sourceArtifactDigest,
              inventories,
            ),
            readRecord: async (recordId) => await readDecomposeRecord(deps, recordId),
            readProjection: projection,
            readTargetArtifact: async (destinationId, artifact) => {
              const entry = entries.get(destinationId);
              if (entry === undefined) return null;
              const path = destinationArtifactPath(index, record.allocation, entry, artifact);
              return path === null ? null : await deps.readBlob(null, path);
            },
            readDependsOn: async (slug) => {
              const entry = index.get(slug);
              if (entry === undefined) return null;
              const bytes = await deps.readBlob(null, validateManagedPath(entry.path));
              if (bytes === null) return null;
              const field = parseMetaRecord(new TextDecoder().decode(bytes))["Depends On"];
              if (field === null || field === "[none]") return [];
              return field.split(",")
                .map((value) => value.trim())
                .filter(Boolean);
            },
            replaceAndStageRecord: async (recordId, expected, next, paths) => {
              const path = resolveRetirementRecordPath(deps.cwd, recordId);
              const relativePath = resolveRetirementRecordRelativePath(recordId);
              if (!paths.includes(relativePath)) throw new Error("prepared record is not staged");
              if (await deps.readFile(path) !== expected) throw new Error("prepared record changed");
              const write = deps.atomicWriteFile ?? atomicWriteFile;
              await write(path, next);
              try {
                // The transition paths were already hashed from the index. Stage only
                // the replacement record so later working-tree edits cannot alter the
                // patch authorized by the finalized receipt.
                await stageDecomposePaths(deps, [relativePath]);
                const staged = await deps.readBlob(null, validateManagedPath(relativePath));
                if (staged === null || new TextDecoder("utf-8", { fatal: true }).decode(staged) !== next) {
                  throw new Error("finalized record is absent from the staged index");
                }
              } catch (error) {
                const rollbackFailure = await restorePreparedRecord(deps, write, path, relativePath, expected);
                if (rollbackFailure !== null) {
                  throw new Error(
                    `finalized record update failed: ${errorMessage(error)}. `
                    + `Rollback was incomplete: ${rollbackFailure}.`,
                    { cause: error },
                  );
                }
                throw error;
              }
            },
          },
          record.locator,
          snapshot.authorityVersion,
        );
        if (finalized.status === "refused" && finalized.diagnostic !== undefined) {
          return { status: "refused", reason: `${finalized.reason}: ${finalized.diagnostic}` };
        }
        return finalized;
      } catch (error) {
        return { status: "refused", reason: error instanceof Error ? error.message : "authority-unavailable" };
      }
    },
  };
}

async function restorePreparedRecord(
  deps: InRepoDecomposeRetirementDeps,
  write: typeof atomicWriteFile,
  path: string,
  relativePath: string,
  expected: string,
): Promise<string | null> {
  try {
    await write(path, expected);
  } catch (error) {
    return `prepared record working-tree restoration failed: ${errorMessage(error)}`;
  }
  try {
    await stageDecomposePaths(deps, [relativePath]);
  } catch (error) {
    return `prepared record index restoration failed: ${errorMessage(error)}`;
  }
  try {
    const staged = await deps.readBlob(null, validateManagedPath(relativePath));
    if (staged === null || new TextDecoder("utf-8", { fatal: true }).decode(staged) !== expected) {
      return "prepared record is absent from the restored index";
    }
  } catch (error) {
    return `prepared record index verification failed: ${errorMessage(error)}`;
  }
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Build the production two-stage decompose retirement binding. */
export function createInRepoDecomposeRetirementDriver(
  deps: InRepoDecomposeRetirementDeps,
): InRepoDecomposeRetirementDriver {
  return createDriver(deps);
}
