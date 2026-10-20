/** Provider-aware reconciliation of retained members' seeded fields. */
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { DecomposeRevisionInput } from "./acquire-revision.js";
import type { DecomposeResult } from "./refusal.js";
import { readLifecycleMetaFields } from "../store/lifecycle-write.js";
import { writeMetaDependsOn, writeMetaCohort } from "../store/kinds/meta/writers.js";
import { decomposeDependencyContributions, type DecomposeDependencyContribution } from "./dependency-contributions.js";
import { observeDecomposeSeededProvider, sameDecomposeSeededProvider, type DecomposeSeededProvider } from "./seeded-provider.js";
import { resolveDecomposeRetiredEdge } from "./retired-edge.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { decomposeReadCache } from "./read-cache.js";

/** A retained member's proposed content and provider records supporting its edge identities. */
export interface DecomposeRevisionSeeds { content: string; records: readonly StoreRecord[] }

/** Replace only prior seeded providers, preserving unrelated edges and compatible current aliases. */
export async function projectDecomposeRevisionSeeds(store: Store, prior: Pick<DecomposeRevisionInput, "map" | "members">, member: StoreRecord,
  desired: { dependsOn: readonly string[]; cohort: string | null; addedSlugs: ReadonlySet<string> }): Promise<DecomposeResult<DecomposeRevisionSeeds>> {
  store = decomposeReadCache(store, [member]);
  const fields = readLifecycleMetaFields(member);
  if (fields.status === "refused") return decomposeStoreRefusal(fields.refusal);
  const actual = await observeProviders(store, fields.result.dependsOn);
  if (actual.status === "refused") return actual;
  const old = await priorProviders(store, prior, member);
  if (old.status === "refused") return old;
  const next = await observeProviders(store, desired.dependsOn, desired.addedSlugs);
  if (next.status === "refused") return next;
  const unresolved = actual.result.find(provider => provider.uid === undefined && old.result.some(seed => seed.slug === provider.slug));
  if (unresolved !== undefined) return { status: "refused", reason: "seed-divergence", class: "recoverable", locus: `${member.reference.owner.name}.Depends On`,
    message: `The actual dependency ${JSON.stringify(unresolved.slug)} has no unique provider identity.`,
    remedy: { text: "Settle this dependency through write-back to its intended current provider, or remove the disputed edge; then prepare a fresh revision preview and obtain approval." } };
  const sameProved = (left: DecomposeSeededProvider, right: DecomposeSeededProvider): boolean =>
    left.uid !== undefined && right.uid !== undefined && left.uid === right.uid;
  const targets = actual.result.filter(provider => !old.result.some(seed => sameProved(seed, provider))
    || next.result.some(seed => sameProved(seed, provider)));
  for (const seed of next.result) {
    if (!targets.some(provider => sameDecomposeSeededProvider(seed, provider))) targets.push(seed);
  }
  const dependsOn = targets.map(provider => provider.slug);
  const changed = JSON.stringify(dependsOn) !== JSON.stringify(fields.result.dependsOn) || desired.cohort !== fields.result.cohort;
  return { status: "ok", result: { content: changed ? writeMetaCohort(writeMetaDependsOn(member.content, dependsOn), desired.cohort) : member.content,
    records: [...actual.result, ...old.result, ...next.result].flatMap(provider => provider.records) } };
}

async function observeProviders(store: Store, names: readonly string[], pending: ReadonlySet<string> = new Set()): Promise<DecomposeResult<DecomposeSeededProvider[]>> {
  const providers: DecomposeSeededProvider[] = [];
  for (const name of names) {
    if (pending.has(name)) { providers.push({ slug: name, records: [] }); continue; }
    const provider = await observeDecomposeSeededProvider(store, name);
    if (provider.status === "refused") return provider;
    providers.push(provider.result);
  }
  return { status: "ok", result: providers };
}

async function priorProviders(store: Store, prior: Pick<DecomposeRevisionInput, "map" | "members">,
  member: StoreRecord): Promise<DecomposeResult<DecomposeSeededProvider[]>> {
  const map = prior.map;
  const recipients = new Map(map.authoring.destinations.flatMap(destination => destination.kind === "new-member" ? [[destination.slug, destination.slug] as const] : []));
  const seeds = decomposeDependencyContributions(map, recipients).flatMap(seed => seed.kind !== "incoming"
    && seed.recipient === member.reference.owner.name ? [seed] : []);
  const providers: DecomposeSeededProvider[] = [];
  for (const seed of seeds) {
    const original = await observePriorProvider(store, prior, seed);
    if (original.status === "refused") return original;
    providers.push(original.result);
    const providerUid = seed.kind === "internal" ? original.result.uid : seed.providerUid;
    const retired = await resolveDecomposeRetiredEdge(store, seed.provider, member.reference.owner, providerUid);
    if (retired.status === "refused") return retired;
    if (retired.result === null) continue;
    const observed = original.result;
    observed.records = [...observed.records, ...retired.result.records];
    if (retired.result.disposition.kind !== "replace") continue;
    const replacements = await observeProviders(store, retired.result.disposition.replacementTargets);
    if (replacements.status === "refused") return replacements;
    providers.push(...replacements.result.map(provider => ({ ...provider, records: [...provider.records, ...retired.result?.records ?? []] })));
  }
  return { status: "ok", result: providers };
}

async function observePriorProvider(store: Store, prior: Pick<DecomposeRevisionInput, "members">,
  seed: Exclude<DecomposeDependencyContribution, { kind: "incoming" }>): Promise<DecomposeResult<DecomposeSeededProvider>> {
  const member = seed.kind === "internal" ? prior.members.find(candidate => candidate.slug === seed.provider) : undefined;
  return observeDecomposeSeededProvider(store, seed.provider, member?.uid ?? seed.providerUid);
}
