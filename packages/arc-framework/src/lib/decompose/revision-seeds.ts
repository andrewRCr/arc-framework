/** Provider-aware reconciliation of retained members' seeded fields. */
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeResult } from "./refusal.js";
import { readLifecycleMetaFields } from "../store/lifecycle-write.js";
import { writeMetaDependsOn, writeMetaCohort } from "../store/kinds/meta/writers.js";
import { decomposeDependencyContributions } from "./dependency-contributions.js";
import { observeDecomposeSeededProvider, sameDecomposeSeededProvider, type DecomposeSeededProvider } from "./seeded-provider.js";
import { resolveDecomposeRetiredEdge } from "./retired-edge.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { decomposeReadCache } from "./read-cache.js";

/** A retained member's proposed content and provider records supporting its edge identities. */
export interface DecomposeRevisionSeeds { content: string; records: readonly StoreRecord[] }

/** Replace only prior seeded providers, preserving unrelated edges and compatible current aliases. */
export async function projectDecomposeRevisionSeeds(store: Store, prior: CutMap, member: StoreRecord,
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
  const targets = actual.result.filter(provider => !old.result.some(seed => sameDecomposeSeededProvider(seed, provider))
    || next.result.some(seed => sameDecomposeSeededProvider(seed, provider)));
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

async function priorProviders(store: Store, map: CutMap, member: StoreRecord): Promise<DecomposeResult<DecomposeSeededProvider[]>> {
  const recipients = new Map(map.authoring.destinations.flatMap(destination => destination.kind === "new-member" ? [[destination.slug, destination.slug] as const] : []));
  const seeds = decomposeDependencyContributions(map, recipients).flatMap(seed => seed.kind !== "incoming"
    && seed.recipient === member.reference.owner.name ? [seed] : []);
  const providers: DecomposeSeededProvider[] = [];
  for (const seed of seeds) {
    const original = await observeDecomposeSeededProvider(store, seed.provider, seed.providerUid);
    if (original.status === "refused") return original;
    providers.push(original.result);
    const retired = await resolveDecomposeRetiredEdge(store, seed.provider, member.reference.owner, seed.providerUid);
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
