/** Production Git/filesystem binding for two-stage decompose retirement. */

import { atomicWriteFile } from "../fs.js";
import {
  canonicalDigest,
  canonicalize,
  digestBytes,
  isCanonicalDigest,
  type CanonicalDigest,
} from "../canonical/canonical-json.js";
import { contentDigest } from "../canonical/content-digest.js";
import { receiptId } from "../canonical/receipt-id.js";
import { validateManagedPath, type ManagedPath } from "../canonical/managed-path.js";
import type { GitExec } from "../git/exec.js";
import { parseMetaRecord } from "../active/meta-reader.js";
import { buildLifecycleIndex, type LifecycleIndexFs } from "./lifecycle-index.js";
import type { ComposedLifecycleIndexResult } from "./composed-lifecycle-index.js";
import {
  parseDecomposePreparationRecord,
  prepareDecomposeRetirement,
} from "./decompose-preparation.js";
import {
  finalizeDecomposeRetirement,
  finalizeV3DecomposeRetirement,
  type DecomposeFinalTarget,
  type DecomposeFinalizationProjection,
} from "./decompose-finalization.js";
import type { RetirementLifecycleResult } from "./retirement-lifecycle-result.js";
import { deriveDecomposeInventories } from "./decompose-inventory.js";
import type { DecomposeAllocationMap } from "./decompose-cut-map.js";
import { partitionTransformDependents } from "./transform-coordination.js";
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
import {
  prepareV3DecomposeRetirement,
  type PreparedV3DecomposeRetirement,
} from "./decompose-preparation.js";
import { parseV3DecomposePreparation, type V3DecomposePreparation } from "./decompose-v3-preparation.js";
import type { V3DecomposeReceipt } from "./decompose-v3-receipt.js";
import { v3SourceArtifactDigest, type V3SourceArtifactEntry } from "./decompose-v3-schema.js";

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
  /** Remote-aware lifecycle truth shared by preparation, mutation, and finalization. */
  composed?: ComposedLifecycleIndexResult;
}

export type PrepareDecomposeDriverResult =
  | { status: "prepared"; preparation: PreparedDecomposeRetirement }
  | { status: "refused"; reason: string };

export type FinalizeDecomposeDriverResult =
  | {
      status: "recorded";
      receipt: RetirementReceipt;
      authorityVersion: string;
      lifecycle: RetirementLifecycleResult;
    }
  | { status: "refused"; reason: string };

export type PrepareV3DecomposeDriverResult =
  | { status: "prepared"; preparation: PreparedV3DecomposeRetirement }
  | { status: "refused"; reason: string };

export type FinalizeV3DecomposeDriverResult =
  | { status: "recorded"; receipt: V3DecomposeReceipt; authorityVersion: string }
  | { status: "refused"; reason: string };

