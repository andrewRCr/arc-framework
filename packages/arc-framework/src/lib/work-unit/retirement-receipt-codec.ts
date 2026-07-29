/** Closed-schema decoder for finalized retirement receipts at an untrusted JSON boundary. */

import {
  canonicalize,
  isCanonicalDigest,
} from "../canonical/canonical-json.js";
import { receiptId } from "../canonical/receipt-id.js";
import type { WorktreeSubject } from "../git/worktree-marker.js";
import { SlugSchema } from "../kernel/schema/slug.js";
import {
  parseV3DecomposePreparation,
  type V3DecomposePreparation,
} from "./decompose-v3-preparation.js";
import {
  parseV3DecomposeReceipt,
  type V3DecomposeReceipt,
} from "./decompose-v3-receipt.js";
import { validateReceiptMatrix, type RetirementReceipt } from "./retirement-authority.js";

type JsonObject = Record<string, unknown>;

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
  if (value.kind === "rename") {
    const targetSlug = SlugSchema.safeParse(value.targetSlug);
    return hasExactKeys(value, ["kind", "targetSlug", "artifactDigest"])
        && targetSlug.success
        && isCanonicalDigest(value.artifactDigest)
      ? { kind: "rename", targetSlug: targetSlug.data, artifactDigest: value.artifactDigest }
      : null;
  }
  return null;
}

/** One fully authenticated receipt arm in the shared retirement namespace. */
export type ParsedRetirementReceiptRecord =
  | { kind: "retained"; receipt: RetirementReceipt }
  | { kind: "v3-decomposition"; receipt: V3DecomposeReceipt };

/** One authenticated record arm in the complete retirement namespace. */
export type ParsedRetirementRecord =
  | ParsedRetirementReceiptRecord
  | { kind: "v3-decomposition-preparation"; preparation: V3DecomposePreparation };

/**
 * Discriminate and authenticate one canonical retirement record.
 *
 * @param content - Untrusted canonical record JSON
 * @returns One complete retained, v3 preparation, or v3 receipt arm
 */
export function parseRetirementRecord(content: string): ParsedRetirementRecord | null {
  let candidate: unknown;
  try {
    candidate = JSON.parse(content) as unknown;
  } catch {
    return null;
  }
  if (canonicalize(candidate) !== content || !isObject(candidate)) return null;
  if (candidate.schemaVersion === 3) {
    if (candidate.kind === "prepared-decompose") {
      const preparation = parseV3DecomposePreparation(candidate);
      return preparation === null
        ? null
        : { kind: "v3-decomposition-preparation", preparation };
    }
    if (candidate.kind === "decompose-receipt") {
      const receipt = parseV3DecomposeReceipt(candidate);
      return receipt === null ? null : { kind: "v3-decomposition", receipt };
    }
    return null;
  }
  if (candidate.schemaVersion !== 1 && candidate.schemaVersion !== 2) return null;
  const receipt = parseRetirementReceipt(content);
  return receipt === null ? null : { kind: "retained", receipt };
}

/**
 * Authenticate only terminal receipt arms from the shared namespace.
 *
 * @param content - Untrusted canonical record JSON
 * @returns One retained or v3 decomposition receipt, or `null`
 */
export function parseRetirementReceiptRecord(content: string): ParsedRetirementReceiptRecord | null {
  const record = parseRetirementRecord(content);
  return record?.kind === "v3-decomposition-preparation" ? null : record;
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
    if (parsed.transition === "decompose") return null;
    const subject = parseSubject(parsed.subject);
    const source = parseSource(parsed.source);
    const projection = parseProjection(parsed.retiringProjection);
    const result = parseResult(parsed.result);
    if (subject === null || source === null || projection === null || result === null
      || (schemaVersion === 2
        && ((subject.kind === "work-unit") === (parsed.inventoryRead === "not-applicable")))
      || (parsed.transition !== "abandon"
        && parsed.transition !== "park-planning"
        && parsed.transition !== "rename")
      || !isCanonicalDigest(parsed.transitionPatchDigest)
      || (parsed.authorization !== "discard-confirmed"
        && parsed.authorization !== "planning-relocated"
        && parsed.authorization !== "identity-renamed")) {
      return null;
    }
    const transition: RetirementReceipt["transition"] = parsed.transition;
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
    const projectionMatches = transition === "abandon"
      || receipt.retiringProjection.kind === "direct-transition";
    if (
      validateReceiptMatrix(receipt, expectedLifecycle) !== null
      || !projectionMatches
      || (receipt.result.kind === "rename"
        && (receipt.subject.kind !== "work-unit"
          || receipt.result.targetSlug === receipt.subject.name))
    ) return null;
    return receipt;
  } catch {
    return null;
  }
}
