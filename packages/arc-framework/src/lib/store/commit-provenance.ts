/** Git message encoding for structured storage provenance and legacy history. */

import type { RecordReference } from "./identity.js";
import { StoredProvenanceSchema, type CallerProvenance, type StoredProvenance } from "./links.js";

/** Render one ref commit's provenance using its first changed record as the owner. */
export function renderStoreCommitMessage(provenance: CallerProvenance, reference: RecordReference,
  batchId: string, actor?: string): string {
  const owner = reference.owner;
  return `${encodeValue(provenance.verb)} ${owner.name}\n\n${[
    `Arc-Lifecycle-Action: ${encodeValue(provenance.lifecycleAction)}`,
    ...(provenance.codeHead ? [`Arc-Code-Head: ${provenance.codeHead}`] : []),
    ...("uid" in owner && owner.uid ? [`Arc-Owner: ${owner.uid}`] : []),
    `Arc-Batch: ${batchId}`,
    ...(actor ? [`Arc-Actor: ${actor}`] : []),
  ].join("\n")}\n`;
}

/** Recover structured provenance for a changed record, retaining unstructured messages verbatim. */
export function parseStoreCommitProvenance(message: string, reference: RecordReference): StoredProvenance {
  const [subject = ""] = message.split("\n");
  const trailers = new Map([...message.matchAll(/^Arc-([A-Za-z-]+): (.*)$/gmu)]
    .map((match) => [match[1], match[2]]));
  try {
    const owner = reference.owner;
    const parsed = StoredProvenanceSchema.safeParse({
      verb: decodeValue(subject.slice(0, subject.lastIndexOf(" "))),
      lifecycleAction: decodeValue(trailers.get("Lifecycle-Action") ?? ""),
      ...(trailers.has("Code-Head") ? { codeHead: trailers.get("Code-Head") } : {}),
      reference, ...("uid" in owner && owner.uid ? { ownerUid: owner.uid } : {}),
      batchId: trailers.get("Batch") ?? "",
    });
    if (parsed.success) return parsed.data;
  } catch { /* A legacy message can contain text that is not JSON. */ }
  return { message };
}

function encodeValue(value: string): string {
  return /[\p{Cc}]/u.test(value) || value.startsWith('"') ? JSON.stringify(value) : value;
}

function decodeValue(value: string): unknown {
  return value.startsWith('"') ? JSON.parse(value) : value;
}
