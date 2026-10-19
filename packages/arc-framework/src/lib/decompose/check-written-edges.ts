/** Provider validity and started-recipient boundaries for edges a cut would write. */
import type { DecomposeContext } from "./context.js";
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeDependencyFacts } from "./dependency-facts.js";
import type { DecomposeDependencyProjection } from "./dependency-projection.js";
import type { DecomposeRefusal } from "./refusal.js";
import { SlugSchema } from "../kernel/index.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { parseLineageRecord } from "../store/kinds/lineage/index.js";
import { readLifecycleMetaFields } from "../store/lifecycle-write.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";
import { decomposeReviseArgv } from "./command-argv.js";
import type { StoreRecord } from "../store/read.js";
import { sameOwner } from "../store/identity.js";
import { decomposeMapRuleRefusal } from "./map-rule-refusal.js";

interface WrittenEdge { provider: string; recipient: string; locus: string }

/** Check written providers against member identities and the observed store before planning a batch. */
export async function checkDecomposeWrittenEdges(ctx: DecomposeContext, map: CutMap, facts: DecomposeDependencyFacts,
  projection: DecomposeDependencyProjection): Promise<DecomposeRefusal | undefined> {
  const members = new Set(map.authoring.destinations.flatMap(destination => destination.kind === "new-member" ? [destination.slug] : []));
  const fields = readLifecycleMetaFields(facts.origin);
  if (fields.status === "refused") return decomposeStoreRefusal(fields.refusal);
  const takenProvider = fields.result.dependsOn.find(provider => members.has(provider));
  if (takenProvider !== undefined) {
    const index = map.machine.outgoingEdges.findIndex(edge => edge.provider.slug === takenProvider);
    return { status: "refused", reason: "provider", class: "recoverable",
      locus: index < 0 ? "Depends On" : `machine.outgoingEdges.${index}.provider.slug`,
      message: `The origin's original edge still names ${JSON.stringify(takenProvider)}, which this cut would give to a new member.`,
      remedy: { text: originEdgeRepair(facts.origin) } };
  }
  const started = checkStartedHomes(facts, projection) ?? checkStartedDependents(map, facts);
  if (started !== undefined) return started;
  for (const edge of writtenEdges(map, projection)) {
    if (members.has(edge.provider)) continue;
    const refusal = await checkWrittenProvider(ctx, facts.origin, edge, fields.result.dependsOn.includes(edge.provider));
    if (refusal !== undefined) return refusal;
  }
  return undefined;
}

function checkStartedHomes(facts: DecomposeDependencyFacts, projection: DecomposeDependencyProjection): DecomposeRefusal | undefined {
  for (const home of facts.homes) {
    if (!home.started) continue;
    const edit = projection.edits.find(candidate => sameOwner(candidate.primary.reference.owner, home.primary.reference.owner));
    if (edit === undefined || !edit.afterTargets.some(provider => !edit.beforeTargets.includes(provider))) continue;
    return decomposeMapRuleRefusal("started-edge", edit.locus,
      `Leave the new edge to ${home.primary.reference.owner.name}'s owner, or choose a stub recipient in the map, then retry.`);
  }
  return undefined;
}

function checkStartedDependents(map: CutMap, facts: DecomposeDependencyFacts): DecomposeRefusal | undefined {
  if (map.authoring.shape !== "extraction") return undefined;
  for (const [index, edge] of map.machine.incomingEdges.entries()) {
    const current = facts.dependents.find(record => record.reference.owner.type === "work-item"
      && record.reference.owner.uid === edge.dependent.uid);
    if (current?.placement?.kind !== "active") continue;
    const disposition = map.authoring.incomingDispositions[index]?.disposition;
    if (disposition?.kind === "replace" && disposition.replacementTargets.length === 1
      && disposition.replacementTargets[0] === map.machine.origin.slug) continue;
    return decomposeMapRuleRefusal("started-edge", `authoring.incomingDispositions.${index}.disposition`,
      "Keep the started dependent's edge on the surviving origin alone; leave any later move to its owner, then retry.");
  }
  return undefined;
}

