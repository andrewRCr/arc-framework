/** Restore only lifecycle-owned metadata fields on a newly minted stub's first hand edit. */
import type { RecordEntry } from "./index-schema.js";
import type { StoreResult } from "../refusal.js";
import { readBaseContent, type BaseSelectionContext } from "./base-content.js";
import { MetaWorkClassSchema, MetaPauseSchema } from "../../active/meta-schema.js";
import { parseMetaRecord } from "../../active/meta-reader.js";
import { SlugSchema, WorkUnitStateSchema } from "../../kernel/index.js";
import { writeMetaState, writeMetaClass, writeMetaOwner, writeMetaCurrentWorkflow, writeMetaPause } from "../kinds/meta/writers.js";

/** Normalize in memory against the exact minted content, preserving authored prose and soft fields. */
export function normalizeMintedMetadata(content: string, minted: string): string {
  const fields = parseMetaRecord(minted);
  let result = writeMetaState(content, WorkUnitStateSchema.parse(fields.state));
  result = writeMetaClass(result, MetaWorkClassSchema.parse(fields.workClass));
  result = writeMetaOwner(result, SlugSchema.parse(fields.owner));
  result = writeMetaCurrentWorkflow(result, fields.currentWorkflow);
  return writeMetaPause(result, MetaPauseSchema.nullable().parse(fields.pause));
}

/** Whether an entry still holds the first metadata edit of its own proved stub creation. */
export function requiresStubNormalization(entry: RecordEntry): boolean {
  return entry.reference.kind === "work-item/meta" && entry.adoption?.kind === "write-back" && entry.adoption.stub === true;
}

/** Normalize only the retained initial edit, always reading the exact creation basis. */
export async function normalizeStubEdit(context: BaseSelectionContext, entry: RecordEntry, content: string): Promise<StoreResult<string>> {
  if (!requiresStubNormalization(entry)) return { status: "ok", result: content };
  const minted = await readBaseContent(context, entry, { kind: "stored", version: entry.base.version });
  if (minted.status === "refused") return minted;
  try { return { status: "ok", result: normalizeMintedMetadata(content, minted.result) }; }
  catch (error) { return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference: entry.reference,
    rule: "projection.stub-normalization", condition: `Cannot normalize the initial metadata: ${String(error)}`,
    remedy: { text: "Repair the metadata's core table and lifecycle field anchors, then retry adoption." } } }; }
}
