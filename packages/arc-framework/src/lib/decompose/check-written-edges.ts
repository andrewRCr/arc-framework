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
import { decomposeMapRuleRefusal } from "./map-rule-refusal.js";
import { decomposeDependencyContributions } from "./dependency-contributions.js";

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
  const started = checkStartedHomes(map, facts) ?? checkStartedDependents(map, facts);
  if (started !== undefined) return started;
  for (const edge of writtenEdges(map, facts, projection)) {
    if (members.has(edge.provider)) continue;
    const refusal = await checkWrittenProvider(ctx, facts.origin, edge, fields.result.dependsOn.includes(edge.provider));
    if (refusal !== undefined) return refusal;
  }
  return undefined;
}

function checkStartedHomes(map: CutMap, facts: DecomposeDependencyFacts): DecomposeRefusal | undefined {
  const recipients = new Map<string, string>();
  for (const destination of map.authoring.destinations) {
    if (destination.kind === "existing-home" && destination.target.kind === "work-unit") {
      recipients.set(destination.target.slug, `home:${destination.destinationId}`);
    }
  }
  const contributions = decomposeDependencyContributions(map, recipients);
  for (const home of facts.homes) {
    if (!home.started) continue;
    const fields = readLifecycleMetaFields(home.primary);
    if (fields.status === "refused") return decomposeStoreRefusal(fields.refusal);
    const edge = contributions.find(candidate => candidate.kind !== "incoming" && candidate.recipient === `home:${home.destinationId}`
      && !fields.result.dependsOn.includes(candidate.provider));
    if (edge === undefined) continue;
    return decomposeMapRuleRefusal("started-edge", edge.locus,
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

function writtenEdges(map: CutMap, facts: DecomposeDependencyFacts, projection: DecomposeDependencyProjection): WrittenEdge[] {
  const recipients = new Map<string, string>();
  for (const destination of map.authoring.destinations) {
    if (destination.kind === "new-member") recipients.set(destination.slug, `member:${destination.slug}`);
    else if (destination.kind === "existing-home" && destination.target.kind === "work-unit") {
      const owner = facts.homes.find(home => home.destinationId === destination.destinationId)?.primary.reference.owner;
      if (owner?.type === "work-item" && owner.uid !== undefined) recipients.set(destination.target.slug, owner.uid);
    }
  }
  const contributions = decomposeDependencyContributions(map, recipients);
  const locus = (recipient: string, provider: string, fallback: string): string => contributions.find(candidate =>
    candidate.recipient === recipient && (candidate.kind === "incoming"
      ? candidate.replacements.includes(provider) : candidate.provider === provider))?.locus ?? fallback;
  return [
    ...projection.members.flatMap(member => member.dependsOn.map(provider => ({ provider, recipient: member.slug,
      locus: locus(`member:${member.slug}`, provider, "authoring.destinations") }))),
    ...projection.edits.flatMap(edit => edit.afterTargets.filter(provider => !edit.beforeTargets.includes(provider))
      .map(provider => ({ provider, recipient: edit.primary.reference.owner.name,
        locus: locus(edit.primary.reference.owner.type === "work-item" ? edit.primary.reference.owner.uid ?? "" : "", provider, edit.locus) }))),
  ];
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