async function checkWrittenProvider(ctx: DecomposeContext, origin: StoreRecord, edge: WrittenEdge,
  originalProvider: boolean): Promise<DecomposeRefusal | undefined> {
  const lookup = await ctx.executor.store.lookup({ kind: "slug", slug: SlugSchema.parse(edge.provider) });
  if (lookup.status === "ok") return undefined;
  if (lookup.refusal.code !== "not-found" && lookup.refusal.code !== "ambiguous-match") return decomposeStoreRefusal(lookup.refusal);
  const decomposed = lookup.refusal.code === "not-found" && originalProvider
    ? await decomposedProvider(ctx, edge.provider) : { status: "known" as const, value: false };
  if (decomposed.status === "refused") return decomposed.refusal;
  return { status: "refused", reason: "provider", class: "recoverable", locus: edge.locus,
    message: `${edge.recipient}'s written provider ${JSON.stringify(edge.provider)} does not resolve to one current work item.`,
    remedy: { text: decomposed.value ? originEdgeRepair(origin)
      : "Choose drop for this edge's disposition, or choose another provider that resolves by slug, then retry." } };
}

function writtenEdges(map: CutMap, projection: DecomposeDependencyProjection): WrittenEdge[] {
  return [
    ...projection.members.flatMap(member => member.dependsOn.map(provider => ({ provider, recipient: member.slug,
      locus: memberEdgeLocus(map, member.slug, provider) }))),
    ...projection.edits.flatMap(edit => edit.afterTargets.filter(provider => !edit.beforeTargets.includes(provider))
      .map(provider => ({ provider, recipient: edit.primary.reference.owner.name, locus: edit.locus }))),
  ];
}

function memberEdgeLocus(map: CutMap, member: string, provider: string): string {
  const outgoing = map.machine.outgoingEdges.findIndex(edge => edge.provider.slug === provider);
  if (outgoing >= 0) return `authoring.outgoingDispositions.${outgoing}.disposition`;
  const external = map.authoring.externalEdges.findIndex(edge => edge.from === member && edge.to === provider);
  if (external >= 0) return `authoring.externalEdges.${external}.to`;
  const internal = map.authoring.internalEdges.findIndex(edge => edge.from === member && edge.to === provider);
  return internal >= 0 ? `authoring.internalEdges.${internal}.to` : "authoring.destinations";
}

async function decomposedProvider(ctx: DecomposeContext, slug: string): Promise<
  { status: "known"; value: boolean } | { status: "refused"; refusal: DecomposeRefusal }
> {
  const lineage = await ctx.executor.store.lookup({ kind: "lineage", origin: SlugSchema.parse(slug) });
  if (lineage.status === "refused") return lineage.refusal.code === "not-found" || lineage.refusal.code === "ambiguous-match"
    ? { status: "known", value: false } : { status: "refused", refusal: decomposeStoreRefusal(lineage.refusal) };
  const record = await ctx.executor.store.read({ reference: lineage.result.reference });
  if (record.status === "refused") return { status: "refused", refusal: decomposeStoreRefusal(record.refusal) };
  return { status: "known", value: parseLineageRecord(record.result.content)?.kind === "decompose" };
}

function originEdgeRepair(origin: StoreRecord): string {
  const name = origin.reference.owner.name;
  const settle = origin.placement?.kind === "active" ? `Run ${renderV3DecomposeArgv(["arc", "wu", "reconcile", "--apply"])} from ${name}'s checkout`
    : "Edit the origin's Depends On through write-back";
  return `${settle} to settle its original provider edge first. Then generate a fresh starter with ${renderV3DecomposeArgv(["arc", "decompose", name, "--preflight"])}, or revise a stored cut with ${renderV3DecomposeArgv(decomposeReviseArgv(name, { cutMapPath: "<cut-map>" }))}.`;
}
