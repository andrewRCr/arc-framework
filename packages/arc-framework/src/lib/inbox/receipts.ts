/** Inbox-scoped write-once provenance and latest-home selection across both receipt refs. */
import { randomUUID } from "node:crypto";
import { parseRoutingReceipt, writeRoutingReceipt, type RoutingReceipt } from "../store/kinds/routing-receipt.js";
import { OwnerIdentitySchema, recordReferences } from "../store/identity.js";
import type { Mutation } from "../store/write.js";
import { failure, withProvenance, type ResolvedEntryList } from "./lists.js";
import type { InboxContext, InboxOutcome } from "./types.js";

/** The semantic list coordinate recorded at a move's time. */
export type RoutingCoordinate = RoutingReceipt["destination"];
/** Derive a list's canonical coordinate; a personal inbox is qualified by its identity.
 * @param list - Exact resolved list.
 * @param section - Entry's source or destination section.
 * @returns Receipt coordinate independent of projection paths.
 */
export function listCoordinate(list: ResolvedEntryList, section?: string): RoutingCoordinate {
  return { list: list.inbox ?? list.primary?.reference.owner.name ?? list.selector,
    ...(section === undefined ? {} : { section }), ...(list.inbox === "personal" ? { identity: list.reference.owner.name } : {}) };
}
/** List equality ignores section: IDs are unique throughout one list.
 * @param a - First coordinate.
 * @param b - Second coordinate.
 * @returns Whether both name the same identity-scoped or project list.
 */
export function sameRoutingList(a: RoutingCoordinate | null, b: RoutingCoordinate): boolean {
  return a !== null && a.list === b.list && (a.list !== "personal" || a.identity === b.identity);
}
/** Read both receipt kinds at one store snapshot, refusing incomplete evidence.
 * @param context - Store and current person.
 * @returns Every validated receipt the reader may inspect.
 */
export async function readRoutingReceipts(context: InboxContext): Promise<InboxOutcome<RoutingReceipt[]>> {
  const version = await context.store.version();
  if (version.status === "refused") return { status: "refused", refusal: withProvenance(version.refusal) };
  const receipts: RoutingReceipt[] = [];
  const person = OwnerIdentitySchema.parse({ type: "person", name: context.identity });
  for (const input of [{ family: "personal" as const, kind: "personal/routing-receipt" as const, owner: person },
    { family: "project-inbox" as const, kind: "project-inbox/routing-receipt" as const }]) {
    const listed = await context.store.list({ ...input, asOf: version.result });
    if (listed.status === "refused") return { status: "refused", refusal: withProvenance(listed.refusal) };
    const value = listed.result;
    if (value.status === "absent") continue;
    if (value.status === "unreadable") return failure("observation-incomplete", value.condition, value.remedy.text, value);
    if (value.missed || value.diagnostics.length) return failure("observation-incomplete", "Routing receipts could not all be read.", "Repair the receipt diagnostics before moving this entry.", value);
    for (const saved of value.records) {
      const parsed = parseRoutingReceipt(saved.content);
      if (!parsed.success) return failure("record-malformed", parsed.error, "Repair the malformed routing receipt, then retry.");
      receipts.push(parsed.data);
    }
  }
  return { status: "ok", result: receipts };
}
/** Select only receipts relevant to this ID in this list, then compare actual instants.
 * @param receipts - Complete receipt reading.
 * @param entryId - List-local identity.
 * @param list - List being read or named.
 * @returns Latest relevant move or null.
 */
export function latestReceiptFrom(receipts: readonly RoutingReceipt[], entryId: string, list: RoutingCoordinate): RoutingReceipt | null {
  return receipts.filter((receipt) => receipt.entryId === entryId && (sameRoutingList(receipt.source, list) || sameRoutingList(receipt.destination, list)))
    .reduce<RoutingReceipt | null>((latest, receipt) => latest === null || Date.parse(receipt.time) > Date.parse(latest.time) ? receipt : latest, null);
}
/** Read one entry's latest receipt across the person's and project inbox refs.
 * @param entryId - List-local identity.
 * @param list - List being inspected.
 * @param context - Store and identity.
 * @returns Latest relevant move or a completeness refusal.
 */
export async function latestRoutingReceipt(entryId: string, list: RoutingCoordinate, context: InboxContext): Promise<InboxOutcome<RoutingReceipt | null>> {
  const read = await readRoutingReceipts(context);
  return read.status === "refused" ? read : { status: "ok", result: latestReceiptFrom(read.result, entryId, list) };
}
/** Compose receipts beside the entry mutations, one for each inbox ref touched.
 * @param source - Source list, null for insertion.
 * @param destination - Exact destination list.
 * @param receipt - Full provenance shared by both refs.
 * @param context - Fresh-key provider.
 * @returns Create-only receipt mutations for the mover's atomic batch.
 */
export function routingReceiptMutations(source: ResolvedEntryList | null, destination: ResolvedEntryList, receipt: RoutingReceipt, context: InboxContext): Mutation[] {
  const lists = [source, destination].filter((list): list is ResolvedEntryList => list !== null && list.inbox !== null);
  const unique = new Map(lists.map((list) => [`${list.inbox}:${list.reference.owner.name}`, list]));
  const key = (context.key ?? randomUUID)();
  return [...unique.values()].map((list) => ({ action: "put", expected: null,
    reference: list.inbox === "personal" ? recordReferences["personal/routing-receipt"](list.reference.owner, key)
      : recordReferences["project-inbox/routing-receipt"](list.reference.owner, key), content: writeRoutingReceipt(receipt) }));
}
