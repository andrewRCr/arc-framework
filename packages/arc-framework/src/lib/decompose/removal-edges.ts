/** Surviving dependency and pause edges that would lose a removed provider. */
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { DecomposeSurvivingMember } from "./removal-holders.js";
import type { DecomposeRefusal, DecomposeResult } from "./refusal.js";
import { SlugSchema } from "../kernel/index.js";
import { sameOwner } from "../store/identity.js";
import { decomposeStoreRefusal } from "./refusal.js";

/** Count literal current names and aliases that still resolve to these generations. */
export async function decomposeRemovedMemberNames(store: Store, members: readonly StoreRecord[]): Promise<DecomposeResult<ReadonlySet<string>>> {
  const names = new Set(members.map(member => member.reference.owner.name));
  const aliases = members.flatMap(member => (member.aliases ?? []).map(alias => ({ member, alias })));
  for (const { member, alias } of aliases) {
    if (names.has(alias)) continue;
    const lookup = await store.lookup({ kind: "slug", slug: SlugSchema.parse(alias) });
    if (lookup.status === "refused") {
      if (lookup.refusal.code === "not-found") continue;
      return decomposeStoreRefusal(lookup.refusal);
    }
    if (sameOwner(lookup.result.reference.owner, member.reference.owner)) names.add(alias);
  }
  return { status: "ok", result: names };
}

/** Name every surviving edge for its owner to retarget before removing a stub. */
export function checkDecomposeRemovalEdges(entries: readonly DecomposeSurvivingMember[], names: ReadonlySet<string>): DecomposeRefusal | undefined {
  const dependencies: string[] = [], waits: string[] = [], pausedOwners: string[] = [];
  for (const entry of entries) {
    const owner = entry.reference.owner.name;
    for (const target of entry.fields.dependsOn) if (names.has(target)) dependencies.push(`${owner}.Depends On → ${target}`);
    const waiting = entry.fields.pause?.waitsOn;
    if (waiting?.kind !== "work-unit" || !names.has(waiting.slug)) continue;
    waits.push(`${owner}.pause.waits-on → ${waiting.slug}`);
    pausedOwners.push(owner);
  }
  if (dependencies.length === 0 && waits.length === 0) return undefined;
  const repairs = dependencyRepairs(entries, names);
  for (const owner of pausedOwners) repairs.push(`Use arc pause ${owner} --waits-on <other>, --waits-on-note <text>, or --no-waits-on to settle its pause edge.`);
  return { status: "refused", reason: "removed-stub-held", class: "recoverable", locus: "surviving-edges",
    message: `Surviving edges still name removed stubs: ${[...dependencies, ...waits].join("; ")}.`, remedy: { text: repairs.join(" ") } };
}


function dependencyRepairs(entries: readonly DecomposeSurvivingMember[], names: ReadonlySet<string>): string[] {
  const holders = entries.filter(entry => entry.fields.dependsOn.some(target => names.has(target)));
  const repairs = holders.some(entry => entry.proposedCreation !== true)
    ? ["Have each owner retarget or drop its named Depends On edge through write-back."] : [];
  const creations = holders.filter(entry => entry.proposedCreation === true).map(entry => entry.reference.owner.name);
  if (creations.length > 0) repairs.push(`Retarget or drop the named edge in the revised map for newly created members: ${creations.join(", ")}.`);
  return repairs;
}
