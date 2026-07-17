/** Closed-schema decoder for finalized retirement receipts at an untrusted JSON boundary. */

import {
  canonicalize,
  isCanonicalDigest,
  type CanonicalDigest,
} from "../canonical/canonical-json.js";
import { isManagedPath, type ManagedPath } from "../canonical/managed-path.js";
import { receiptId, type RetirementTransition } from "../canonical/receipt-id.js";
import type { WorktreeSubject } from "../git/worktree-marker.js";
import { parseCutMap, type DecomposeAllocationMap } from "./decompose-cut-map.js";
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

function parseResult(value: unknown): RetirementReceipt["result"] | null {
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
  if (value.kind !== "decompose"
    || !hasExactKeys(value, [
      "kind",
      "preparationId",
      "allocation",
      "cutMapDigest",
      "sourceInventoryDigest",
      "incomingEdgeInventoryDigest",
      "outgoingEdgeInventoryDigest",
      "targets",
    ])) {
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
  return {
    kind: "decompose",
    preparationId: value.preparationId,
    allocation,
    cutMapDigest: value.cutMapDigest,
    sourceInventoryDigest: value.sourceInventoryDigest,
    incomingEdgeInventoryDigest: value.incomingEdgeInventoryDigest,
    outgoingEdgeInventoryDigest: value.outgoingEdgeInventoryDigest,
    targets,
  };
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
    if (canonicalize(parsed) !== content || !isObject(parsed) || !hasExactKeys(parsed, RECEIPT_KEYS)) return null;
    if (parsed.schemaVersion !== 1 || !isCanonicalDigest(parsed.receiptId)) return null;
    const subject = parseSubject(parsed.subject);
    const source = parseSource(parsed.source);
    const projection = parseProjection(parsed.retiringProjection);
    const result = parseResult(parsed.result);
    if (subject === null || source === null || projection === null || result === null
      || (parsed.transition !== "abandon" && parsed.transition !== "decompose" && parsed.transition !== "park-planning")
      || !isCanonicalDigest(parsed.transitionPatchDigest)
      || (parsed.authorization !== "discard-confirmed" && parsed.authorization !== "planning-relocated")) {
      return null;
    }
    const transition: RetirementTransition = parsed.transition;
    const expectedReceiptId = receiptId({
      schemaVersion: 1,
      subject,
      transition,
      sourceBranch: source.branch,
      sourceHead: source.head,
    });
    if (parsed.receiptId !== expectedReceiptId) return null;
    const receipt: RetirementReceipt = {
      schemaVersion: 1,
      receiptId: parsed.receiptId,
      subject,
      transition,
      source,
      transitionPatchDigest: parsed.transitionPatchDigest,
      retiringProjection: projection,
      authorization: parsed.authorization,
      result,
    };
    const expectedLifecycle = transition === "park-planning" ? "planned" : "nonexistent";
    const expectedProjection = transition === "decompose" ? "unchanged" : "direct-transition";
    if (
      validateReceiptMatrix(receipt, expectedLifecycle) !== null
      || receipt.retiringProjection.kind !== expectedProjection
    ) return null;
    return receipt;
  } catch {
    return null;
  }
}
