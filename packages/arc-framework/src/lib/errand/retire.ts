/**
 * `retireErrand` — the composed core of `arc errand retire`.
 *
 * Retires a full-protection errand's identity record without touching its
 * branch. The promotion counterpart to `close`: when an errand crosses the
 * work-unit threshold its branch is renamed into the WU branch and lives on, so
 * only the record is removed (the WU meta now supersedes it) and the removal is
 * pushed. Composes the separable `removeErrandRecord` primitive with the same
 * push reconcile `close` runs — not `closeErrand` itself, whose reap would
 * delete the branch promotion preserves.
 *
 * There is no containment-safety gate: with no reap, the commits live on under
 * the renamed branch, so retiring the record is always safe.
 *
 * The git seams and identity are injected (three-layer architecture).
 *
 * @module
 */

import { reconcileErrandPush, type ErrandPushOutcome } from "./merge.js";
import { readErrandRecord, removeErrandRecord, type ErrandRecord } from "./record.js";
import type { ErrandRecordIO } from "./ref-tree.js";

/** Operands for {@link retireErrand}. */
export interface RetireErrandParams {
  /** The errand slug — its logical identity and the record's tree key. */
  slug: string;
}

/** Outcome of {@link retireErrand}. */
export type RetireErrandResult =
  | { kind: "retired"; record: ErrandRecord; push: ErrandPushOutcome }
  | { kind: "no-record"; slug: string };

/**
 * Retire an errand record: remove it and push the removal, leaving the branch
 * untouched.
 *
 * Resolves the record by slug — an absent record is `no-record` (nothing to
 * retire). Otherwise removes the record and pushes the removal through the same
 * reconcile `close` uses.
 *
 * @param io - Injected git seams and identity.
 * @param params - The errand slug.
 * @returns The retire outcome — retired or no-record.
 */
export async function retireErrand(
  io: ErrandRecordIO,
  params: RetireErrandParams,
): Promise<RetireErrandResult> {
  const slug = params.slug.trim();
  if (slug === "") throw new Error("retireErrand: slug must be non-empty");

  const record = await readErrandRecord(io, slug);
  if (record === null) return { kind: "no-record", slug };

  await removeErrandRecord(io, slug);
  const push = await reconcileErrandPush(io);

  return { kind: "retired", record, push };
}
