/** Production entry parsers registered without changing their interim backend homes. */
import { parseRoutingReceipt } from "./routing-receipt.js";
import { defineKindRegistration } from "../registry.js";
import { ENTRY_CONFIGS, type EntryKind } from "./entry-configs.js";
import { parseEntryList } from "./entry-list.js";

/** All six production entry grammars. */
export const ENTRY_REGISTRATIONS = (Object.keys(ENTRY_CONFIGS) as EntryKind[]).map((kind) => defineKindRegistration({ kind, parser: (content) => parseEntryList(content, kind) }));

/** Receipts have independent write-once provenance and no projection. */
export const ROUTING_RECEIPT_REGISTRATIONS = (["personal/routing-receipt", "project-inbox/routing-receipt"] as const)
  .map((kind) => defineKindRegistration({ kind, parser: parseRoutingReceipt }));
