/** Reserve caller-planned Errand UIDs against the captured owner namespace. */

import type { OwnerIdentity, RecordReference } from "../identity.js";
import type { StoreResult } from "../refusal.js";
import type { Mutation } from "../write.js";
import { isArchiveMetadataPath, isArchiveRef } from "./archive-read.js";
import { readRefTrees } from "./batch-read.js";
import type { RefBackendContext } from "./context.js";
import { readLineageOwners } from "./lineage-resolution.js";

const registryRef = "refs/arc/project/registry";

interface PlannedRecords {
  records: ReadonlyMap<string, RecordReference>;
  held: ReadonlyMap<string, string>;
  lineage: readonly OwnerIdentity[];
}

/** Identify planned births and any captured coordinates that already hold their UIDs. */
export async function capturePlannedRecords(context: RefBackendContext, writes: readonly Mutation[],
  tips: ReadonlyMap<string, string>): Promise<StoreResult<PlannedRecords>> {
  const records = requestedPlannedRecords(writes);
  const held = new Map([...records.keys()].flatMap(uid => {
    const ref = ownerRefs(uid).find(candidate => tips.has(candidate));
    return ref ? [[uid, ref] as const] : [];
  }));
  const needsLineage = held.size < records.size || writes.some(mutation => [mutation.reference, ...mutation.resolves ?? []]
    .some(reference => context.registry[reference.kind].family === "lineage"));
  const lineage = needsLineage ? await readLineageOwners(context, tips) : { status: "ok" as const, result: [] };
  if (lineage.status === "refused") return lineage;
  for (const owner of lineage.result) {
    if (owner.type === "work-item" && owner.uid && records.has(owner.uid) && !held.has(owner.uid)) held.set(owner.uid, registryRef);
  }
  if (held.size < records.size) {
    const pending = new Set([...records.keys()].filter(uid => !held.has(uid)));
    for (const [uid, location] of await archiveUidClaims(context, tips, pending)) held.set(uid, location);
  }
  return { status: "ok", result: { records, held, lineage: lineage.result } };
}

function requestedPlannedRecords(writes: readonly Mutation[]): ReadonlyMap<string, RecordReference> {
  return new Map(writes.flatMap(({ action, expected, reference }) => {
    const { kind, owner } = reference;
    return action === "put" && expected === null && kind === "work-item/record" && owner.type === "work-item" && owner.uid
      ? [[owner.uid, reference] as const] : [];
  }));
}

function ownerRefs(uid: string): string[] {
  return [`refs/arc/work/${uid}`, `refs/arc/cohort/${uid}`, `refs/arc/history/work/${uid}`, `refs/arc/history/cohort/${uid}`];
}

async function archiveUidClaims(context: RefBackendContext, tips: ReadonlyMap<string, string>,
  pending: ReadonlySet<string>): Promise<Map<string, string>> {
  const held = new Map<string, string>();
  const quarters = await readRefTrees(context, new Map([...tips].filter(([ref]) => isArchiveRef(ref))));
  for (const [ref, entries] of quarters) {
    for (const { path } of entries) {
      if (!isArchiveMetadataPath(path)) continue;
      const uid = path.slice(path.indexOf("/metadata-") + "/metadata-".length, -".json".length);
      if (pending.has(uid)) held.set(uid, `${ref}:${path}`);
    }
  }
  return held;
}

/** Re-resolve planned births if their captured ownership basis changes before the locked read. */
export function changedPlannedBirthRefs(uids: readonly string[], before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>): string[] {
  if (uids.length === 0) return [];
  const quarters = [...new Set([...before.keys(), ...after.keys()])].filter(isArchiveRef);
  return [...uids.flatMap(ownerRefs), registryRef, ...quarters].filter(ref => before.get(ref) !== after.get(ref));
}
