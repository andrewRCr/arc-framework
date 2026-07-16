/** Production Git/filesystem binding for two-stage decompose retirement. */

import { atomicWriteFile } from "../fs.js";
import { canonicalize, isCanonicalDigest, type CanonicalDigest } from "../canonical/canonical-json.js";
import { receiptId } from "../canonical/receipt-id.js";
import { validateManagedPath, type ManagedPath } from "../canonical/managed-path.js";
import type { GitExec } from "../git/exec.js";
import { parseMetaRecord } from "../active/meta-reader.js";
import { buildLifecycleIndex, type LifecycleIndexFs } from "./lifecycle-index.js";
import { prepareDecomposeRetirement } from "./decompose-preparation.js";
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
  DecomposePreparationRecord,
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
  stagePreparedResult(preparation: PreparedDecomposeRetirement): Promise<void>;
  finalize(origin: string, receiptId: CanonicalDigest): Promise<FinalizeDecomposeDriverResult>;
}

function decodePreparation(content: string, id: CanonicalDigest): DecomposePreparationRecord | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const envelope = parsed as Record<string, unknown>;
    if (envelope.kind !== "prepared-decompose" || envelope.schemaVersion !== 1) return null;
    if (typeof envelope.locator !== "object" || envelope.locator === null) return null;
    const locator = envelope.locator as Record<string, unknown>;
    if (locator.receiptId !== id || canonicalize(parsed) !== content) return null;
    return parsed as DecomposePreparationRecord;
  } catch {
    return null;
  }
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
              ownerlessSourceIds: [],
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
        const record = decodePreparation(stored, id);
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
        return await finalizeDecomposeRetirement(
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
              return parseMetaRecord(new TextDecoder().decode(bytes))["Depends On"]
                ?.split(",")
                .map((value) => value.trim())
                .filter(Boolean) ?? [];
            },
            replaceAndStageRecord: async (recordId, expected, next, paths) => {
              const path = resolveRetirementRecordPath(deps.cwd, recordId);
              if (await deps.readFile(path) !== expected) throw new Error("prepared record changed");
              const write = deps.atomicWriteFile ?? atomicWriteFile;
              await write(path, next);
              try {
                await stageDecomposePaths(deps, paths);
              } catch (error) {
                await write(path, expected);
                throw error;
              }
            },
          },
          record.locator,
          snapshot.authorityVersion,
        );
      } catch (error) {
        return { status: "refused", reason: error instanceof Error ? error.message : "authority-unavailable" };
      }
    },
  };
}

/** Build the production two-stage decompose retirement binding. */
export function createInRepoDecomposeRetirementDriver(
  deps: InRepoDecomposeRetirementDeps,
): InRepoDecomposeRetirementDriver {
  return createDriver(deps);
}
