/** Validation of member fields seeded by a stored decomposition. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeTerminalRecords, DecomposeTerminalMember } from "./acquire-terminal.js";
import type { DecomposeResult, DecomposeRefusal } from "./refusal.js";
import type { StoreRecord } from "../store/read.js";
import type { Store } from "../store/contract.js";
import type { DecomposeDependencyContribution } from "./dependency-contributions.js";
import { readLifecycleMetaFields } from "../store/lifecycle-write.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { decomposeDependencyContributions } from "./dependency-contributions.js";
import { checkDecomposeMemberPlacement } from "./check-member-placement.js";
import { decomposeReadCache } from "./read-cache.js";
import { observeDecomposeSeededProvider, satisfiesDecomposeSeededProvider, type DecomposeSeededProvider } from "./seeded-provider.js";
import { sameReference } from "../store/identity.js";
import { decomposeReviseArgv } from "./command-argv.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";

/** Read-only evidence supporting acceptance of the members' seeded fields. */
export interface DecomposeSeededFields { observations: readonly StoreRecord[] }
/** Require the fields the cut decided while allowing member grooming. */
export async function checkDecomposeSeededFields(ctx: DecomposeContext, input: DecomposeTerminalRecords): Promise<DecomposeResult<DecomposeSeededFields>> {
  const placement = checkDecomposeMemberPlacement(input);
  if (placement !== undefined) return placement;
  const store = decomposeReadCache(ctx.executor.store, input.records);
  const contributions = decomposeDependencyContributions(input.map, new Map(input.members.map(member => [member.slug, member.slug])));
  const observations: StoreRecord[] = [];
  for (const member of input.members) {
    const checked = await checkMemberProviders(store, input, member, contributions);
    if (checked.status === "refused") return checked;
    observations.push(...checked.result);
  }
  return { status: "ok", result: { observations: observations.filter((record, index) =>
    observations.findIndex(other => sameReference(other.reference, record.reference)) === index) } };
}

async function checkMemberProviders(store: Store, input: DecomposeTerminalRecords, member: DecomposeTerminalMember,
  contributions: readonly DecomposeDependencyContribution[]): Promise<DecomposeResult<readonly StoreRecord[]>> {
  if (member.primary === null) throw new Error("Member placement validation requires a present primary.");
  const fields = readLifecycleMetaFields(member.primary);
  if (fields.status === "refused") return decomposeStoreRefusal(fields.refusal);
  const current: DecomposeSeededProvider[] = [], records: StoreRecord[] = [];
  for (const slug of fields.result.dependsOn) {
    const provider = await observeDecomposeSeededProvider(store, slug);
    if (provider.status === "refused") return provider;
    current.push(provider.result);
    records.push(...provider.result.records);
  }
  const origin = input.acquired.primary.reference.owner;
  const originRefusal = memberOriginRefusal(input, member, current);
  if (originRefusal !== undefined) return originRefusal;
  for (const seed of contributions) {
    if (seed.kind === "incoming" || seed.recipient !== member.slug) continue;
    const provider = await satisfiesDecomposeSeededProvider(store, seed.provider, current, member.primary.reference.owner, seed.providerUid);
    if (provider.status === "refused") return provider;
    records.push(...provider.result.records);
    if (!provider.result.held) return missingSeed(member.slug, seed.provider, origin.name);
  }
  return { status: "ok", result: records };
}

function memberOriginRefusal(input: DecomposeTerminalRecords, member: DecomposeTerminalMember,
  current: readonly DecomposeSeededProvider[]): DecomposeRefusal | undefined {
  const origin = input.acquired.primary.reference.owner;
  if (input.map.authoring.shape === "extraction"
    || !current.some(provider => origin.type === "work-item" && provider.uid === origin.uid)) return undefined;
  const action = member.primary?.placement?.kind === "backlog" ? `Remove ${member.slug}'s edge` : `Have ${member.slug}'s owner remove its edge`;
  return { status: "refused", reason: "member-depends-on-origin", class: "recoverable", locus: `${member.slug}.Depends On`,
    remedy: { text: `${action} to the retiring origin through write-back, then finish the cut.` } };
}

function missingSeed(member: string, provider: string, origin: string): DecomposeRefusal {
  const argv = decomposeReviseArgv(origin);
  return { status: "refused", reason: "seed-divergence", class: "recoverable", locus: `${member}.Depends On`,
    remedy: { text: `Restore ${JSON.stringify(provider)} on ${member} through write-back, or ${renderV3DecomposeArgv(argv)} to change the seeded edge.`, argv: [...argv] } };
}
