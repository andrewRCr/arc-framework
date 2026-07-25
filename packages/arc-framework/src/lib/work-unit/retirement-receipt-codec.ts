/** Closed-schema decoder for finalized retirement receipts at an untrusted JSON boundary. */

import {
  canonicalDigest,
  canonicalize,
  isCanonicalDigest,
  type CanonicalDigest,
} from "../canonical/canonical-json.js";
import { isManagedPath, type ManagedPath } from "../canonical/managed-path.js";
import { receiptId, type RetirementTransition } from "../canonical/receipt-id.js";
import type { WorktreeSubject } from "../git/worktree-marker.js";
import { SlugSchema } from "../kernel/schema/slug.js";
import { parseCutMap, type DecomposeAllocationMap } from "./decompose-cut-map.js";
import {
  parseIncomingInventory,
  parseOutgoingInventory,
  parseSourceInventory,
} from "./decompose-preparation.js";
import { decomposeInventoryDigests } from "./decompose-inventory.js";
import { validateReceiptMatrix, type RetirementReceipt } from "./retirement-authority.js";

type JsonObject = Record<string, unknown>;
type DecomposeResult = Extract<RetirementReceipt["result"], { kind: "decompose" }>;

const RECEIPT_KEYS = [
  "schemaVersion",
  "receiptId",
  "subject",
  "transition",
  "source",
  "transitionPatchDigest",
  "retiringProjection",
  "authorization",
  "result",
] as const;
const RECEIPT_V2_KEYS = [...RECEIPT_KEYS, "inventoryRead"] as const;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: JsonObject, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function parseSubject(value: unknown): WorktreeSubject | null {
  if (!isObject(value) || typeof value.kind !== "string") return null;
  switch (value.kind) {
    case "work-unit":
      return hasExactKeys(value, ["kind", "name"]) && typeof value.name === "string"
        ? { kind: "work-unit", name: value.name }
        : null;
    case "errand":
      return hasExactKeys(value, ["kind", "slug"]) && typeof value.slug === "string"
        ? { kind: "errand", slug: value.slug }
        : null;
    case "branch":
      return hasExactKeys(value, ["kind", "ref"]) && typeof value.ref === "string"
        ? { kind: "branch", ref: value.ref }
        : null;
    default:
      return null;
  }
}

function parseSource(value: unknown): RetirementReceipt["source"] | null {
  if (!isObject(value) || !hasExactKeys(value, ["branch", "head", "artifactDigest"])) return null;
  return typeof value.branch === "string"
      && value.branch.trim() !== ""
      && typeof value.head === "string"
      && value.head.trim() !== ""
      && isCanonicalDigest(value.artifactDigest)
    ? {
        branch: value.branch,
        head: value.head,
        artifactDigest: value.artifactDigest,
      }
    : null;
}

function parseProjection(value: unknown): RetirementReceipt["retiringProjection"] | null {
  if (!isObject(value) || !hasExactKeys(value, ["kind"])) return null;
  return value.kind === "direct-transition" || value.kind === "unchanged"
    ? { kind: value.kind }
    : null;
}

function parseAllocation(value: unknown): DecomposeAllocationMap | null {
  const parsed = parseCutMap(value);
  if (parsed.status !== "parsed") return null;
  return canonicalize(parsed.params) === canonicalize(value) ? parsed.params : null;
}

