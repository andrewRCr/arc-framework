/** Canonical physical-commit encoding and strict decoding of backend creation receipts. */
import { BatchCreationReceiptSchema, type BatchCreationReceipt } from "./creation-receipt.js";
import type { RecordReference } from "./identity.js";
import type { StoreResult } from "./refusal.js";
import { canonicalize } from "../kernel/canonical/canonical-json.js";
import { parseStoreCommitProvenance } from "./commit-provenance.js";

const trailer = "Arc-Creation-Receipt:";

/** Append accepted creation evidence without changing caller provenance bytes. */
export function appendStoreCreationReceipt(message: string, receipt?: BatchCreationReceipt): string {
  return receipt === undefined ? message : `${message}${message.endsWith("\n") ? "" : "\n"}${trailer} ${canonicalize(receipt)}\n`;
}

/** Decode advertised evidence separately from permissive historical provenance parsing. */
export function parseStoreCreationReceipt(message: string, reference: RecordReference,
  locus: string): StoreResult<BatchCreationReceipt | undefined> {
  const boundary = message.indexOf("\n\n");
  const lines = boundary < 0 ? [] : message.slice(boundary + 2).split("\n");
  const advertised = lines.filter(line => line.startsWith(trailer));
  if (advertised.length === 0) return { status: "ok", result: undefined };
  const encoded = advertised[0];
  if (advertised.length !== 1 || encoded === undefined) return corruptReceipt(locus, "A physical commit advertises duplicate creation receipts.");
  let raw: unknown;
  try { raw = JSON.parse(encoded.slice(trailer.length).trim()); }
  catch { return corruptReceipt(locus, "The advertised creation receipt is not valid JSON."); }
  const parsed = BatchCreationReceiptSchema.safeParse(raw);
  if (!parsed.success) return corruptReceipt(locus, "The creation receipt schema, inventory, or format version is invalid.");
  const provenance = parseStoreCommitProvenance(message, reference);
  if (lines.filter(line => line.startsWith("Arc-Batch:")).length !== 1 || !("verb" in provenance)
    || provenance.batchId !== parsed.data.batchId) return corruptReceipt(locus,
    "The creation receipt lacks matching unambiguous structured batch provenance.");
  return { status: "ok", result: parsed.data };
}

function corruptReceipt(namespace: string, condition: string): StoreResult<never> {
  return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace, condition,
    remedy: { text: "Restore the complete authentic batch evidence from a known intact source, or explicitly regenerate this development namespace; then retry." } } };
}
