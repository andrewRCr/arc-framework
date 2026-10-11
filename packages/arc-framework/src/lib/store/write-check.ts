/** Backend-independent rules for a proposed record write. */

import type { Store } from "./contract.js";
import type { RecordReference } from "./identity.js";
import { HAND_EDIT_VERBS, type CallerProvenance } from "./links.js";
import type { Remedy, StoreRefusal } from "./refusal.js";

/** Read-only state as found or as the whole proposed batch would leave it. */
export type StoreView = Pick<Store, "read" | "list" | "lookup">;
/** Parsed content, provenance-derived authority, and both sides of a write. */
export interface WriteCheckInput {
  reference: RecordReference;
  prior?: { content: string; fields?: unknown };
  next?: { content: string; fields: unknown };
  writer: { kind: "verb"; verb: string } | { kind: "hand-edit" };
  before: StoreView;
  after: StoreView;
}
/** One stable rule violation and the correction needed before retrying. */
export interface BrokenRule {
  rule: string;
  condition: string;
  remedy: Remedy;
}
/** All broken rules; an empty result admits the proposed write. */
export type WriteCheck = (input: WriteCheckInput) => Promise<readonly BrokenRule[]>;

/** Derive authority from caller provenance, never from editable record bytes.
 * @param provenance - The verb's write or batch provenance.
 * @returns A hand edit for persistence verbs, or the exact verb otherwise.
 */
export function deriveWriteCheckWriter(provenance: CallerProvenance): WriteCheckInput["writer"] {
  return HAND_EDIT_VERBS.some((verb) => verb === provenance.verb)
    ? { kind: "hand-edit" } : { kind: "verb", verb: provenance.verb };
}

/** Compose one deterministic refusal from the checks in a batch's write order.
 * @param results - Each written record and every rule its check broke.
 * @returns The first rule in UTF-8 byte order on its first breaking record, or admission.
 */
export function composeWriteCheckRefusal(
  results: readonly { reference: RecordReference; rules: readonly BrokenRule[] }[],
): Extract<StoreRefusal, { code: "record-malformed" }> | undefined {
  const pairs = results.flatMap(({ reference, rules }) => rules.map((rule) => ({ reference, ...rule })));
  pairs.sort((left, right) => Buffer.compare(Buffer.from(left.rule), Buffer.from(right.rule)));
  const first = pairs[0];
  if (first === undefined) return undefined;
  return {
    code: "record-malformed", class: "recoverable", reference: first.reference, rule: first.rule,
    condition: `${first.condition} (${pairs.length - 1} other (record, rule) pairs broken.)`, remedy: first.remedy,
  };
}
