/** Validate physical messages already acquired by bounded native history traversals. */
import { StoreCreationReceiptReader } from "../commit-creation-receipt.js";
import type { HistoryEntry } from "../contract.js";
import type { BatchCreationReceipt } from "../creation-receipt.js";
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import type { StoreResult } from "../refusal.js";
import type { BatchObject } from "./batch-read.js";

// Operation provenance decoding needs a reference, but its batch identity is record-independent.
// This pure prototype performs no namespace read or identity allocation, including for archive quarters.
const operationReference = RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } });

/** Validate every complete commit object acquired, including boundary parents and zero-event tips. */
export function captureCommitReceipts(objects: ReadonlyMap<string, BatchObject | null>, ref: string,
  evidence: StoreCreationReceiptReader, reference: RecordReference = operationReference): StoreResult<Map<string, BatchCreationReceipt | undefined>> {
  const receipts = new Map<string, BatchCreationReceipt | undefined>();
  for (const [revision, object] of objects) {
    if (object?.type !== "commit") continue;
    const parsed = evidence.read(capturedCommitMessage(object), reference, `${ref}@${revision}`);
    if (parsed.status === "refused") return parsed;
    receipts.set(revision, parsed.result);
  }
  return { status: "ok", result: receipts };
}

/** Extract the verbatim message from an already acquired complete commit object. */
export function capturedCommitMessage(object: BatchObject): string {
  const raw = new TextDecoder().decode(object.bytes), boundary = raw.indexOf("\n\n");
  if (boundary < 0) throw new Error("Git returned a commit without its header boundary");
  return raw.slice(boundary + 2);
}

/** Retain the complete accepted envelope without manufacturing a value for unavailable facts. */
export function withCreationReceipt(entry: HistoryEntry, receipt?: BatchCreationReceipt): HistoryEntry {
  return receipt === undefined ? entry : { ...entry, creationReceipt: receipt };
}
