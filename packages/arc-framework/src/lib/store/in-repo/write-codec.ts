/** Incoming canonical records are validated and identity-bound before any mutation basis check. */
import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import type { CandidateManagedRecordV1 } from "../../work-unit/candidate-attestation.js";
import type { TransitionRecord } from "../../work-unit/transition-record.js";
import type { IntegrationBoundaryLocus } from "../../../scripts/review-gate/policy/integration-boundary-locus.js";
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import type { WriteInput } from "../write.js";
import { refuse } from "./refusals.js";

/** Validated serializer input, together with the exact bytes it will write. */
export type WriteContent = { kind: "raw"; bytes: string }
  | { kind: "candidate"; bytes: string; value: CandidateManagedRecordV1 }
  | { kind: "boundary"; bytes: string; value: IntegrationBoundaryLocus }
  | { kind: "transition"; bytes: string; value: TransitionRecord };

/** Refuse invalid caller content while preserving the failing parser rule.
 * @param reference - Record whose input must be repaired.
 * @param rule - The pure parser's rejected field or shape.
 * @returns Never; the operation returns a recoverable malformed refusal.
 */
export function malformedWrite(reference: RecordReference, rule: string): never {
  return refuse({ code: "record-malformed", class: "recoverable", reference, rule,
    condition: rule, remedy: { text: "Correct the named content rule and retry the write." } });
}
function parseJson(reference: RecordReference, content: string): unknown {
  try { return JSON.parse(content); }
  catch (error) { return malformedWrite(reference, `JSON: ${error instanceof Error ? error.message : "Invalid JSON syntax"}`); }
}
function ownKey(reference: RecordReference, name: string): void {
  if (name === reference.owner.name) return;
  const actual = RecordReferenceSchema.parse({ ...reference, owner: { ...reference.owner, name } });
  refuse({ code: "identity-mismatch", class: "recoverable", expected: reference, actual,
    condition: "The incoming record's own key disagrees with the requested owner.",
    remedy: { text: "Correct the record's owner key or target its actual owner, then retry." } });
}
/** Validate canonical store inputs; prose remains an exact-byte unvalidated write.
 * @param input - Caller content and logical record reference.
 * @returns Validated canonical bytes and the existing store's serializer input, or absence for removal.
 */
export async function writeContent(input: WriteInput): Promise<WriteContent | undefined> {
  if (input.action === "remove") return undefined;
  const reference = input.reference;
  if (!["review/candidate", "review/integration-boundary", "lineage/transition"].includes(reference.kind)) return { kind: "raw", bytes: input.content };
  const json = parseJson(reference, input.content);
  if (reference.kind === "review/candidate") {
    const { CandidateManagedRecordV1Schema, serializeCandidateManagedRecord } = await import("../../work-unit/candidate-attestation.js");
    const parsed = CandidateManagedRecordV1Schema.safeParse(json);
    if (!parsed.success) return malformedWrite(reference, parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
    ownKey(reference, parsed.data.attestation.workUnit);
    return { kind: "candidate", value: parsed.data, bytes: serializeCandidateManagedRecord(parsed.data) };
  }
  if (reference.kind === "lineage/transition") {
    const { TransitionRecordSchema, serializeTransitionRecord } = await import("../../work-unit/transition-record.js");
    const parsed = TransitionRecordSchema.safeParse(json);
    if (!parsed.success) return malformedWrite(reference, parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
    ownKey(reference, parsed.data.origin);
    return { kind: "transition", value: parsed.data, bytes: serializeTransitionRecord(parsed.data) };
  }
  const { parseIntegrationBoundaryLocus } = await import("../../../scripts/review-gate/policy/integration-boundary-locus.js");
  let boundary: IntegrationBoundaryLocus;
  try { boundary = parseIntegrationBoundaryLocus(json); }
  catch (error) { return malformedWrite(reference, `Boundary: ${error instanceof Error ? error.message : "Invalid boundary shape"}`); }
  ownKey(reference, boundary.workUnit);
  return { kind: "boundary", value: boundary, bytes: canonicalize(boundary) };
}
