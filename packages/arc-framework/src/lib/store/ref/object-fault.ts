/** One policy for object-loss, decoding, metadata-absence, and archive-placement faults. */

import type { RecordReference } from "../identity.js";
import type { ListingDiagnostic } from "../read.js";
import type { HistoryRef, Remedy, StoreRefusal } from "../refusal.js";
import { missingRefObjects } from "./missing-objects.js";
import { unparsedMetadata } from "./metadata.js";

/** Object facts remain independent of the operation reporting them. */
export type RefObjectFault = "missing" | "unparseable" | "no-metadata" | "misplaced";

/** Captured coordinates and any more specific text already established by the reader. */
export interface RefFaultOptions {
  key?: string; saved?: boolean; reference?: RecordReference; historyRefs?: HistoryRef[];
  condition?: string; remedy?: Remedy;
}

/** Equivalent point, listing, and transport reports for the same observed fault. */
export interface RefFaultReport {
  refusal: Extract<StoreRefusal, { code: "state-unresolvable" | "namespace-corrupt" }>;
  diagnostic: ListingDiagnostic; failure: Extract<StoreRefusal, { code: "refused" }>;
  condition: string; remedy: Remedy;
}

/** Apply the fault's refusal class and repair side without changing any public outcome schema. */
export function refObjectFault(namespace: string, fault: RefObjectFault, options: RefFaultOptions = {}): RefFaultReport {
  const key = options.key ?? namespace;
  const details = faultDetails(key, fault, options.saved ?? false);
  const condition = options.condition ?? details.condition, remedy = options.remedy ?? details.remedy;
  const refusal: RefFaultReport["refusal"] = fault === "missing"
    ? missingRefObjects(namespace, { reference: options.reference, historyRefs: options.historyRefs ?? [], condition, remedy })
    : { code: "namespace-corrupt", class: "terminal", namespace, condition, remedy };
  const diagnostic: ListingDiagnostic = { kind: fault === "misplaced" ? "malformed" : "unreadable", key,
    condition, remedy, ...fault === "misplaced" ? { rule: "placement" as const } : {} };
  return { refusal, diagnostic, condition, remedy,
    failure: { code: "refused", class: "terminal", message: condition, condition, remedy } };
}

function faultDetails(key: string, fault: RefObjectFault, saved: boolean): { condition: string; remedy: Remedy } {
  if (fault === "missing") {
    const refusal = missingRefObjects(key, { historyRefs: [] });
    return { condition: refusal.condition, remedy: refusal.remedy };
  }
  const metadata = unparsedMetadata(key, saved);
  if (fault === "misplaced") return { condition: `The archive folder ${key} has inconsistent placement.`,
    remedy: saved ? metadata.remedy : { text: "Repair the archive folder's placement in a new commit, then retry." } };
  return { condition: fault === "no-metadata"
    ? `The readable tree of ${key} holds records but has no metadata entry.`
    : `The metadata object for ${key} cannot be parsed.`, remedy: metadata.remedy };
}
