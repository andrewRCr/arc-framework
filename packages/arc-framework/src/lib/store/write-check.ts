/** Backend-independent rules for a proposed record write. */

import type { Store } from "./contract.js";
import type { RecordReference } from "./identity.js";
import type { Remedy } from "./refusal.js";

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
