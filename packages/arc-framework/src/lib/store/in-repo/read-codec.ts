/** Lazy field decoding for the tracked kinds with existing record schemas. */
import type { InRepoContext } from "./context.js";
import type { KindId } from "../catalog.js";

/** A parser's independent fields, own-key evidence, or explicit rejecting rule. */
export interface TrackedDecodedContent { fields?: unknown; key?: string; error?: string }
/** Decode fields without validating ordinary Markdown writes.
 * @param context - Backend registry and dependencies.
 * @param kind - Registered tracked role.
 * @param content - Exact stored bytes decoded as UTF-8.
 * @returns Fields or the rejecting rule; malformed bytes remain readable.
 */
export async function decodeTrackedContent(context: InRepoContext, kind: KindId, content: string): Promise<TrackedDecodedContent> {
  const parser = context.registry[kind].parser;
  if (parser !== null) {
    const parsed = parser(content);
    return parsed.success ? { fields: parsed.data } : { error: parsed.error };
  }
  try {
    if (kind === "review/candidate") {
      const [codec] = await Promise.all([import("../../work-unit/candidate-attestation.js"), import("../../work-unit/candidate-record-store.js")]);
      const fields = codec.CandidateManagedRecordV1Schema.parse(JSON.parse(content));
      return { fields, key: fields.attestation.workUnit };
    }
    if (kind === "review/integration-boundary") {
      const [codec] = await Promise.all([import("../../../scripts/review-gate/policy/integration-boundary-locus.js"), import("../../work-unit/submission-boundary-store.js")]);
      const fields = codec.parseIntegrationBoundaryLocus(JSON.parse(content) as unknown);
      return { fields, key: fields.workUnit };
    }
    if (kind === "lineage/transition") {
      const [codec] = await Promise.all([import("../../work-unit/transition-record.js"), import("../../work-unit/transition-record-store.js")]);
      const fields = codec.parseTransitionRecord(content);
      return fields === null ? { error: "TransitionRecordSchema rejects the record" } : { fields, key: fields.origin };
    }
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
}
