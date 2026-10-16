/** Canonical content decoding and actionable per-record read defects. */

import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import { LineageRecordSchema } from "../kinds/lineage/index.js";
import type { RecordReference } from "../identity.js";
import type { KindDefinition } from "../registry.js";
import { PROJECTED_RECORD_MAX_BYTES } from "../limits.js";
import type { ListingDiagnostic } from "../read.js";

/** A content defect whose diagnostic receives its stored path at the caller. */
export interface ContentProblem { kind: ListingDiagnostic["kind"]; condition: string }
/** Parsed content retains exact prose bytes and canonicalizes never-projected JSON. */
export function readRefContent(kind: KindDefinition, bytes: Uint8Array): { content: string; fields?: unknown } | ContentProblem {
  if (kind.projection !== "never" && bytes.byteLength > PROJECTED_RECORD_MAX_BYTES) {
    return { kind: "oversized", condition: `Projected records cannot exceed ${PROJECTED_RECORD_MAX_BYTES} UTF-8 bytes` };
  }
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (kind.projection === "never") content = canonicalize(JSON.parse(content));
  } catch (error) { return { kind: "malformed", condition: `Stored content is invalid: ${String(error)}` }; }
  const parsed = kind.parser?.(content);
  if (parsed && !parsed.success) return { kind: "malformed", condition: parsed.error };
  return { content, ...(parsed?.success ? { fields: parsed.data } : {}) };
}

/** Describe a record defect without losing its exact stored entry path. */
export function recordDiagnostic(path: string, problem: ContentProblem): ListingDiagnostic {
  return { ...problem, key: path, remedy: { text: problem.kind === "unknown-format-version"
    ? "Return to the merge base or rebuild with support for this format version."
    : `Repair the stored entry at ${path}, then retry.` } };
}

/** Compare a parser's explicit origin name with the decoded owner. */
export function parsedOwnerProblem(reference: RecordReference, fields: unknown): ContentProblem | null {
  if (reference.kind !== "lineage/transition") return null;
  const lineage = LineageRecordSchema.safeParse(fields);
  if (!lineage.success || lineage.data.origin.name === reference.owner.name) return null;
  return { kind: "key-mismatch", condition: `Stored content names ${lineage.data.origin.name} instead of ${reference.owner.name}` };
}
