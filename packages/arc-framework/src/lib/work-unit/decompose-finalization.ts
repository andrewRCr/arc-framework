/** Final verification and atomic receipt replacement for decompose. */

import { canonicalDigest, canonicalize, type CanonicalDigest } from "../canonical/canonical-json.js";
import { artifactGroupDigest } from "../canonical/receipt-id.js";
import { patchDigest, type ArtifactSetEntry, type PatchOperation } from "../canonical/content-digest.js";
import { scanDecomposeContent, resolveDecomposeContentLocator } from "./decompose-content.js";
import { newMemberDependencies, type DecomposeAllocationMap } from "./decompose-cut-map.js";
import { parseDecomposePreparationRecord } from "./decompose-preparation.js";
import { decomposeInventoryDigests, type DecomposeInventories } from "./decompose-inventory.js";
import { replaceDependencySlot } from "./decompose-sweep.js";
import {
  deriveDecomposeSuccessorCandidates,
  projectPendingRetirementLifecycle,
  type RetirementLifecycleResult,
} from "./retirement-lifecycle-result.js";
import { resolveRetirementRecordRelativePath } from "./retirement-record-store.js";
import type {
  DecomposePreparationLocator,
  DecomposePreparationRecord,
  InventoryRead,
  RetirementReceipt,
  TeardownAuthorizationRefusal,
} from "./retirement-authority.js";

export interface DecomposeFinalTarget {
  path: string;
  entries: readonly ArtifactSetEntry[];
}

export interface DecomposeFinalizationProjection {
  sourceArtifactDigest: CanonicalDigest;
  inventories: DecomposeInventories;
  stagedPaths: readonly string[];
  transitionPatch: readonly PatchOperation[];
  targets: readonly DecomposeFinalTarget[];
  inventoryRead: Exclude<InventoryRead, "not-applicable">;
  transformedIncomingDependents: readonly string[];
}

export interface DecomposeFinalizationContext {
  readAuthoritySnapshot(locator: DecomposePreparationLocator): Promise<{
    authorityVersion: string;
    recordState: "absent" | "prepared-decompose";
  }>;
  readRecord(receiptId: CanonicalDigest): Promise<string | null>;
  readProjection(record: DecomposePreparationRecord): Promise<DecomposeFinalizationProjection>;
  readTargetArtifact(destinationId: string, artifact: string): Promise<Uint8Array | null>;
  readDependsOn(slug: string): Promise<readonly string[] | null>;
  replaceAndStageRecord(
    receiptId: CanonicalDigest,
    expectedContent: string,
    nextContent: string,
    stagedPaths: readonly string[],
  ): Promise<void>;
}

export type DecomposeFinalizationResult =
  | {
      status: "recorded";
      receipt: RetirementReceipt;
      authorityVersion: string;
      lifecycle: RetirementLifecycleResult;
    }
  | { status: "refused"; reason: TeardownAuthorizationRefusal; diagnostic?: string };

function equal(left: unknown, right: unknown): boolean {
  return canonicalize(left) === canonicalize(right);
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return equal(sorted(left), sorted(right));
}

function inventoryQualityDoesNotRegress(
  record: DecomposePreparationRecord,
  current: Exclude<InventoryRead, "not-applicable">,
): boolean {
  if (record.schemaVersion === 1) return true;
  if (record.inventoryRead === "reachable") return current === "reachable";
  if (record.inventoryRead === "degraded") return current === "degraded" || current === "reachable";
  return current === "tree-only" || current === "reachable";
}

async function sourceTargetsResolve(
  ctx: DecomposeFinalizationContext,
  record: DecomposePreparationRecord,
): Promise<boolean> {
  for (const allocation of record.allocation.sourceAllocations) {
    if (allocation.disposition.kind === "drop") continue;
    const { destinationId, targetLocator } = allocation.disposition;
    const bytes = await ctx.readTargetArtifact(destinationId, targetLocator.artifact);
    if (bytes === null) return false;
    const scan = scanDecomposeContent(targetLocator.artifact, bytes);
    if (scan.status === "rejected") return false;
    if (resolveDecomposeContentLocator(scan.units, targetLocator, targetLocator.artifact).status !== "resolved") return false;
  }
  return true;
}

