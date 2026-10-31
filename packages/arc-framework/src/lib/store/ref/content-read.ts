/** Canonical content decoding and actionable per-record read defects. */

import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import { LineageRecordSchema } from "../kinds/lineage/index.js";
import { sameOwner, type RecordReference } from "../identity.js";
import { ConflictRecordSchema } from "../conflict.js";
import type { KindDefinition } from "../registry.js";
import { PROJECTED_RECORD_MAX_BYTES } from "../limits.js";
import type { ListingDiagnostic } from "../read.js";

/** A content defect whose diagnostic receives its stored path at the caller. */
export interface ContentProblem { kind: ListingDiagnostic["kind"]; condition: string }
/** Parsed content retains exact prose bytes and canonicalizes never-projected JSON. */
export function readRefContent(kind: KindDefinition, bytes: Uint8Array, pointRead = false): { content: string; fields?: unknown } | ContentProblem {
  if (kind.projection !== "never" && bytes.byteLength > PROJECTED_RECORD_MAX_BYTES) {
    return { kind: "oversized", condition: `Projected records cannot exceed ${PROJECTED_RECORD_MAX_BYTES} UTF-8 bytes` };
  }
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: kind.projection !== "never" }).decode(bytes);
    if (kind.projection === "never") content = canonicalize(JSON.parse(content));
  } catch (error) { return { kind: "malformed", condition: `Stored content is invalid: ${String(error)}` }; }
  const parsed = kind.parser?.(content);
  if (parsed && !parsed.success && !pointRead) return { kind: "malformed", condition: parsed.error };
  return { content, ...(parsed?.success ? { fields: parsed.data } : {}) };
}

/** Describe a record defect without losing its exact stored entry path. */
export function recordDiagnostic(path: string, problem: ContentProblem, saved = false): ListingDiagnostic {
  return { ...problem, key: path, remedy: { text: problem.kind === "unknown-format-version"
    ? "Return to the merge base or rebuild with support for this format version."
    : saved && problem.kind === "unreadable"
      ? `Restore or fetch the original missing objects for saved entry ${path}, then retry this saved state.`
      : saved ? `Select a readable saved state or read current state after repairing ${path}; a forward repair cannot change the saved bytes.`
    : `Repair the stored entry at ${path}, then retry.` } };
}

/** Compare a parsed origin or conflict target with its containing ref's owner. */
export function parsedOwnerProblem(reference: RecordReference, fields: unknown, formerNames: readonly string[] = []): ContentProblem | null {
  if (reference.kind.endsWith("/conflict-record")) {
    const conflict = ConflictRecordSchema.safeParse(fields);
    const target = conflict.success ? conflict.data.record.owner : null;
    const matches = target && (target.type !== "person" && target.uid !== undefined
      ? sameOwner(reference.owner, target) : target.type === reference.owner.type && target.name === reference.owner.name);
    if (target && !matches) return {
      kind: "key-mismatch", condition: "Stored conflict names an owner other than its ref's metadata",
    };
  }
  return reference.kind === "lineage/transition" ? lineageOriginProblem(reference, fields, formerNames) : null;
}

function lineageOriginProblem(reference: RecordReference, fields: unknown, formerNames: readonly string[]): ContentProblem | null {
  const lineage = LineageRecordSchema.safeParse(fields);
  if (!lineage.success) return null;
  const { origin } = lineage.data;
  const sameUid = reference.owner.type === "work-item" && origin.uid !== undefined && origin.uid === reference.owner.uid;
  if (origin.name === reference.owner.name && (origin.uid === undefined || sameUid)) return null;
  if (sameUid && formerNames.includes(origin.name)) return null;
  return { kind: "key-mismatch", condition: "Stored lineage origin names an owner other than its registry metadata" };
}
