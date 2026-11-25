/** Entry routing authority is decided from the destination's primary record and placement. */
import type { ResolvedEntryList } from "./lists.js";
import { failure } from "./lists.js";
import type { InboxOutcome } from "./types.js";
import { ENTRY_CONFIGS } from "../store/kinds/entry-configs.js";

/** Select exactly the section the command's syntax permits.
 * @param destination - Resolved destination kind.
 * @param requested - Explicit --section value.
 * @returns One allowed section or the precise serving form.
 */
export function destinationSection(destination: ResolvedEntryList, requested?: string): InboxOutcome<string> {
  const sections = ENTRY_CONFIGS[destination.kind].sections;
  if (sections.length === 1) return requested === undefined ? { status: "ok", result: sections[0] }
    : failure("invalid-input", "This destination has exactly one section; --section is not accepted.", `Omit --section to route into ${destination.selector}.`);
  return requested !== undefined && (sections as readonly string[]).includes(requested) ? { status: "ok", result: requested }
    : failure("invalid-input", `Select one destination section: ${sections.join(", ")}.`, `Use --section ${sections.map((section) => JSON.stringify(section)).join(" or --section ")}.`);
}
/** Decide whether a list currently accepts new work.
 * @param list - Primary state and placement.
 * @returns Admission or a concrete alternative home.
 */
export function acceptsEntries(list: ResolvedEntryList): InboxOutcome<true> {
  if (list.primary?.placement?.kind === "completed" || (list.state === "Integrating" || list.state === "Shipped")) {
    const remedy = list.kind === "work-item/description" ? "Route the entry to an inbox; the Errand has ended."
      : `Choose a follow-on work unit or run arc reopen ${list.primary?.reference.owner.name ?? list.selector}.`;
    return failure("destination-refused", `${list.selector} takes no entries in its ended or Integrating state.`, remedy);
  }
  return { status: "ok", result: true };
}
/** A started work unit's owner alone removes an entry from its inbound list.
 * @param source - Exact source primary and placement.
 * @param identity - Router's identity.
 * @returns Removal authority or a copy-only continuation.
 */
export function mayRemoveEntry(source: ResolvedEntryList, identity: string): InboxOutcome<true> {
  if (source.kind === "work-item/inbound" && source.primary?.placement?.kind !== "backlog" && source.owner !== identity) {
    return failure("owner-required", `${source.selector} belongs to ${source.owner ?? "an unreadable owner"}; only that owner removes its inbound entries.`, "Use arc route --to <destination> with a copy of the entry on stdin, or ask the owner to move it.");
  }
  return { status: "ok", result: true };
}
/** Whether a survivor may replace a held entry's title and prose in this destination.
 * @param destination - Existing home.
 * @param identity - Router's identity.
 * @returns False for open Errand descriptions and another person's started work unit.
 */
export function mayReplaceEntry(destination: ResolvedEntryList, identity: string): boolean {
  return destination.inbox !== null || destination.kind === "work-item/inbound"
    && (destination.primary?.placement?.kind === "backlog" || destination.owner === identity);
}