/** Production two-stage decompose authority surface consumed by the CLI handler. */
export interface InRepoDecomposeRetirementDriver {
  /** Persist a fully planned v3 preparation; legacy maps have no write authority. */
  prepareV3(preparation: V3DecomposePreparation): Promise<PrepareV3DecomposeDriverResult>;
  /** Seal a fully materialized v3 receipt through the central validator. */
  finalizeV3(origin: string, receipt: V3DecomposeReceipt): Promise<FinalizeV3DecomposeDriverResult>;
  prepare(allocation: DecomposeAllocationMap): Promise<PrepareDecomposeDriverResult>;
  revalidate(preparation: PreparedDecomposeRetirement): Promise<
    { status: "valid" } | { status: "refused"; reason: string }
  >;
  stagePreparedResult(preparation: PreparedDecomposeRetirement): Promise<void>;
  finalize(origin: string, receiptId: CanonicalDigest): Promise<FinalizeDecomposeDriverResult>;
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

async function readV3PathState(
  deps: InRepoDecomposeRetirementDeps,
  ref: string | null,
  path: ManagedPath,
): Promise<{ kind: "absent" } | { kind: "file"; mode: "100644" | "100755"; contentDigest: CanonicalDigest }> {
  const result = ref === null
    ? await deps.exec("git", ["ls-files", "--stage", "-z", "--", path], { cwd: deps.cwd })
    : await deps.exec("git", ["ls-tree", "-z", ref, "--", path], { cwd: deps.cwd });
  if (result.stdout === "") return { kind: "absent" };
  const entry = result.stdout.split("\0").filter(Boolean);
  if (entry.length !== 1 || entry[0] === undefined) throw new Error(`ambiguous path state: ${path}`);
  const match = ref === null
    ? /^(100644|100755) [0-9a-f]{40,64} 0\t/u.exec(entry[0])
    : /^(100644|100755) blob [0-9a-f]{40,64}\t/u.exec(entry[0]);
  const mode = match?.[1];
  if (mode !== "100644" && mode !== "100755") throw new Error(`unsupported path state: ${path}`);
  const bytes = await deps.readBlob(ref, path);
  if (bytes === null) throw new Error(`unreadable path state: ${path}`);
  return { kind: "file", mode, contentDigest: contentDigest(bytes) };
}

async function resolveV3Ref(deps: InRepoDecomposeRetirementDeps, ref: string): Promise<string> {
  const { stdout } = await deps.exec("git", ["rev-parse", "--verify", `${ref}^{commit}`], { cwd: deps.cwd });
  const oid = stdout.trim();
  if (oid === "") throw new Error(`could not resolve commit: ${ref}`);
  return oid;
}

async function readV3AuthoritySnapshot(
  deps: InRepoDecomposeRetirementDeps,
  preparation: V3DecomposePreparation,
  recordContent: string | null,
): Promise<{ authorityVersion: string; recordState: "absent" | "prepared-decompose" }> {
  const [sourceHead, resultBaseHead] = await Promise.all([
    resolveV3Ref(deps, preparation.facts.completedMap.machine.source.ref),
    resolveV3Ref(deps, preparation.facts.completedMap.machine.resultBase.ref),
  ]);
  const machine = preparation.facts.completedMap.machine;
  if (sourceHead !== machine.source.head || resultBaseHead !== machine.resultBase.head) {
    throw new Error("v3 decompose projection changed");
  }
  const recordState = recordContent === null ? "absent" : "prepared-decompose";
  return {
    recordState,
    authorityVersion: canonicalDigest({
      receiptId: preparation.receiptId,
      sourceHead,
      resultBaseHead,
      sourceArtifactDigest: preparation.facts.sourceArtifactDigest,
      recordState,
      recordDigest: recordContent === null ? null : digestBytes(Buffer.from(recordContent, "utf8")),
    }),
  };
}

async function readV3SourceArtifactInventory(
  deps: InRepoDecomposeRetirementDeps,
  preparation: V3DecomposePreparation,
): Promise<{ entries: V3SourceArtifactEntry[]; digest: CanonicalDigest }> {
  const machine = preparation.facts.completedMap.machine;
  const sourcePaths = [...new Set(machine.sourceUnits.map(({ sourcePath }) => sourcePath))]
    .sort(compareUtf8);
  const entries = await Promise.all(sourcePaths.map(async (rawPath): Promise<V3SourceArtifactEntry> => {
    const path = validateManagedPath(rawPath);
    const state = await readV3PathState(deps, machine.source.head, path);
    if (state.kind !== "file") throw new Error(`source artifact disappeared: ${path}`);
    return { path, objectKind: "blob", mode: state.mode, contentDigest: state.contentDigest };
  }));
  const digest = v3SourceArtifactDigest(entries);
  if (digest === null) throw new Error("source artifact inventory is not canonical");
  return { entries, digest };
}

async function replaceV3Record(
  deps: InRepoDecomposeRetirementDeps,
  receiptId: CanonicalDigest,
  expected: string,
  next: string,
): Promise<void> {
  const path = resolveRetirementRecordPath(deps.cwd, receiptId);
  const relativePath = resolveRetirementRecordRelativePath(receiptId);
  if (await deps.readFile(path) !== expected) throw new Error("prepared record changed");
  const write = deps.atomicWriteFile ?? atomicWriteFile;
  await write(path, next);
  try {
    await stageDecomposePaths(deps, [relativePath]);
    const staged = await deps.readBlob(null, validateManagedPath(relativePath));
    if (staged === null || new TextDecoder("utf-8", { fatal: true }).decode(staged) !== next) {
      throw new Error("finalized record is absent from the staged index");
    }
  } catch (error) {
    const rollbackFailure = await restorePreparedRecord(deps, write, path, relativePath, expected);
    if (rollbackFailure !== null) {
      throw new Error(
        `finalized record update failed: ${errorMessage(error)}. Rollback was incomplete: ${rollbackFailure}.`,
        { cause: error },
      );
    }
    throw error;
  }
}

function createDriver(deps: InRepoDecomposeRetirementDeps): InRepoDecomposeRetirementDriver {
  return {
    prepareV3: async (preparation) => {
      try {
        const currentRecord = async () => await readDecomposeRecord(deps, preparation.receiptId);
        const snapshot = await readV3AuthoritySnapshot(deps, preparation, await currentRecord());
        return await prepareV3DecomposeRetirement(
          {
            readAuthoritySnapshot: async (receiptId) => {
              if (receiptId !== preparation.receiptId) {
                throw new Error("v3 decompose preparation receipt binding changed");
              }
              return await readV3AuthoritySnapshot(
                deps,
                preparation,
                await readDecomposeRecord(deps, receiptId),
              );
            },
            readStagedPaths: async () => await readDecomposeStagedPaths(deps),
            readRecord: async (recordId) => await readDecomposeRecord(deps, recordId),
            createRecord: async (recordId, content) => deps.createRecord(recordId, content),
            removeRecord: async (recordId) => deps.removeRecord(recordId),
            stagePaths: async (paths) => {
              await stageDecomposePaths(deps, paths);
            },
          },
          preparation,
          snapshot.authorityVersion,
        );
      } catch (error) {
        return { status: "refused", reason: error instanceof Error ? error.message : "authority-unavailable" };
      }
    },
    finalizeV3: async (origin, receipt) => {
      try {
        const stored = await readDecomposeRecord(deps, receipt.receiptId);
        if (stored === null) return { status: "refused", reason: "evidence-missing" };
        const preparation = parseV3DecomposePreparation(stored);
        if (preparation === null || preparation.facts.completedMap.machine.source.origin !== origin) {
          return { status: "refused", reason: "evidence-mismatch" };
        }
        const snapshot = await readV3AuthoritySnapshot(deps, preparation, stored);
        return await finalizeV3DecomposeRetirement(
          {
            readAuthoritySnapshot: async () => await readV3AuthoritySnapshot(
              deps,
              preparation,
              await readDecomposeRecord(deps, receipt.receiptId),
            ),
            readRecord: async (recordId) => await readDecomposeRecord(deps, recordId),
            readFinalizedFacts: async (prepared, candidate) => {
              const machine = prepared.facts.completedMap.machine;
              const authoring = prepared.facts.completedMap.authoring;
              const receiptPath = resolveRetirementRecordRelativePath(candidate.receiptId);
              const sourceArtifacts = await readV3SourceArtifactInventory(deps, prepared);
              const managedPathResults = await Promise.all(prepared.facts.allowedPaths
                .filter((path) => path !== receiptPath)
                .map(async (rawPath) => {
                  const path = validateManagedPath(rawPath);
                  return {
                    path,
                    before: await readV3PathState(
                      deps,
                      prepared.facts.completedMap.machine.resultBase.head,
                      path,
                    ),
                    after: await readV3PathState(deps, null, path),
                  };
                }));
              return {
                preparation: prepared,
                receipt: candidate,
                sourceArtifactDigest: sourceArtifacts.digest,
                sourceArtifactInventory: sourceArtifacts.entries,
                sourceUnits: machine.sourceUnits,
                sourceAllocations: authoring.sourceAllocations,
                resultBaseHead: await resolveV3Ref(deps, machine.resultBase.ref),
                candidateOwnership: prepared.facts.candidateOwnership,
                destinationOutputs: candidate.finalized.destinationDigests.map(
                  ({ destinationId, outputs }) => ({ destinationId, outputs }),
                ),
                incomingEdges: machine.incomingEdges,
                outgoingEdges: machine.outgoingEdges,
                managedPathResults,
                transitionPatch: candidate.finalized.transitionPatch,
                topology: prepared.facts.topology,
                publication: candidate.finalized.publication,
              };
            },
            replaceAndStageRecord: async (recordId, expected, next) => {
              await replaceV3Record(deps, recordId, expected, next);
            },
          },
          receipt,
          snapshot.authorityVersion,
        );
      } catch (error) {
        return { status: "refused", reason: error instanceof Error ? error.message : "authority-unavailable" };
      }
    },
    prepare: async (allocation) => {
      try {
        const binding = await bindDecomposePreparation(deps, allocation);
        const id = receiptId({
          schemaVersion: 2,
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
        const transformedIncomingDependents = prepareTimeTransformedDependents(
          deps,
          allocation.origin.slug,
          binding.inventories.incomingEdgeInventory.map((edge) => edge.dependent),
          binding.allowedPaths,
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
              inventoryRead: binding.inventoryRead,
              transformedIncomingDependents,
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
        const transformedIncomingDependents = prepareTimeTransformedDependents(
          deps,
          record.allocation.origin.slug,
          binding.inventories.incomingEdgeInventory.map((edge) => edge.dependent),
          binding.allowedPaths,
        );
        if (canonicalize(binding.scope) !== canonicalize(record.locator.scope)
          || binding.sourceArtifactDigest !== record.sourceArtifactDigest
          || canonicalize(binding.inventories) !== canonicalize({
            sourceInventory: record.sourceInventory,
            incomingEdgeInventory: record.incomingEdgeInventory,
            outgoingEdgeInventory: record.outgoingEdgeInventory,
          })
          || canonicalize(binding.allowedPaths) !== canonicalize(record.allowedPaths)
          || (record.schemaVersion === 2
            && canonicalize(transformedIncomingDependents)
              !== canonicalize(record.transformedIncomingDependents))) {
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
        const index = deps.composed?.index
          ?? await buildLifecycleIndex({ cwd: deps.cwd, fs: deps.lifecycleFs });
        let currentInventories = inventories;
        if (deps.composed !== undefined) {
          const sourcePaths = [...new Set(record.sourceInventory.map((source) => source.sourcePath))];
          const sourceArtifacts = await Promise.all(sourcePaths.map(async (sourcePath) => {
            const path = validateManagedPath(sourcePath);
            const bytes = await deps.readBlob(record.locator.scope.source.head, path);
            if (bytes === null) throw new Error(`source artifact disappeared: ${sourcePath}`);
            return { path, bytes };
          }));
          const freshInventory = deriveDecomposeInventories({
            originSlug: origin,
            sourceArtifacts,
            lifecycleIndex: index,
          });
          if (freshInventory.status === "rejected") {
            return { status: "refused", reason: freshInventory.reason };
          }
          currentInventories = freshInventory.inventories;
        }
        const entries = new Map(record.allocation.entries.map((entry) => [entry.destinationId, entry]));
        const transformedDependents = record.schemaVersion === 2
          ? record.transformedIncomingDependents
          : record.incomingEdgeInventory.map((edge) => edge.dependent);
        const projection = async (): Promise<DecomposeFinalizationProjection> => {
          const patch = await readDecomposeStagedPatch(deps, resolveRetirementRecordRelativePath(id));
          const targets = (await Promise.all(
            record.allocation.entries.map((entry) => readDecomposeTargetGroup(deps, index, entry)),
          )).filter((target): target is DecomposeFinalTarget => target !== null);
          return {
            sourceArtifactDigest: record.sourceArtifactDigest,
            inventories: currentInventories,
            stagedPaths: patch.paths,
            transitionPatch: patch.operations,
            targets,
            inventoryRead: deps.composed?.readQuality ?? "tree-only",
            transformedIncomingDependents: [...transformedDependents],
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
              return parseMetaRecord(new TextDecoder().decode(bytes)).dependsOn;
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

function prepareTimeTransformedDependents(
  deps: InRepoDecomposeRetirementDeps,
  origin: string,
  incomingDependents: readonly string[],
  allowedPaths: readonly string[],
): string[] {
  const dependents = deps.composed === undefined
    ? incomingDependents
    : partitionTransformDependents(deps.composed, origin).flatMap((partition) =>
        partition.authority === "shared-visible"
          && partition.writablePath !== undefined
          && allowedPaths.includes(partition.writablePath)
          ? [partition.dependent]
          : []);
  return [...dependents].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
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
