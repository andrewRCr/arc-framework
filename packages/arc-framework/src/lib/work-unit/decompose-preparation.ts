/** Durable compare-and-set preparation for decompose retirement. */

import {
  canonicalDigest,
  canonicalize,
  isCanonicalDigest,
  type CanonicalDigest,
} from "../canonical/canonical-json.js";
import { isManagedPath, type ManagedPath } from "../canonical/managed-path.js";
import { preparationId, receiptId } from "../canonical/receipt-id.js";
import {
  decomposeInventoryDigests,
  verifyDecomposeInventoryCoverage,
  type DecomposeInventories,
} from "./decompose-inventory.js";
import {
  parseCutMap,
  parseDecomposeContentLocator,
  retirementAllocationRefusal,
  type DecomposeAllocationMap,
} from "./decompose-cut-map.js";
import { resolveRetirementRecordRelativePath } from "./retirement-record-store.js";
import { isSlugSafe } from "./slug.js";
import type {
  DecomposePreparationRecord,
  PreparedDecomposeRetirement,
  RetirementAuthorityScope,
  TeardownAuthorizationRefusal,
} from "./retirement-authority.js";

export interface DecomposePreparationProjection {
  sourceArtifactDigest: CanonicalDigest;
  inventories: DecomposeInventories;
  allowedPaths: readonly ManagedPath[];
}

export interface DecomposePreparationContext {
  readAuthoritySnapshot(scope: RetirementAuthorityScope): Promise<{
    authorityVersion: string;
    recordState: "absent" | "prepared-decompose";
  }>;
  readProjection(scope: RetirementAuthorityScope): Promise<DecomposePreparationProjection>;
  readStagedPaths(): Promise<readonly string[]>;
  readRecord(receiptId: CanonicalDigest): Promise<string | null>;
  createRecord(receiptId: CanonicalDigest, content: string): Promise<void>;
  removeRecord(receiptId: CanonicalDigest): Promise<void>;
  stagePaths(paths: readonly string[]): Promise<void>;
}

export type DecomposePreparationResult =
  | { status: "prepared"; preparation: PreparedDecomposeRetirement }
  | { status: "refused"; reason: TeardownAuthorizationRefusal };

