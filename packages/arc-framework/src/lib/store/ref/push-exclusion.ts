/** Contain damaged publication endpoints while retaining independently publishable state. */

import type { FamilyId } from "../catalog.js";
import type { PublishOutcome, PullNotice } from "../sync.js";
import type { RefBackendContext } from "./context.js";
import type { RefPushListing } from "./push-listing.js";
import { refMovementFamilies, statePushFamilies } from "./push-families.js";
import { checkSyncRefTip } from "./sync-tip.js";
import { readUnpublishedRefBatches, expandRefBatchExclusion } from "./sync-batches.js";
import { holdLifecycleRef } from "./sync-lifecycle-holds.js";

/** Exclusions retain failure facts independently of the publishing loop's final measurements. */
export interface RefPushExclusion {
  listing: RefPushListing;
  failures: { families: FamilyId[]; failure: Extract<PublishOutcome, { status: "failed" }>["failure"] }[];
}

/** Reject unusable captured trees without changing their tips or holding back healthy families. */
export async function excludeBrokenPushRefs(context: RefBackendContext, listing: RefPushListing,
  notices: readonly PullNotice[] = []): Promise<RefPushExclusion> {
  const seeds = notices.filter((notice) => notice.kind === "namespace-corrupt" || notice.kind === "end-pending" || notice.kind === "tracking-update-failed");
  const excluded = new Set(listing.pending), families = new Set<FamilyId>();
  for (const { ref } of seeds) holdLifecycleRef(excluded, ref);
  const refusals: { condition: string; remedy: { text: string } }[] = [
    ...seeds, ...pendingEndRefusals(listing.pending, seeds, notices),
  ];
  for (const { ref, next } of listing.changes) {
    if (!next) continue;
    const refusal = await checkSyncRefTip(context, ref, next);
    if (!refusal) continue;
    excluded.add(ref); refusals.push(refusal);
  }
  if (!excluded.size) return { listing, failures: [] };
  const batches = await readUnpublishedRefBatches(context, listing);
  if (batches.status === "refused") return { listing: { ...listing, changes: [] }, failures: [{
    families: statePushFamilies(await context.identity()), failure: { code: "refused", class: "terminal",
      message: "The push retained all unpublished refs because atomic batch membership is unavailable.",
      condition: batches.refusal.condition, remedy: batches.refusal.remedy },
  }] };
  const commits = batches.result;
  expandRefBatchExclusion(excluded, commits);
  for (const ref of excluded) for (const { revision, parent } of commits.get(ref) ?? []) {
    for (const family of await refMovementFamilies(context, ref, parent, revision)) families.add(family);
  }
  return { listing: { ...listing, changes: listing.changes.filter(({ ref }) => !excluded.has(ref)) },
    failures: families.size ? [{ families: [...families], failure: { code: "refused", class: "terminal",
      message: `The push excluded ${[...excluded].join(", ")}.`, condition: refusals.map(({ condition }) => condition).join("\n"),
      remedy: { text: refusals.map(({ remedy }) => remedy.text).join("\n") } } }] : [] };
}

/** Supply one reason for each pending seed that an existing ref-keyed seed does not already explain. */
function pendingEndRefusals(pending: ReadonlySet<string>, seeds: readonly { ref: string }[],
  notices: readonly PullNotice[]): { condition: string; remedy: { text: string } }[] {
  return [...pending].flatMap(ref => {
    const live = ref.replace("refs/arc/history/", "refs/arc/"), history = live.replace("refs/arc/", "refs/arc/history/");
    return seeds.some(notice => notice.ref === live || notice.ref === history) ? [] : [pendingEndRefusal(ref, notices)];
  });
}

/** Preserve a kept ref notice or item-keyed double end before the pending-history fallback. */
function pendingEndRefusal(ref: string, notices: readonly PullNotice[]): { condition: string; remedy: { text: string } } {
  const live = ref.replace("refs/arc/history/", "refs/arc/"), history = live.replace("refs/arc/", "refs/arc/history/");
  const family = live.startsWith("refs/arc/cohort/") ? "cohort" : "work-item", uid = live.split("/").at(-1);
  const related = notices.find(notice => "ref" in notice && (notice.ref === live || notice.ref === history));
  const ended = notices.find(notice => notice.kind === "ended-twice" && notice.item.type === family
    && "uid" in notice.item && notice.item.uid === uid);
  return related ?? ended ?? { condition: "The end record is present but the state remote has no retained history for this item.",
    remedy: { text: `Have a clone holding ${history} push it back to the state remote, then pull again.` } };
}