async function dependencyResultsMatch(
  ctx: DecomposeFinalizationContext,
  record: DecomposePreparationRecord,
  transformedIncomingDependents: ReadonlySet<string>,
): Promise<boolean> {
  const incoming = new Map<string, DecomposeAllocationMap["incomingEdges"][number]["disposition"]>(
    record.allocation.incomingEdges.map((edge) => [edge.dependent, edge.disposition]),
  );
  for (const inventory of record.incomingEdgeInventory) {
    if (!transformedIncomingDependents.has(inventory.dependent)) continue;
    const disposition = incoming.get(inventory.dependent);
    if (disposition === undefined) return false;
    const replacements = disposition.kind === "replace" ? disposition.replacementTargets : [];
    const expected = replaceDependencySlot(inventory.currentTargets, record.allocation.origin.slug, replacements);
    const actual = await ctx.readDependsOn(inventory.dependent);
    if (actual === null || !equal(actual, expected)) return false;
  }

  for (const entry of record.allocation.entries) {
    if (entry.kind !== "new-member") continue;
    const expected = newMemberDependencies(record.allocation, entry.slug);
    const actual = await ctx.readDependsOn(entry.slug);
    if (actual === null || !equal(actual, expected)) return false;
  }

  const recipients = record.allocation.entries.flatMap((entry) => {
    if (entry.kind === "new-member") return [entry.slug];
    if (entry.kind === "existing-home" && entry.target.kind === "work-unit") return [entry.target.slug];
    return [];
  });
  for (const edge of record.allocation.outgoingEdges) {
    const expected = edge.disposition.kind === "targets" ? edge.disposition.targets : [];
    const actual: string[] = [];
    for (const recipient of recipients) {
      if ((await ctx.readDependsOn(recipient))?.includes(edge.prerequisite) === true) actual.push(recipient);
    }
    if (!equal(sorted(actual), sorted(expected))) return false;
  }
  return true;
}