function compareCanonicalStrings(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: JsonObject, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function parseScope(value: unknown): RetirementAuthorityScope | null {
  if (!isObject(value) || !hasExactKeys(value, ["subject", "transition", "source", "resultProjection"])) return null;
  if (value.transition !== "decompose" || !isObject(value.subject)
    || !hasExactKeys(value.subject, ["kind", "name"])
    || value.subject.kind !== "work-unit" || !nonEmpty(value.subject.name) || !isSlugSafe(value.subject.name)
    || !isObject(value.source) || !hasExactKeys(value.source, ["branch", "head"])
    || !nonEmpty(value.source.branch) || !nonEmpty(value.source.head)
    || !isObject(value.resultProjection) || !hasExactKeys(value.resultProjection, ["ref", "head"])
    || !nonEmpty(value.resultProjection.ref) || !nonEmpty(value.resultProjection.head)) {
    return null;
  }
  return {
    subject: { kind: "work-unit", name: value.subject.name },
    transition: "decompose",
    source: { branch: value.source.branch, head: value.source.head },
    resultProjection: { ref: value.resultProjection.ref, head: value.resultProjection.head },
  };
}

function parseSourceInventory(value: unknown): DecomposeInventories["sourceInventory"] | null {
  if (!Array.isArray(value)) return null;
  const entries: DecomposeInventories["sourceInventory"] = [];
  let previousId: string | undefined;
  for (const candidate of value) {
    if (!isObject(candidate)
      || !hasExactKeys(candidate, ["sourceId", "sourcePath", "sourceLocator", "contentDigest"])
      || !isCanonicalDigest(candidate.sourceId)
      || typeof candidate.sourcePath !== "string" || !isManagedPath(candidate.sourcePath)
      || !isCanonicalDigest(candidate.contentDigest)) {
      return null;
    }
    const sourceLocator = parseDecomposeContentLocator(candidate.sourceLocator);
    if (sourceLocator === null
      || canonicalDigest({ schemaVersion: 2, sourcePath: candidate.sourcePath, sourceLocator }) !== candidate.sourceId
      || (previousId !== undefined && compareCanonicalStrings(previousId, candidate.sourceId) >= 0)) {
      return null;
    }
    previousId = candidate.sourceId;
    entries.push({
      sourceId: candidate.sourceId,
      sourcePath: candidate.sourcePath,
      sourceLocator,
      contentDigest: candidate.contentDigest,
    });
  }
  return entries;
}

function parseIncomingInventory(value: unknown): DecomposeInventories["incomingEdgeInventory"] | null {
  if (!Array.isArray(value)) return null;
  const entries: DecomposeInventories["incomingEdgeInventory"] = [];
  let previous: string | undefined;
  for (const candidate of value) {
    if (!isObject(candidate) || !hasExactKeys(candidate, ["dependent", "currentTargets"])
      || !nonEmpty(candidate.dependent) || !isSlugSafe(candidate.dependent)
      || !Array.isArray(candidate.currentTargets)
      || candidate.currentTargets.some((target) => !nonEmpty(target) || !isSlugSafe(target))) {
      return null;
    }
    const currentTargets = candidate.currentTargets as string[];
    if (new Set(currentTargets).size !== currentTargets.length
      || (previous !== undefined && compareCanonicalStrings(previous, candidate.dependent) >= 0)) {
      return null;
    }
    previous = candidate.dependent;
    entries.push({ dependent: candidate.dependent, currentTargets: [...currentTargets] });
  }
  return entries;
}

function parseOutgoingInventory(value: unknown): DecomposeInventories["outgoingEdgeInventory"] | null {
  if (!Array.isArray(value)) return null;
  const entries: DecomposeInventories["outgoingEdgeInventory"] = [];
  let previous: string | undefined;
  for (const candidate of value) {
    if (!isObject(candidate) || !hasExactKeys(candidate, ["prerequisite"])
      || !nonEmpty(candidate.prerequisite) || !isSlugSafe(candidate.prerequisite)
      || (previous !== undefined && compareCanonicalStrings(previous, candidate.prerequisite) >= 0)) {
      return null;
    }
    previous = candidate.prerequisite;
    entries.push({ prerequisite: candidate.prerequisite });
  }
  return entries;
}

function parseAllowedPaths(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const paths: string[] = [];
  let previous: string | undefined;
  for (const candidate of value) {
    if (typeof candidate !== "string" || !isManagedPath(candidate)
      || (previous !== undefined && compareCanonicalStrings(previous, candidate) >= 0)) {
      return null;
    }
    previous = candidate;
    paths.push(candidate);
  }
  return paths;
}

/** Decode and rederive one canonical prepared-decompose record. */
export function parseDecomposePreparationRecord(
  content: string,
  expectedReceiptId?: CanonicalDigest,
): DecomposePreparationRecord | null {
  try {
    const parsed: unknown = JSON.parse(content);
    if (canonicalize(parsed) !== content || !isObject(parsed)
      || !hasExactKeys(parsed, [
        "kind",
        "schemaVersion",
        "locator",
        "allocation",
        "sourceInventory",
        "incomingEdgeInventory",
        "outgoingEdgeInventory",
        "allowedPaths",
        "sourceArtifactDigest",
        "sourceInventoryDigest",
        "incomingEdgeInventoryDigest",
        "outgoingEdgeInventoryDigest",
        "cutMapDigest",
      ])
      || parsed.kind !== "prepared-decompose" || parsed.schemaVersion !== 1
      || !isObject(parsed.locator) || !hasExactKeys(parsed.locator, ["receiptId", "preparationId", "scope"])
      || !isCanonicalDigest(parsed.locator.receiptId) || !isCanonicalDigest(parsed.locator.preparationId)
      || (expectedReceiptId !== undefined && parsed.locator.receiptId !== expectedReceiptId)
      || !isCanonicalDigest(parsed.sourceArtifactDigest)
      || !isCanonicalDigest(parsed.sourceInventoryDigest)
      || !isCanonicalDigest(parsed.incomingEdgeInventoryDigest)
      || !isCanonicalDigest(parsed.outgoingEdgeInventoryDigest)
      || !isCanonicalDigest(parsed.cutMapDigest)) {
      return null;
    }
    const scope = parseScope(parsed.locator.scope);
    const allocationResult = parseCutMap(parsed.allocation);
    const sourceInventory = parseSourceInventory(parsed.sourceInventory);
    const incomingEdgeInventory = parseIncomingInventory(parsed.incomingEdgeInventory);
    const outgoingEdgeInventory = parseOutgoingInventory(parsed.outgoingEdgeInventory);
    const allowedPaths = parseAllowedPaths(parsed.allowedPaths);
    if (scope === null || allocationResult.status !== "parsed"
      || canonicalize(allocationResult.params) !== canonicalize(parsed.allocation)
      || sourceInventory === null || incomingEdgeInventory === null || outgoingEdgeInventory === null
      || allowedPaths === null) {
      return null;
    }
    const inventories = { sourceInventory, incomingEdgeInventory, outgoingEdgeInventory };
    const inventoryDigests = decomposeInventoryDigests(inventories);
    const cutMapDigest = canonicalDigest(allocationResult.params);
    const deterministicReceiptId = receiptId({
      schemaVersion: 1,
      subject: scope.subject,
      transition: "decompose",
      sourceBranch: scope.source.branch,
      sourceHead: scope.source.head,
    });
    const deterministicPreparationId = preparationId({
      receiptId: deterministicReceiptId,
      baseHead: scope.resultProjection.head,
      ...inventoryDigests,
      cutMapDigest,
    });
    if (parsed.locator.receiptId !== deterministicReceiptId
      || parsed.locator.preparationId !== deterministicPreparationId
      || parsed.sourceInventoryDigest !== inventoryDigests.sourceInventoryDigest
      || parsed.incomingEdgeInventoryDigest !== inventoryDigests.incomingEdgeInventoryDigest
      || parsed.outgoingEdgeInventoryDigest !== inventoryDigests.outgoingEdgeInventoryDigest
      || parsed.cutMapDigest !== cutMapDigest) {
      return null;
    }
    return {
      kind: "prepared-decompose",
      schemaVersion: 1,
      locator: {
        receiptId: deterministicReceiptId,
        preparationId: deterministicPreparationId,
        scope,
      },
      allocation: allocationResult.params,
      ...inventories,
      allowedPaths,
      sourceArtifactDigest: parsed.sourceArtifactDigest,
      ...inventoryDigests,
      cutMapDigest,
    };
  } catch {
    return null;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

/** Persist or idempotently resume one exact decompose preparation. */
export async function prepareDecomposeRetirement(
  ctx: DecomposePreparationContext,
  scope: RetirementAuthorityScope,
  allocation: DecomposeAllocationMap,
  expectedAuthorityVersion: string,
): Promise<DecomposePreparationResult> {
  try {
    if (scope.transition !== "decompose") return { status: "refused", reason: "unsupported-transition" };
    const snapshot = await ctx.readAuthoritySnapshot(scope);
    if (snapshot.authorityVersion !== expectedAuthorityVersion) {
      return { status: "refused", reason: "authority-conflict" };
    }
    const projection = await ctx.readProjection(scope);
    if (verifyDecomposeInventoryCoverage(allocation, projection.inventories).status !== "covered") {
      return { status: "refused", reason: "conservation-unproven" };
    }
    if (retirementAllocationRefusal(allocation) !== null) {
      return { status: "refused", reason: "conservation-unproven" };
    }

    const cutMapDigest = canonicalDigest(allocation);
    const inventoryDigests = decomposeInventoryDigests(projection.inventories);
    const deterministicReceiptId = receiptId({
      schemaVersion: 1,
      subject: scope.subject,
      transition: "decompose",
      sourceBranch: scope.source.branch,
      sourceHead: scope.source.head,
    });
    const deterministicPreparationId = preparationId({
      receiptId: deterministicReceiptId,
      baseHead: scope.resultProjection.head,
      ...inventoryDigests,
      cutMapDigest,
    });
    const locator = {
      receiptId: deterministicReceiptId,
      preparationId: deterministicPreparationId,
      scope,
    };
    const record: DecomposePreparationRecord = {
      kind: "prepared-decompose",
      schemaVersion: 1,
      locator,
      allocation,
      sourceInventory: projection.inventories.sourceInventory,
      incomingEdgeInventory: projection.inventories.incomingEdgeInventory,
      outgoingEdgeInventory: projection.inventories.outgoingEdgeInventory,
      allowedPaths: [...projection.allowedPaths].sort(compareCanonicalStrings),
      sourceArtifactDigest: projection.sourceArtifactDigest,
      ...inventoryDigests,
      cutMapDigest,
    };
    const content = canonicalize(record);
    const recordPath = resolveRetirementRecordRelativePath(deterministicReceiptId);
    const stagedPaths = [...await ctx.readStagedPaths()].sort(compareCanonicalStrings);
    const existing = await ctx.readRecord(deterministicReceiptId);
    if (existing !== null) {
      if (snapshot.recordState !== "prepared-decompose" || existing !== content) {
        return { status: "refused", reason: "authority-conflict" };
      }
      const admitted = new Set([recordPath, ...record.allowedPaths]);
      if (!stagedPaths.includes(recordPath) || stagedPaths.some((path) => !admitted.has(path))) {
        return { status: "refused", reason: "authority-conflict" };
      }
      return {
        status: "prepared",
        preparation: { locator, record, authorityVersion: snapshot.authorityVersion },
      };
    } else if (snapshot.recordState !== "absent" || stagedPaths.length !== 0) {
      return { status: "refused", reason: "authority-conflict" };
    }

    try {
      await ctx.createRecord(deterministicReceiptId, content);
    } catch (error) {
      if (isNodeError(error) && error.code === "EEXIST") {
        return { status: "refused", reason: "authority-conflict" };
      }
      throw error;
    }
    try {
      await ctx.stagePaths([recordPath]);
    } catch {
      await ctx.removeRecord(deterministicReceiptId).catch(() => {});
      return { status: "refused", reason: "authority-unavailable" };
    }
    const preparedSnapshot = await ctx.readAuthoritySnapshot(scope);
    if (preparedSnapshot.recordState !== "prepared-decompose") {
      return { status: "refused", reason: "authority-conflict" };
    }
    return {
      status: "prepared",
      preparation: { locator, record, authorityVersion: preparedSnapshot.authorityVersion },
    };
  } catch {
    return { status: "refused", reason: "authority-unavailable" };
  }
}
