/** Git message encoding for structured storage provenance and legacy history. */

import type { RecordReference } from "./identity.js";
import { StoredProvenanceSchema, type CallerProvenance, type StoredProvenance } from "./links.js";
import { canonicalDigest } from "../kernel/canonical/canonical-json.js";

/** Match one save identity at one exact record, even when the owner's name changes. */
export function archiveSaveTrailer(reference: RecordReference, id: string): string {
  const owner = reference.owner;
  return `Arc-Archive-Save: ${id} ${canonicalDigest([owner.type, "uid" in owner ? owner.uid ?? owner.name : owner.name,
    reference.kind, reference.key ?? null])}`;
}

/** Render one ref commit's provenance using its first changed record as the owner. */
export function renderStoreCommitMessage(provenance: CallerProvenance, reference: RecordReference,
  batchId: string, actor?: string): string {
  const owner = reference.owner;
  return renderMessage(provenance, owner.name, batchId, actor, "uid" in owner ? owner.uid : undefined,
    provenance.archiveSaveId === undefined ? undefined : archiveSaveTrailer(reference, provenance.archiveSaveId));
}

/** Name a validated empty-quarter merge by namespace rather than inventing an affected record owner. */
export function renderEmptyArchiveMergeMessage(ref: string, batchId: string, actor?: string): string {
  if (!/^refs\/arc\/archive\/\d{4}-q[1-4]$/u.test(ref)) throw new Error("An empty archive merge requires an archive-quarter ref");
  return renderMessage({ verb: "sync", lifecycleAction: "merge" }, ref, batchId, actor);
}

function renderMessage(provenance: CallerProvenance, subject: string, batchId: string,
  actor?: string, ownerUid?: string, archiveSave?: string): string {
  return `${encodeValue(provenance.verb)} ${subject}\n\n${[
    `Arc-Lifecycle-Action: ${encodeValue(provenance.lifecycleAction)}`,
    ...(provenance.codeHead ? [`Arc-Code-Head: ${provenance.codeHead}`] : []),
    ...(ownerUid ? [`Arc-Owner: ${ownerUid}`] : []),
    `Arc-Batch: ${batchId}`,
    ...(archiveSave ? [archiveSave] : []),
    ...(actor ? [`Arc-Actor: ${actor}`] : []),
  ].join("\n")}\n`;
}

/** Recover structured provenance for a changed record, retaining unstructured messages verbatim. */
export function parseStoreCommitProvenance(message: string, reference: RecordReference): StoredProvenance {
  const lines = message.split("\n"), [subject = ""] = lines;
  // Git lines end only at a newline, so a value keeps any other line separator it holds; the subject is never a trailer.
  const trailers = new Map(lines.slice(1).flatMap((line) => {
    const match = /^Arc-([A-Za-z-]+): (.*)$/su.exec(line);
    return match ? [[match[1], match[2]] as const] : [];
  }));
  try {
    const owner = reference.owner;
    const archiveSave = trailers.get("Archive-Save"), archiveSaveId = archiveSave?.split(" ")[0];
    const parsed = StoredProvenanceSchema.safeParse({
      verb: decodeValue(subject.slice(0, subject.lastIndexOf(" "))),
      lifecycleAction: decodeValue(trailers.get("Lifecycle-Action") ?? ""),
      ...(trailers.has("Code-Head") ? { codeHead: trailers.get("Code-Head") } : {}),
      reference, ...("uid" in owner && owner.uid ? { ownerUid: owner.uid } : {}),
      batchId: trailers.get("Batch") ?? "",
      ...(archiveSaveId && archiveSaveTrailer(reference, archiveSaveId) === `Arc-Archive-Save: ${archiveSave}` ? { archiveSaveId } : {}),
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
