/** Final verification and atomic receipt replacement for decompose. */

import { canonicalDigest, canonicalize, type CanonicalDigest } from "../canonical/canonical-json.js";
import { artifactGroupDigest } from "../canonical/receipt-id.js";
import { patchDigest, type ArtifactSetEntry, type PatchOperation } from "../canonical/content-digest.js";
import { scanDecomposeContent, resolveDecomposeContentLocator } from "./decompose-content.js";
import { decomposeInventoryDigests, type DecomposeInventories } from "./decompose-inventory.js";
import { replaceDependencySlot } from "./decompose-sweep.js";
import { resolveRetirementRecordRelativePath } from "./retirement-record-store.js";
import type {
  DecomposePreparationLocator,
  DecomposePreparationRecord,
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
  | { status: "recorded"; receipt: RetirementReceipt; authorityVersion: string }
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

function parsePreparation(content: string, locator: DecomposePreparationLocator): DecomposePreparationRecord | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const envelope = parsed as Record<string, unknown>;
    if (envelope.kind !== "prepared-decompose" || envelope.schemaVersion !== 1) return null;
    const record = envelope as unknown as DecomposePreparationRecord;
    if (!equal(record.locator, locator)) return null;
    if (canonicalize(record) !== content) return null;
    return record;
  } catch {
    return null;
  }
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
): Promise<boolean> {
  const incoming = new Map(record.allocation.incomingEdges.map((edge) => [edge.dependent, edge.disposition]));
  for (const inventory of record.incomingEdgeInventory) {
    const disposition = incoming.get(inventory.dependent);
    if (disposition === undefined) return false;
    const replacements = disposition.kind === "replace" ? disposition.replacementTargets : [];
    const expected = replaceDependencySlot(inventory.currentTargets, record.allocation.origin.slug, replacements);
    const actual = await ctx.readDependsOn(inventory.dependent);
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
    const record = parsePreparation(stored, locator);
    if (record === null) return { status: "refused", reason: "evidence-mismatch" };
    const projection = await ctx.readProjection(record);
    const digests = decomposeInventoryDigests(projection.inventories);
    if (
      projection.sourceArtifactDigest !== record.sourceArtifactDigest
      || digests.sourceInventoryDigest !== record.sourceInventoryDigest
      || digests.incomingEdgeInventoryDigest !== record.incomingEdgeInventoryDigest
      || digests.outgoingEdgeInventoryDigest !== record.outgoingEdgeInventoryDigest
      || canonicalDigest(record.allocation) !== record.cutMapDigest
    ) return { status: "refused", reason: "authority-conflict" };
    if (!await sourceTargetsResolve(ctx, record) || !await dependencyResultsMatch(ctx, record)) {
      return { status: "refused", reason: "conservation-unproven" };
    }

    const recordPath = resolveRetirementRecordRelativePath(locator.receiptId);
    const nonRecordStaged = projection.stagedPaths.filter((path) => path !== recordPath);
    if (nonRecordStaged.some((path) => !record.allowedPaths.includes(path))) {
      return { status: "refused", reason: "evidence-mismatch" };
    }
    const patchPaths = projection.transitionPatch.map((operation) => operation.path);
    if (!sameSet(nonRecordStaged, patchPaths)) return { status: "refused", reason: "evidence-mismatch" };

    const targets = projection.targets
      .map((target) => ({ path: target.path, artifactDigest: artifactGroupDigest(target.entries) }))
      .sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
    const receipt: RetirementReceipt = {
      schemaVersion: 1,
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
    };
    await ctx.replaceAndStageRecord(locator.receiptId, stored, canonicalize(receipt), projection.stagedPaths);
    return {
      status: "recorded",
      receipt,
      authorityVersion: canonicalDigest({ previousAuthorityVersion: expectedAuthorityVersion, receipt }),
    };
  } catch (error) {
    return {
      status: "refused",
      reason: "authority-unavailable",
      diagnostic: error instanceof Error ? error.message : String(error),
    };
  }
}