/** Verify the prepared result and atomically replace preparation with receipt. */
export async function finalizeDecomposeRetirement(
  ctx: DecomposeFinalizationContext,
  locator: DecomposePreparationLocator,
  expectedAuthorityVersion: string,
): Promise<DecomposeFinalizationResult> {
  try {
    const snapshot = await ctx.readAuthoritySnapshot(locator);
    if (snapshot.authorityVersion !== expectedAuthorityVersion || snapshot.recordState !== "prepared-decompose") {
      return { status: "refused", reason: "authority-conflict" };
    }
    const stored = await ctx.readRecord(locator.receiptId);
    if (stored === null) return { status: "refused", reason: "evidence-missing" };
    const record = parseDecomposePreparationRecord(stored, locator.receiptId);
    if (record === null || !equal(record.locator, locator)) {
      return { status: "refused", reason: "evidence-mismatch", diagnostic: "prepared locator changed" };
    }
    const projection = await ctx.readProjection(record);
    if (!inventoryQualityDoesNotRegress(record, projection.inventoryRead)) {
      return { status: "refused", reason: "authority-conflict" };
    }
    const digests = decomposeInventoryDigests(projection.inventories);
    const transformedIncomingDependents = sorted(projection.transformedIncomingDependents);
    const incomingDependents = new Set(record.incomingEdgeInventory.map((edge) => edge.dependent));
    if (
      projection.sourceArtifactDigest !== record.sourceArtifactDigest
      || digests.sourceInventoryDigest !== record.sourceInventoryDigest
      || digests.incomingEdgeInventoryDigest !== record.incomingEdgeInventoryDigest
      || digests.outgoingEdgeInventoryDigest !== record.outgoingEdgeInventoryDigest
      || canonicalDigest(record.allocation) !== record.cutMapDigest
      || !equal(projection.transformedIncomingDependents, transformedIncomingDependents)
      || new Set(transformedIncomingDependents).size !== transformedIncomingDependents.length
      || transformedIncomingDependents.some((dependent) => !incomingDependents.has(dependent))
      || (record.schemaVersion === 2
        && !equal(transformedIncomingDependents, record.transformedIncomingDependents))
    ) return { status: "refused", reason: "authority-conflict" };
    if (!await sourceTargetsResolve(ctx, record)
      || !await dependencyResultsMatch(ctx, record, new Set(transformedIncomingDependents))) {
      return { status: "refused", reason: "conservation-unproven" };
    }

    const recordPath = resolveRetirementRecordRelativePath(locator.receiptId);
    if (!projection.stagedPaths.includes(recordPath)) {
      return { status: "refused", reason: "evidence-mismatch", diagnostic: "prepared record is not staged" };
    }
    const nonRecordStaged = projection.stagedPaths.filter((path) => path !== recordPath);
    if (nonRecordStaged.some((path) => !record.allowedPaths.includes(path))) {
      return { status: "refused", reason: "evidence-mismatch", diagnostic: "a staged path is outside preparation" };
    }
    const patchPaths = projection.transitionPatch.map((operation) => operation.path);
    if (!sameSet(nonRecordStaged, patchPaths)) {
      return { status: "refused", reason: "evidence-mismatch", diagnostic: "staged patch paths do not match" };
    }

    const targets = projection.targets
      .map((target) => ({ path: target.path, artifactDigest: artifactGroupDigest(target.entries) }))
      .sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
    const receiptBase = {
      receiptId: locator.receiptId,
      subject: locator.scope.subject,
      transition: "decompose",
      source: {
        branch: locator.scope.source.branch,
        head: locator.scope.source.head,
        artifactDigest: record.sourceArtifactDigest,
      },
      transitionPatchDigest: patchDigest(projection.transitionPatch),
      retiringProjection: { kind: "unchanged" },
      authorization: "discard-confirmed",
      result: {
        kind: "decompose",
        preparationId: locator.preparationId,
        allocation: record.allocation,
        cutMapDigest: record.cutMapDigest,
        sourceInventoryDigest: record.sourceInventoryDigest,
        incomingEdgeInventoryDigest: record.incomingEdgeInventoryDigest,
        outgoingEdgeInventoryDigest: record.outgoingEdgeInventoryDigest,
        targets,
      },
    } as const;
    const receipt: RetirementReceipt = record.schemaVersion === 1
      ? { ...receiptBase, schemaVersion: 1 }
      : {
          ...receiptBase,
          schemaVersion: 2,
          inventoryRead: record.inventoryRead,
          result: {
            ...receiptBase.result,
            sourceInventory: record.sourceInventory,
            incomingEdgeInventory: record.incomingEdgeInventory,
            outgoingEdgeInventory: record.outgoingEdgeInventory,
            transformedIncomingDependents,
          },
        };
    await ctx.replaceAndStageRecord(locator.receiptId, stored, canonicalize(receipt), projection.stagedPaths);
    const authorityVersion = canonicalDigest({ previousAuthorityVersion: expectedAuthorityVersion, receipt });
    return {
      status: "recorded",
      receipt,
      authorityVersion,
      lifecycle: projectPendingRetirementLifecycle({
        slug: record.allocation.origin.slug,
        branch: receipt.source.branch,
        transition: "decompose",
        receiptId: receipt.receiptId,
        authorityVersion,
        successorCandidates: deriveDecomposeSuccessorCandidates(record.allocation),
      }),
    };
  } catch (error) {
    return {
      status: "refused",
      reason: "authority-unavailable",
      diagnostic: error instanceof Error ? error.message : String(error),
    };
  }
}
