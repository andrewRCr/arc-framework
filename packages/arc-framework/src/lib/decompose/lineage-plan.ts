/** Terminal lineage projection from a stored cut and current admitted record identities. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeTerminalRecords } from "./acquire-terminal.js";
import type { DecomposeResult, DecomposeRefusal } from "./refusal.js";
import type { StoreRecord } from "../store/read.js";
import type { Mutation } from "../store/write.js";
import { LineageRecordSchema, writeLineageRecord, type LineageRecord, type WorkItemRef } from "../store/kinds/lineage/index.js";
import { recordReferences, sameReference, type OwnerIdentity } from "../store/identity.js";
import { decomposeReadCache } from "./read-cache.js";
import { readDecomposeRetiredLineage } from "./retired-lineage.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { checkDecomposeMemberPlacement } from "./check-member-placement.js";
import { decomposeReviseArgv } from "./command-argv.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";
import { SlugSchema } from "../kernel/index.js";
import type { Store } from "../store/contract.js";
import type { CutMapMachine } from "./cut-map-machine.js";

/** A create-only lineage write and the provider observations that establish its current references. */
export interface DecomposeLineagePlan { lineage: LineageRecord; write: Extract<Mutation, { action: "put" }>; observations: readonly StoreRecord[] }

/** Project an admitted retirement into generation-bearing terminal lineage. */
export async function prepareDecomposeLineage(ctx: DecomposeContext, input: DecomposeTerminalRecords): Promise<DecomposeResult<DecomposeLineagePlan>> {
  const placement = checkDecomposeMemberPlacement(input);
  if (placement !== undefined) return placement;
  const store = decomposeReadCache(ctx.executor.store, input.records);
  const { targets, successors } = destinationReferences(input);
  const owner = input.acquired.primary.reference.owner;
  const incoming = incomingReferences(input, targets);
  if (incoming.status === "refused") return incoming;
  const outgoing: NonNullable<LineageRecord["outgoing"]> = [], observations: StoreRecord[] = [];
  const dispositions = new Map(input.map.authoring.outgoingDispositions.map(entry => [entry.edgeId, entry.disposition]));
  for (const { provider, edgeId } of input.map.machine.outgoingEdges) {
    const current = await providerReference(store, input, provider);
    if (current.status === "refused") return current;
    observations.push(...current.result.records);
    const disposition = dispositions.get(edgeId);
    if (disposition === undefined) return lineageRefusal(input, "authoring.outgoingDispositions", "An outgoing edge has no disposition.");
    outgoing.push({ prerequisite: current.result.reference,
      members: disposition.kind === "targets" ? targetReferences(disposition.targets, targets) : [] });
  }
  outgoing.sort((a, b) => compareNames(a.prerequisite, b.prerequisite));
  const parsed = LineageRecordSchema.safeParse({ schemaVersion: 2, origin: ownerReference(owner), kind: "decompose",
    successors, incoming: incoming.result, outgoing, retiredBranches: input.acquired.primary.links?.branches ?? [] });
  if (!parsed.success) return lineageRefusal(input, "lineage", parsed.error.message);
  const lineage = parsed.data;
  return { status: "ok", result: { lineage, write: { action: "put", reference: recordReferences["lineage/transition"](owner),
    expected: null, content: writeLineageRecord(lineage) }, observations: observations.filter((record, index, all) =>
    all.findIndex(other => sameReference(record.reference, other.reference)) === index) } };
}

function incomingReferences(input: DecomposeTerminalRecords, targets: ReadonlyMap<string, WorkItemRef>): DecomposeResult<LineageRecord["incoming"]> {
  const incoming: LineageRecord["incoming"] = [];
  const dispositions = new Map(input.map.authoring.incomingDispositions.map(entry => [entry.edgeId, entry.disposition]));
  for (const { dependent, edgeId } of input.map.machine.incomingEdges) {
    const current = input.acquired.edges.incoming.find(candidate => candidate.uid === dependent.uid);
    const authored = dispositions.get(edgeId);
    if (authored === undefined) return lineageRefusal(input, "authoring.incomingDispositions", "An incoming edge has no disposition.");
    const disposition = authored.kind === "replace" ? { kind: "replace" as const,
      replacementTargets: targetReferences(authored.replacementTargets, targets) } : authored;
    incoming.push({ dependent: { name: current?.slug ?? dependent.slug, uid: dependent.uid }, disposition });
  }
  return { status: "ok", result: incoming.sort((a, b) => compareNames(a.dependent, b.dependent)) };
}

function lineageRefusal(input: DecomposeTerminalRecords, locus: string, message: string): DecomposeRefusal {
  const argv = decomposeReviseArgv(input.acquired.primary.reference.owner.name);
  return { status: "refused", reason: "source-artifact", class: "recoverable", locus, message,
    remedy: { text: `Repair the named lineage references with ${renderV3DecomposeArgv(argv)}, then finish the revised cut.`, argv: [...argv] } };
}

function ownerReference(owner: OwnerIdentity): WorkItemRef {
  return { name: owner.name, ...(owner.type === "work-item" && owner.uid !== undefined ? { uid: owner.uid } : {}) };
}

function destinationReferences(input: DecomposeTerminalRecords): { targets: Map<string, WorkItemRef>; successors: WorkItemRef[] } {
  const targets = new Map<string, WorkItemRef>(), successors: WorkItemRef[] = [];
  for (const member of input.members) {
    if (member.primary === null) continue;
    const reference = ownerReference(member.primary.reference.owner);
    targets.set(member.slug, reference);
    successors.push(reference);
  }
  for (const home of input.homes) {
    const destination = input.map.authoring.destinations.find(candidate => candidate.destinationId === home.destinationId);
    if (destination?.kind !== "existing-home" || destination.target.kind !== "work-unit") continue;
    const reference = ownerReference(home.primary.reference.owner);
    targets.set(destination.target.slug, reference);
    targets.set(reference.name, reference);
  }
  return { targets, successors: successors.sort(compareNames) };
}

function targetReferences(names: readonly string[], targets: ReadonlyMap<string, WorkItemRef>): WorkItemRef[] {
  return names.map(name => targets.get(name) ?? { name: SlugSchema.parse(name) }).sort(compareNames);
}

function compareNames(left: WorkItemRef, right: WorkItemRef): number {
  return Buffer.compare(Buffer.from(left.name), Buffer.from(right.name));
}

async function providerReference(store: Store, input: DecomposeTerminalRecords, provider: CutMapMachine["outgoingEdges"][number]["provider"]): Promise<DecomposeResult<{ reference: WorkItemRef; records: StoreRecord[] }>> {
  if (provider.uid === undefined) return { status: "ok", result: { reference: { name: provider.slug }, records: [] } };
  const current = input.acquired.lifecycleEntries.find(entry => entry.reference.owner.type === "work-item"
    && entry.reference.owner.uid === provider.uid);
  if (current !== undefined) {
    const read = await store.read({ reference: current.reference });
    return read.status === "refused" ? decomposeStoreRefusal(read.refusal)
      : { status: "ok", result: { reference: ownerReference(read.result.reference.owner), records: [read.result] } };
  }
  const retired = await readDecomposeRetiredLineage(store, { name: provider.slug, uid: provider.uid });
  if (retired.status === "refused") return retired;
  return { status: "ok", result: retired.result === null ? { reference: { name: provider.slug, uid: provider.uid }, records: [] }
    : { reference: ownerReference(retired.result.reference.owner), records: [retired.result] } };
}
