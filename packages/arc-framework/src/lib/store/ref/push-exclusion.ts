/** Contain damaged publication endpoints while retaining independently publishable state. */

import type { FamilyId } from "../catalog.js";
import type { PublishOutcome, PullNotice } from "../sync.js";
import type { RefBackendContext } from "./context.js";
import type { RefPushListing } from "./push-listing.js";
import { refMovementFamilies } from "./push-families.js";
import { checkSyncRefTip } from "./sync-tip.js";
import { readUnpublishedRefBatches, expandRefBatchExclusion } from "./sync-batches.js";

/** Exclusions retain failure facts independently of the publishing loop's final measurements. */
export interface RefPushExclusion {
  listing: RefPushListing;
  failures: { families: FamilyId[]; failure: Extract<PublishOutcome, { status: "failed" }>["failure"] }[];
}

/** Reject unusable captured trees without changing their tips or holding back healthy families. */
export async function excludeBrokenPushRefs(context: RefBackendContext, listing: RefPushListing,
  notices: readonly PullNotice[] = []): Promise<RefPushExclusion> {
  const seeds = notices.filter((notice) => notice.kind === "namespace-corrupt" || notice.kind === "end-pending");
  const excluded = new Set([...seeds.map(({ ref }) => ref), ...listing.pending]), families = new Set<FamilyId>();
  const refusals: { condition: string; remedy: { text: string } }[] = [...seeds];
  for (const { ref, next } of listing.changes) {
    if (!next) continue;
    const refusal = await checkSyncRefTip(context, ref, next);
    if (!refusal) continue;
    excluded.add(ref); refusals.push(refusal);
  }
  if (!excluded.size) return { listing, failures: [] };
  const commits = await readUnpublishedRefBatches(context, listing);
  expandRefBatchExclusion(excluded, commits);
  for (const ref of excluded) for (const { revision, parent } of commits.get(ref) ?? []) {
    for (const family of await refMovementFamilies(context, ref, parent, revision)) families.add(family);
  }
  return { listing: { ...listing, changes: listing.changes.filter(({ ref }) => !excluded.has(ref)) },
    failures: families.size ? [{ families: [...families], failure: { code: "refused", class: "terminal",
      message: `The push excluded ${[...excluded].join(", ")}.`, condition: refusals.map(({ condition }) => condition).join("\n"),
      remedy: { text: refusals.map(({ remedy }) => remedy.text).join("\n") } } }] : [] };
}