function compareCanonicalPath(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function parseTargets(value: unknown): DecomposeResult["targets"] {
  if (!Array.isArray(value)) return [];
  const targets: Array<{ path: ManagedPath; artifactDigest: CanonicalDigest }> = [];
  const paths = new Set<string>();
  let previousPath: string | undefined;
  for (const item of value) {
    if (!isObject(item) || !hasExactKeys(item, ["path", "artifactDigest"])
      || typeof item.path !== "string"
      || !isManagedPath(item.path)
      || !isCanonicalDigest(item.artifactDigest)
      || paths.has(item.path)
      || (previousPath !== undefined && compareCanonicalPath(previousPath, item.path) >= 0)) {
      return [];
    }
    paths.add(item.path);
    previousPath = item.path;
    targets.push({ path: item.path, artifactDigest: item.artifactDigest });
  }
  return targets;
}

function parseCanonicalSlugs(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const slugs: string[] = [];
  let previous: string | undefined;
  for (const candidate of value) {
    const parsed = SlugSchema.safeParse(candidate);
    if (!parsed.success || (previous !== undefined && compareCanonicalPath(previous, parsed.data) >= 0)) return null;
    slugs.push(parsed.data);
    previous = parsed.data;
  }
  return slugs;
}

function parseResult(value: unknown, schemaVersion: 1 | 2): RetirementReceipt["result"] | null {
  if (!isObject(value) || typeof value.kind !== "string") return null;
  if (value.kind === "discard") {
    return hasExactKeys(value, ["kind", "artifactDigest"]) && value.artifactDigest === "absent"
      ? { kind: "discard", artifactDigest: "absent" }
      : null;
  }
  if (value.kind === "relocate") {
    return hasExactKeys(value, ["kind", "plannedArtifactDigest"]) && isCanonicalDigest(value.plannedArtifactDigest)
      ? { kind: "relocate", plannedArtifactDigest: value.plannedArtifactDigest }
      : null;
  }
  if (value.kind === "rename") {
    const targetSlug = SlugSchema.safeParse(value.targetSlug);
    return hasExactKeys(value, ["kind", "targetSlug", "artifactDigest"])
        && targetSlug.success
        && isCanonicalDigest(value.artifactDigest)
      ? { kind: "rename", targetSlug: targetSlug.data, artifactDigest: value.artifactDigest }
      : null;
  }
  const decomposeKeys = [
      "kind",
      "preparationId",
      "allocation",
      "cutMapDigest",
      "sourceInventoryDigest",
      "incomingEdgeInventoryDigest",
      "outgoingEdgeInventoryDigest",
      "targets",
    ];
  const v2DecomposeKeys = [
    ...decomposeKeys,
    "sourceInventory",
    "incomingEdgeInventory",
    "outgoingEdgeInventory",
    "transformedIncomingDependents",
  ];
  if (value.kind !== "decompose"
    || !hasExactKeys(value, schemaVersion === 1 ? decomposeKeys : v2DecomposeKeys)) {
    return null;
  }
  const allocation = parseAllocation(value.allocation);
  if (allocation === null
    || !isCanonicalDigest(value.preparationId)
    || !isCanonicalDigest(value.cutMapDigest)
    || !isCanonicalDigest(value.sourceInventoryDigest)
    || !isCanonicalDigest(value.incomingEdgeInventoryDigest)
    || !isCanonicalDigest(value.outgoingEdgeInventoryDigest)) {
    return null;
  }
  const targets = parseTargets(value.targets);
  if (!Array.isArray(value.targets) || targets.length !== value.targets.length) return null;
  const sourceInventory = schemaVersion === 2 ? parseSourceInventory(value.sourceInventory) : undefined;
  const incomingEdgeInventory = schemaVersion === 2 ? parseIncomingInventory(value.incomingEdgeInventory) : undefined;
  const outgoingEdgeInventory = schemaVersion === 2 ? parseOutgoingInventory(value.outgoingEdgeInventory) : undefined;
  const transformedIncomingDependents = schemaVersion === 2
    ? parseCanonicalSlugs(value.transformedIncomingDependents)
    : undefined;
  if (schemaVersion === 2
    && (sourceInventory === null
      || incomingEdgeInventory === null
      || outgoingEdgeInventory === null
      || transformedIncomingDependents === null)) return null;
  const result = {
    kind: "decompose",
    preparationId: value.preparationId,
    allocation,
    cutMapDigest: value.cutMapDigest,
    sourceInventoryDigest: value.sourceInventoryDigest,
    incomingEdgeInventoryDigest: value.incomingEdgeInventoryDigest,
    outgoingEdgeInventoryDigest: value.outgoingEdgeInventoryDigest,
    targets,
  } as const;
  if (schemaVersion === 1) return result;
  if (sourceInventory === null || sourceInventory === undefined
    || incomingEdgeInventory === null || incomingEdgeInventory === undefined
    || outgoingEdgeInventory === null || outgoingEdgeInventory === undefined
    || transformedIncomingDependents === null || transformedIncomingDependents === undefined) return null;
  return {
    ...result,
    sourceInventory,
    incomingEdgeInventory,
    outgoingEdgeInventory,
    transformedIncomingDependents,
  };
}

function validV2DecomposeInventories(result: DecomposeResult): boolean {
  const source = result.sourceInventory;
  const incoming = result.incomingEdgeInventory;
  const outgoing = result.outgoingEdgeInventory;
  const transformed = result.transformedIncomingDependents;
  return source !== undefined
    && incoming !== undefined
    && outgoing !== undefined
    && transformed !== undefined
    && transformed.every((dependent) => incoming.some((edge) => edge.dependent === dependent))
    && canonicalize(decomposeInventoryDigests({
      sourceInventory: source,
      incomingEdgeInventory: incoming,
      outgoingEdgeInventory: outgoing,
    })) === canonicalize({
      sourceInventoryDigest: result.sourceInventoryDigest,
      incomingEdgeInventoryDigest: result.incomingEdgeInventoryDigest,
      outgoingEdgeInventoryDigest: result.outgoingEdgeInventoryDigest,
    });
}

/**
 * Decode one finalized retirement receipt from canonical JSON.
 *
 * @param content - Untrusted receipt JSON content
 * @returns The fully narrowed receipt, or `null` when parsing or validation fails
 */
export function parseRetirementReceipt(content: string): RetirementReceipt | null {
  try {
    const parsed: unknown = JSON.parse(content);
    if (canonicalize(parsed) !== content || !isObject(parsed)) return null;
    const schemaVersion = parsed.schemaVersion;
    if ((schemaVersion !== 1 && schemaVersion !== 2)
      || !hasExactKeys(parsed, schemaVersion === 1 ? RECEIPT_KEYS : RECEIPT_V2_KEYS)
      || !isCanonicalDigest(parsed.receiptId)
      || (schemaVersion === 2
        && parsed.inventoryRead !== "not-applicable"
        && parsed.inventoryRead !== "tree-only"
        && parsed.inventoryRead !== "reachable"
        && parsed.inventoryRead !== "degraded")) return null;
    const subject = parseSubject(parsed.subject);
    const source = parseSource(parsed.source);
    const projection = parseProjection(parsed.retiringProjection);
    const result = parseResult(parsed.result, schemaVersion);
    if (subject === null || source === null || projection === null || result === null
      || (schemaVersion === 2
        && ((subject.kind === "work-unit") === (parsed.inventoryRead === "not-applicable")))
      || (parsed.transition !== "abandon"
        && parsed.transition !== "decompose"
        && parsed.transition !== "park-planning"
        && parsed.transition !== "rename")
      || !isCanonicalDigest(parsed.transitionPatchDigest)
      || (parsed.authorization !== "discard-confirmed"
        && parsed.authorization !== "planning-relocated"
        && parsed.authorization !== "identity-renamed")) {
      return null;
    }
    const transition: RetirementTransition = parsed.transition;
    const expectedReceiptId = receiptId({
      schemaVersion,
      subject,
      transition,
      sourceBranch: source.branch,
      sourceHead: source.head,
    });
    if (parsed.receiptId !== expectedReceiptId) return null;
    const common = {
      receiptId: parsed.receiptId,
      subject,
      transition,
      source,
      transitionPatchDigest: parsed.transitionPatchDigest,
      retiringProjection: projection,
      authorization: parsed.authorization,
      result,
    } as const;
    const receipt: RetirementReceipt = schemaVersion === 1
      ? { ...common, schemaVersion: 1 }
      : {
          ...common,
          schemaVersion: 2,
          inventoryRead: parsed.inventoryRead as "not-applicable" | "tree-only" | "reachable" | "degraded",
        };
    const expectedLifecycle = transition === "park-planning" ? "planned" : "nonexistent";
    const expectedProjection = transition === "decompose" ? "unchanged" : "direct-transition";
    if (
      validateReceiptMatrix(receipt, expectedLifecycle) !== null
      || receipt.retiringProjection.kind !== expectedProjection
      || (receipt.result.kind === "decompose"
        && (receipt.subject.kind !== "work-unit"
          || receipt.result.allocation.origin.slug !== receipt.subject.name
          || canonicalDigest(receipt.result.allocation) !== receipt.result.cutMapDigest
          || (receipt.schemaVersion === 2
            && !validV2DecomposeInventories(receipt.result))))
      || (receipt.result.kind === "rename"
        && (receipt.subject.kind !== "work-unit"
          || receipt.result.targetSlug === receipt.subject.name))
    ) return null;
    return receipt;
  } catch {
    return null;
  }
}
