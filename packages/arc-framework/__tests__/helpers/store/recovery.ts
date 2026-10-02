/** Exhaustive refusal scenarios and the corresponding success-path repairs. */

import {
  UNSUPPORTED_CASES, type RefusalCode, type StoreRefusal,
} from "../../../src/lib/store/index.js";
import type { RecoveryCaseId } from "./fixture-contract.js";

/** One named refusal case with the observed condition and applicable repair operation. */
export interface RecoveryCase {
  id: RecoveryCaseId;
  class: StoreRefusal["class"];
  produce: string;
  repair: string;
}

function transient(id: "unreachable" | "refused" | "retries-exhausted" | "version-conflict" | "record-malformed"): RecoveryCase {
  return { id: `transient-write:${id}`, class: id === "refused" ? "terminal" : "recoverable",
    produce: `Cause ${id} while publishing or reconciling a transient identity write.`,
    repair: "Apply the named write refusal's remedy, then repeat the write successfully." };
}

/** Compile-time complete table; a new refusal code requires an explicit executable fixture case. */
export const refusalRecoveryTable: Record<RefusalCode, readonly RecoveryCase[]> = {
  "not-found": [
    { id: "not-found:name", class: "recoverable", produce: "Lookup a name with no primary record.", repair: "Create its valid primary record, then repeat lookup." },
    { id: "not-found:identity", class: "recoverable", produce: "Read a personal record with arc.identity unset.", repair: "Set arc.identity to the record owner, then read it again." },
  ],
  "version-conflict": [{ id: "version-conflict", class: "recoverable", produce: "Update a single-writer record from a stale version.", repair: "Re-read the record version and re-apply the intended content." }, transient("version-conflict")],
  "record-malformed": [{ id: "record-malformed", class: "recoverable", produce: "Write bytes rejected by the record's pure parser.", repair: "Repair the content to the parser's documented shape." }, transient("record-malformed")],
  "identity-mismatch": [{ id: "identity-mismatch", class: "recoverable", produce: "Read an entry whose stored key disagrees with its record.", repair: "Restore the record under the correct identity and repeat the read." }],
  "ambiguous-match": [{ id: "ambiguous-match", class: "recoverable", produce: "Lookup a branch linked by two work items.", repair: "Clear the erroneous branch link and repeat lookup." }],
  "lock-held": [{ id: "lock-held", class: "recoverable", produce: "Hold the injected surface write lock while a write waits.", repair: "Release that lock and repeat the original write." }],
  "namespace-corrupt": [{ id: "namespace-corrupt", class: "terminal", produce: "Break the namespace record index.", repair: "Rebuild the index from its saved record state." }],
  "checkout-not-writable": [{ id: "checkout-not-writable", class: "recoverable", produce: "Attempt a write in a checkout without authority.", repair: "Repeat the write in the authorized checkout named by its remedy." }],
  unsupported: (Object.keys(UNSUPPORTED_CASES) as (keyof typeof UNSUPPORTED_CASES)[]).map((value) => ({
    id: `unsupported:${value}`, class: UNSUPPORTED_CASES[value],
    produce: {
      "cross-substrate-batch": "Batch records across the interim backend's physical substrates.",
      "uncovered-state-version": "Request saved state for records outside that version's coverage.",
      "work-item-kind-required": "List the interim work-item family without naming its kind.",
      "held-here": "List checkout-held records on a store whose state lives off the code branch.",
      "unhomed-kind": "Write a kind with no home before the flip.",
      "personal-history": "Request history for a personal file with no saved state.",
      "links-write": "Write links on the interim backend that does not store links.",
      "placement-move": "Move a work item by an interim backend's placement write.",
      "completed-create": "Create a completed work item through the interim backend.",
      rename: "Rename a work item through an interim backend without UIDs.",
    }[value],
    repair: {
      "cross-substrate-batch": "Sequence the writes in their separate substrates.",
      "uncovered-state-version": "Bind reads and changes by each record's own version.",
      "work-item-kind-required": "List each requested work-item kind.",
      "held-here": "Use lookup with the checkout claim, or list without the held-here flag.",
      "unhomed-kind": "Use a backend with a home for the kind after the flip.",
      "personal-history": "Use a backend that saves personal record history after the flip.",
      "links-write": "Use a backend that stores links after the flip.",
      "placement-move": "Use the appropriate lifecycle or Errand close verb.",
      "completed-create": "Create active work then archive it or close its Errand.",
      rename: "Use arc rename for a work unit; no interim verb renames an Errand.",
    }[value],
  })),
  "retries-exhausted": [{ id: "retries-exhausted", class: "recoverable", produce: "Move the remote at every compare-and-swap retry.", repair: "Retry sync once the remote stops contending." }, transient("retries-exhausted")],
  unreachable: [{ id: "unreachable", class: "recoverable", produce: "Take the configured remote transport down.", repair: "Restore the remote and retry sync." }, transient("unreachable")],
  refused: [{ id: "refused", class: "terminal", produce: "Make the remote refuse with its policy message.", repair: "Change the server policy named by that message." }, transient("refused")],
};
