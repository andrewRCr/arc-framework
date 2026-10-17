/** Entry adoption plans join Errand identity transitions in one batch. */
import { randomUUID } from "node:crypto";
import { OwnerIdentitySchema, recordReferences } from "../store/identity.js";
import { drawEntryId, writeEntryFields } from "../store/kinds/entry-fields.js";
import type { Mutation } from "../store/write.js";
import { resolveEntryList, resolveWorkItemList, failure, withProvenance, type ResolvedEntryList } from "./lists.js";
import { rowsInList } from "./listing.js";
import { prepareEntryMove } from "./mover.js";
import { listCoordinate, latestRoutingReceipt } from "./receipts.js";
import { openErrandHolding } from "./errand-home.js";
import { readQueueState, renderQueueSet } from "./queue-storage.js";
import type { InboxContext, InboxOutcome } from "./types.js";
/** A start reports its exact qualified capture origin. */
export interface ErrandAdoption { origin: { title: string; sourceDigest: null; executeBound: false; version: string } | null; writes: Mutation[]; closed?: string }
/** Prepare capture adoption or a fresh text description without writing.
 * @param input - Errand identity and optional qualified source.
 * @param context - Invocation's store and identity.
 * @returns Atomic companion writes and exact origin, or refusal.
 */
export async function prepareErrandAdoption(input: { slug: string; from?: string; intent?: string; partial?: boolean }, context: InboxContext): Promise<InboxOutcome<ErrandAdoption>> {
  if (input.from === undefined) return prepareTextDescription(input, context);
  const match = /^(personal|project):([0-9a-f]{8})$/u.exec(input.from);
  if (match === null) return failure("invalid-input", "An inbox origin must be personal:<id> or project:<id>.", "Read arc inbox personal or arc inbox project and use its qualified ID.");
  const inbox = match[1] as "personal" | "project", id = match[2] ?? "";
  const source = await resolveEntryList(inbox, context);
  if (source.status === "refused") return source;
  const capture = await readAdoptedCapture(input.slug, input.from, id, source.result, context);
  if (capture.status === "refused") return capture;
  if (capture.result.kind === "resume") return { status: "ok", result: { origin: capture.result.origin, writes: [] } };
  const { entry, closed } = capture.result;
  const queue = await readQueueState(context);
  if (queue.status === "refused") return queue;
  const writes: Mutation[] = [];
  if (!input.partial) {
    const destination = await descriptionFor(input.slug, context);
    if (destination.status === "refused") return destination;
    const held = rowsInList(destination.result);
    if (held.status === "refused") return held;
    if (held.result.some((row) => row.id === id)) return failure("id-clash", `Errand ${input.slug} already holds ID ${id}.`, "Inspect its description before linking this entry.");
    writes.push(...prepareEntryMove({ source: source.result, destination: destination.result, entry, section: "Description" }, context).writes);
  }
  if (queue.result.members.some((member) => member.id === id && member.inbox === inbox)) {
    const rendered = renderQueueSet(queue.result, queue.result.members.filter((member) => member.id !== id || member.inbox !== inbox), new Map());
    writes.push({ action: "put", reference: queue.result.reference, content: rendered.content, expected: queue.result.saved?.version ?? null });
  }
  return { status: "ok", result: { origin: { title: input.from, sourceDigest: null, executeBound: false, version: entry.version }, writes, ...(closed === undefined ? {} : { closed }) } };
}

async function descriptionFor(slug: string, context: InboxContext): Promise<InboxOutcome<ResolvedEntryList>> {
  const existing = await resolveWorkItemList(slug, context);
  if (existing.status === "ok") {
    if (existing.result.kind !== "work-item/description") return failure("invalid-destination", `${slug} is a work unit.`, "Choose an Errand slug.");
    if (existing.result.primary?.placement?.kind !== "completed") return existing;
    const reference = newDescriptionReference(slug);
    return { status: "ok", result: { selector: slug, reference, kind: "work-item/description", saved: null,
      primary: null, owner: context.identity, state: "open", inbox: null } };
  }
  if (existing.refusal.code !== "not-found") return existing;
  const reference = newDescriptionReference(slug);
  const read = await context.store.read({ reference });
  if (read.status === "refused" && read.refusal.code !== "not-found") return { status: "refused", refusal: withProvenance(read.refusal) };
  return { status: "ok", result: { selector: slug, reference, kind: "work-item/description", saved: read.status === "ok" ? read.result : null, primary: null, owner: context.identity, state: "open", inbox: null } };
}

function newDescriptionReference(slug: string) {
  return recordReferences["work-item/description"](OwnerIdentitySchema.parse({ type: "work-item", name: slug, uid: randomUUID() }));
}

async function prepareTextDescription(input: { slug: string; intent?: string; partial?: boolean }, context: InboxContext): Promise<InboxOutcome<ErrandAdoption>> {
    if (input.partial) return { status: "ok", result: { origin: null, writes: [] } };
    const destination = await descriptionFor(input.slug, context);
    if (destination.status === "refused") return destination;
    const rows = rowsInList(destination.result);
    if (rows.status === "refused") return rows;
    const id = drawEntryId(new Set(rows.result.map((row) => row.id)), context.random ?? Math.random);
    const raw = writeEntryFields(`### **${input.intent?.trim() || input.slug}**`, { Id: id, Created: context.now().toISOString().slice(0, 10) });
    return { status: "ok", result: { origin: null, writes: prepareEntryMove({ source: null, destination: destination.result, entry: { id, raw, section: "Description" }, section: "Description" }, context).writes } };

}

type AdoptedCapture = { kind: "resume"; origin: NonNullable<ErrandAdoption["origin"]> } | { kind: "capture"; entry: import("./types.js").InboxRow; closed?: string };
async function readAdoptedCapture(slug: string, from: string, id: string, source: ResolvedEntryList, context: InboxContext): Promise<InboxOutcome<AdoptedCapture>> {
  const holder = await openErrandHolding(id, listCoordinate(source), context);
  if (holder.status === "refused") return holder;
  if (holder.result.held?.slug === slug) {
    const home = await resolveWorkItemList(slug, context);
    if (home.status === "refused") return home;
    const held = rowsInList(home.result);
    if (held.status === "refused") return held;
    const row = held.result.find(value => value.id === id);
    if (row !== undefined) return { status: "ok", result: { kind: "resume", origin: { title: from, sourceDigest: null, executeBound: false, version: row.version } } };
  }
  if (holder.result.held !== null) return failure("entry-held", `Entry ${from} is held by open Errand ${holder.result.held.slug}.`, `Resume ${holder.result.held.slug} in its own checkout.`);
  const rows = rowsInList(source);
  if (rows.status === "refused") return rows;
  const entry = rows.result.find((row) => row.id === id);
  if (entry === undefined) return missingCapture(from, id, source, context);
  return { status: "ok", result: { kind: "capture", entry, ...(holder.result.closed === undefined ? {} : { closed: holder.result.closed }) } };

}

async function missingCapture(from: string, id: string, source: ResolvedEntryList, context: InboxContext): Promise<InboxOutcome<never>> {
    const latest = await latestRoutingReceipt(id, listCoordinate(source), context);
    if (latest.status === "refused") return latest;
    return failure("entry-gone", `Entry ${from} is gone; ${latest.result === null ? "no receipt names its home" : `its latest home is ${latest.result.destination.list}`}.`, "Inspect that home or choose a listed inbox entry.");

}
