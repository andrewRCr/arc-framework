/** Read and authorize the exact source/version for an entry mover's atomic write set. */
import { drawEntryId } from "../store/kinds/entry-fields.js";
import type { RoutingReceipt } from "../store/kinds/routing-receipt.js";
import { stampEntryIds } from "../store/concurrency/stamp.js";
import { ENTRY_CONFIGS } from "../store/kinds/entry-configs.js";
import { parseEntryList } from "../store/kinds/entry-list.js";
import { prepareSurvivorCarry } from "./carry.js";
import { destinationSection, mayRemoveEntry } from "./admission.js";
import { resolveEntryList, failure, type ResolvedEntryList } from "./lists.js";
import { rowsInList } from "./listing.js";
import { prepareEntryMove, type PreparedEntryMove } from "./mover.js";
import { latestRoutingReceipt, listCoordinate, sameRoutingList, type RoutingCoordinate } from "./receipts.js";
import type { InboxContext, InboxOutcome, InboxRow } from "./types.js";
import type { RouteEntryInput } from "./route.js";

/** Idempotence reports a proven home while writing nothing. */
export type RoutePreparation = { kind: "move"; plan: PreparedEntryMove } | { kind: "already-home"; entryId: string; destination: RoutingCoordinate };
/** Prepare one insertion or move at the records and entry version just read.
 * @param input - Command's observed source/version or inserted entry bytes.
 * @param destination - Exact destination record and lifecycle evidence.
 * @param context - Store runtime.
 * @returns Atomic plan or a condition that permits no writes.
 */
export async function prepareRoute(input: RouteEntryInput, destination: ResolvedEntryList, context: InboxContext): Promise<InboxOutcome<RoutePreparation>> {
  const section = destinationSection(destination, input.section);
  if (section.status === "refused") return section;
  const held = rowsInList(destination);
  if (held.status === "refused") return held;
  return input.entryId === undefined ? prepareInsert(input, destination, section.result, held.result, context)
    : prepareExisting(input, destination, section.result, held.result, context);
}

function prepareInsert(input: RouteEntryInput, destination: ResolvedEntryList, section: string, held: InboxRow[], context: InboxContext): InboxOutcome<RoutePreparation> {
  if (input.from !== undefined || input.expectedVersion !== undefined || !input.content?.trim()) return failure("invalid-input", "Insertion needs entry bytes on stdin and no --from or --expected-version.", "Use arc route --to <destination> with one entry on stdin.");
  const document = `## ${section}\n${input.content}`;
  const parsed = parseEntryList(document, destination.kind);
  if (!parsed.success || parsed.data.entries.length !== 1) return failure("invalid-input", parsed.success ? "Insert exactly one entry." : parsed.error, "Supply one entry with its heading and prose on stdin.");
  const id = parsed.data.entries[0]?.id ?? drawEntryId(new Set(held.map((row) => row.id)), context.random ?? Math.random);
  const stamped = stampEntryIds(document, ENTRY_CONFIGS[destination.kind], () => Number.parseInt(id, 16) / 0x100000000);
  const ready = parseEntryList(stamped, destination.kind);
  const entry = ready.success ? ready.data.entries[0] : undefined;
  if (entry?.id === undefined) return failure("invalid-input", "The inserted entry has no valid identity.", "Supply one valid entry heading and retry.");
  if (held.some((row) => row.id === entry.id)) return idClash(entry.id, entry.title, held.find((row) => row.id === entry.id)?.title ?? "", destination.selector);
  const plan = prepareEntryMove({ source: null, destination, section, entry: { id: entry.id, raw: entry.bytes, section } }, context);
  return { status: "ok", result: { kind: "move", plan } };
}

async function prepareExisting(input: RouteEntryInput, destination: ResolvedEntryList, section: string, held: InboxRow[], context: InboxContext): Promise<InboxOutcome<RoutePreparation>> {
  if (input.from === undefined || input.expectedVersion === undefined || !/^[0-9a-f]{8}$/u.test(input.entryId ?? "")) return failure("invalid-input", "A move requires an entry ID, --from, and --expected-version.", "List the source with arc inbox <list>, then pass the ID and version it reports.");
  const source = await resolveEntryList(input.from, context);
  if (source.status === "refused") return source;
  const rows = rowsInList(source.result);
  if (rows.status === "refused") return rows;
  const entry = rows.result.find((row) => row.id === input.entryId);
  const receipt = await latestRoutingReceipt(input.entryId ?? "", listCoordinate(source.result), context);
  if (receipt.status === "refused") return receipt;
  const duplicate = held.find((row) => row.id === input.entryId);
  const sameHome = receipt.result !== null && sameRoutingList(receipt.result.source, listCoordinate(source.result))
    && sameRoutingList(receipt.result.destination, listCoordinate(destination));
  if (entry === undefined) return missingEntryOutcome(duplicate, sameHome, destination, receipt.result);
  return prepareObservedMove({ input, destination, section, source: source.result, entry, duplicate, sameHome }, context);
}

function missingEntryOutcome(duplicate: InboxRow | undefined, sameHome: boolean, destination: ResolvedEntryList, receipt: RoutingReceipt | null): InboxOutcome<RoutePreparation> {
  if (duplicate !== undefined && sameHome) return { status: "ok", result: { kind: "already-home", entryId: duplicate.id, destination: listCoordinate(destination, duplicate.section) } };
  return failure("not-found", receipt === null ? "The entry is gone and no routing receipt names its home." : `The entry moved to ${receipt.destination.list}.`,
    receipt === null ? "Inspect the source and destination with arc inbox before retrying." : `Use arc inbox ${receipt.destination.list}, then route from that home at its listed version.`);
}

interface ObservedMove {
  input: RouteEntryInput; destination: ResolvedEntryList; section: string; source: ResolvedEntryList;
  entry: InboxRow; duplicate: InboxRow | undefined; sameHome: boolean;
}
function prepareObservedMove(observed: ObservedMove, context: InboxContext): InboxOutcome<RoutePreparation> {
  const { input, destination, section, source, entry, duplicate, sameHome } = observed;
  if (entry.version !== input.expectedVersion) return { status: "refused", refusal: { code: "changed-entry", condition: `Entry ${entry.id} changed; its current version is ${entry.version}.`, remedy: { text: "Read arc inbox <list>, then retry with the version found." }, foundVersion: entry.version } };
  const removal = mayRemoveEntry(source, context.identity);
  if (removal.status === "refused") return removal;
  if (duplicate !== undefined && !sameRoutingList(listCoordinate(source), listCoordinate(destination))) {
    return sameHome ? { status: "ok", result: { kind: "move", plan: prepareSurvivorCarry({ source, destination, entry, section }, duplicate, context) } }
      : idClash(entry.id, entry.title, duplicate.title, destination.selector);
  }
  return { status: "ok", result: { kind: "move", plan: prepareEntryMove({ source, destination, entry, section }, context) } };
}

function idClash(id: string, incoming: string, held: string, destination: string): ReturnType<typeof failure> {
  return failure("id-clash", `Entry ${id} (${incoming}) clashes with ${held} in ${destination}.`, "Insert a copy without _Id:_ to stamp a fresh identity, then remove the source at its listed version.");
}
