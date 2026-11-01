/** One policy for object-loss, decoding, metadata-absence, and archive-placement faults. */

import type { RecordReference } from "../identity.js";
import type { CapturedRefDiagnostic, RefCaptureFault } from "./capture-diagnostic.js";
import type { HistoryRef, Remedy, StoreRefusal } from "../refusal.js";
import { missingRefObjects } from "./missing-objects.js";
import { unparsedMetadata } from "./metadata.js";

/** Object facts remain independent of the operation reporting them. */
export type RefObjectFault = RefCaptureFault | "local-transport";

/** Captured coordinates and any more specific text already established by the reader. */
export interface RefFaultOptions {
  key?: string; saved?: boolean; reference?: RecordReference; historyRefs?: HistoryRef[];
  condition?: string; remedy?: Remedy;
}

/** Equivalent point, listing, and transport reports for the same observed fault. */
export interface RefFaultReport {
  refusal: Extract<StoreRefusal, { code: "state-unresolvable" | "namespace-corrupt" }>;
  diagnostic: CapturedRefDiagnostic & { fault: RefCaptureFault }; failure: Extract<StoreRefusal, { code: "refused" }>;
  condition: string; remedy: Remedy;
}

/** Apply the fault's refusal class and repair side without changing any public outcome schema. */
export function refObjectFault(namespace: string, fault: "local-transport", options?: RefFaultOptions): Pick<RefFaultReport, "failure" | "condition" | "remedy">;
export function refObjectFault(namespace: string, fault: Exclude<RefObjectFault, "local-transport">, options?: RefFaultOptions): RefFaultReport;
export function refObjectFault(namespace: string, fault: RefObjectFault, options: RefFaultOptions = {}): RefFaultReport | Pick<RefFaultReport, "failure" | "condition" | "remedy"> {
  const key = options.key ?? namespace;
  const details = faultDetails(key, fault, options.saved ?? false);
  const condition = options.condition ?? details.condition, remedy = options.remedy ?? details.remedy;
  const failure = { code: "refused" as const, class: "terminal" as const, message: condition, condition, remedy };
  if (fault === "local-transport") return { failure, condition, remedy };
  const refusal: RefFaultReport["refusal"] = fault === "missing"
    ? missingRefObjects(namespace, { reference: options.reference, historyRefs: options.historyRefs ?? [], condition, remedy })
    : { code: "namespace-corrupt", class: "terminal", namespace, condition, remedy };
  const diagnostic: RefFaultReport["diagnostic"] = { fault, kind: fault === "misplaced" ? "malformed" : "unreadable", key,
    condition, remedy, ...fault === "misplaced" ? { rule: "placement" as const } : {} };
  return { refusal, diagnostic, condition, remedy, failure };
}

function faultDetails(key: string, fault: RefObjectFault, saved: boolean): { condition: string; remedy: Remedy } {
  if (fault === "local-transport") return { condition: `The local object required to fetch ${key} is unavailable.`,
    remedy: { text: "Restore the missing local object in the store repository, or repair the remote's URL if it resolves to the wrong repository, then retry." } };
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
