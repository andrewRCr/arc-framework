/** Read the exact content a stored or local projection base names. */
import type { Store } from "../contract.js";
import type { RecordVersion } from "../identity.js";
import type { StoreResult } from "../refusal.js";
import { createHistoryMemo, type HistoryMemo, type RecoveredBase } from "./base-recovery.js";
import type { ObjectFormat } from "./blob-id.js";
import type { RecordEntry } from "./index-schema.js";
import type { ProjectionLocation } from "./location.js";

/** The store and local kept copies a base can name. */
export interface BaseSelectionContext {
  readonly store: Store;
  readonly location: ProjectionLocation;
  readonly format: ObjectFormat;
  readonly memo?: HistoryMemo;
}

/** Read the content a selected base names, without substituting a newer version. */
export async function readBaseContent(context: BaseSelectionContext, entry: RecordEntry, base: RecoveredBase): Promise<StoreResult<string>> {
  if (base.kind === "copy") return { status: "ok", result: base.content };
  if (base.kind === "empty") return { status: "ok", result: "" };
  const current = await context.store.read({ reference: entry.reference });
  if (current.status === "refused") return current;
  if (current.result.version === base.version) return { status: "ok", result: current.result.content };
  return readHistoricalBaseContent(context, entry, base.version);
}

/** Read a stored candidate through the command's history memo. */
export async function readHistoricalBaseContent(
  context: BaseSelectionContext, entry: RecordEntry, version: RecordVersion,
): Promise<StoreResult<string>> {
  const history = await (context.memo ?? createHistoryMemo(context.store)).read(entry.reference);
  if (history.status === "refused") return history;
  const content = history.result.find(each => each.version === version)?.content;
  if (content !== undefined && content !== null) return { status: "ok", result: content };
  return { status: "refused", refusal: { code: "version-conflict", class: "recoverable", records: [entry.reference],
    condition: "The projected base version is no longer readable.",
    remedy: { text: "Recover the projected file's base from the record history, then save again." } } };
}
