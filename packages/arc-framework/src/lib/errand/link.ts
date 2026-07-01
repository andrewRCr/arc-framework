/**
 * `linkErrandToInbox` — attach an existing errand record to a USER-INBOX capture.
 *
 * The usual producer path records the inbox back-pointer at `arc errand open
 * --from-inbox`. This helper covers the later-realized case: an errand was
 * opened from a free description, then the operator recognizes it as satisfying
 * an existing capture. Updating the record lets the normal close/promote cleanup
 * drop that capture automatically.
 *
 * @module
 */

import { reconcileErrandPush, type ErrandPushOutcome } from "./merge.js";
import { readErrandRecord, writeErrandRecord, type ErrandRecord } from "./record.js";
import type { ErrandRecordIO } from "./ref-tree.js";

/** Operands for {@link linkErrandToInbox}. */
export interface LinkErrandToInboxParams {
  /** The errand slug — its logical identity and the record's tree key. */
  slug: string;
  /** Originating USER-INBOX entry title to drop when the errand closes or promotes. */
  originEntry: string;
}

/** Outcome of {@link linkErrandToInbox}. */
export type LinkErrandToInboxResult =
  | { kind: "linked"; record: ErrandRecord; changed: boolean; push: ErrandPushOutcome }
  | { kind: "link-conflict"; record: ErrandRecord; requestedEntry: string }
  | { kind: "no-record"; slug: string };

/**
 * Link an in-flight errand to an existing inbox capture.
 *
 * Resolves the record by slug — an absent record is `no-record`. Otherwise the
 * record becomes `inbox`-origin with the supplied back-pointer. Re-linking to
 * the same entry is idempotent: it skips the write but still reconciles the
 * errand ref, so a previously-unpushed record can catch up. Re-linking an
 * already-inbox-origin record to a different entry refuses, because the old
 * capture would otherwise lose its only automatic cleanup path.
 *
 * @param io - Injected git seams and identity.
 * @param params - The errand slug and inbox entry title.
 * @returns The link outcome — linked or no-record.
 */
export async function linkErrandToInbox(
  io: ErrandRecordIO,
  params: LinkErrandToInboxParams,
): Promise<LinkErrandToInboxResult> {
  const slug = params.slug.trim();
  if (slug === "") throw new Error("linkErrandToInbox: slug must be non-empty");
  const originEntry = params.originEntry.trim();
  if (originEntry === "") throw new Error("linkErrandToInbox: originEntry must be non-empty");

  const record = await readErrandRecord(io, slug);
  if (record === null) return { kind: "no-record", slug };
  if (record.origin === "inbox" && record.originEntry !== originEntry) {
    return { kind: "link-conflict", record, requestedEntry: originEntry };
  }

  const linked: ErrandRecord = { ...record, origin: "inbox", originEntry };
  const changed = record.origin !== "inbox" || record.originEntry !== originEntry;
  if (changed) await writeErrandRecord(io, linked);
  const push = await reconcileErrandPush(io);

  return { kind: "linked", record: linked, changed, push };
}
