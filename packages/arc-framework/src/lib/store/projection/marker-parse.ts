/** Interpret indexed marker origins and substitute accepted sides before record parsing. */
import type { TextConflictRecord } from "../conflict.js";
import { sameReference, type RecordReference } from "../identity.js";
import type { RecordEntry, RefusedMark } from "./index-schema.js";
import { formatConflictToken } from "../../status/conflict-token.js";
import { scanMarkers, type MarkerSetSpan } from "./marker-scan.js";
import { renderMarkerSide, RESOLVE_BY_HAND_LINE } from "./marker-render.js";
import type { EntryListConfig } from "../concurrency/entries.js";
import { malformedEntries, restoreMalformedEntries } from "./marker-entries.js";

/** One stored text conflict supplied by the caller's store reads. */
export interface MarkerConflict { readonly reference: RecordReference; readonly data: TextConflictRecord }
/** Selected-base entry policy; aside copies never partially land. */
export interface MarkerEntryPolicy { readonly base: string; readonly grammar: EntryListConfig; readonly aside: boolean }
/** Content ready for ordinary write preparation, optionally with a refusal that retains the original file. */
export type MarkerParseResult = (
  | { readonly kind: "ready"; readonly content: string; readonly resolves: readonly RecordReference[]; readonly retained?: RefusedMark }
  | { readonly kind: "held"; readonly mark: RefusedMark }) & { readonly unshown?: readonly RecordReference[] };
interface MarkerInput {
  content: string; markers: NonNullable<RecordEntry["markers"]>; conflicts: readonly MarkerConflict[];
  open: readonly RecordReference[]; entries?: MarkerEntryPolicy;
}

/** Substitute stored sides using only the conflicts the file's index names. */
export function parseMarkerContent(input: MarkerInput): MarkerParseResult {
  const scan = scanMarkers(input.content, input.markers.length);
  const malformed = [...scan.malformed];
  const shown: RecordReference[] = [];
  let content = "", cursor = 0;
  for (const span of scan.sets) {
    if (span.opening.endsWith("[arc-conflict: checkout]") && input.markers.sets.some(set => set.shows === "checkout")) {
      return { kind: "held", mark: { reason: "checkout-conflict: A checkout clash still has markers.",
        remedy: { text: "Resolve the checkout clash and delete its markers and resolve-by-hand line, then save again." } } };
    }
    const conflict = indexedConflict(input, span.opening);
    if (conflict === undefined) { malformed.push({ ...span, complete: true }); continue; }
    if (!unchangedSides(span, conflict.data, input.markers.length)) return { kind: "held", mark: {
      reason: `resolution-in-progress: ${formatConflictToken(conflict.reference)} still has markers around edited sides.`,
      remedy: { text: "Finish this set's resolution by removing its markers, or restore both original sides, then save again." },
    } };
    content += input.content.slice(cursor, span.start) + renderMarkerSide(conflict.data.current.content);
    shown.push(conflict.reference);
    cursor = span.end;
  }
  if (malformed.length > 0) return partialEntries(input, malformed, scan.controls);
  const resolves = input.markers.sets.flatMap(set => set.shows === "stored"
    && input.open.some(reference => sameReference(reference, set.conflict))
    && !shown.some(reference => sameReference(reference, set.conflict)) ? [set.conflict] : []);
  return { kind: "ready", content: content + input.content.slice(cursor), resolves };
}

function indexedConflict(input: MarkerInput, opening: string): MarkerConflict | undefined {
  return input.conflicts.find(candidate => input.markers.sets.some(set => set.shows === "stored"
    && sameReference(set.conflict, candidate.reference)) && opening.endsWith(
    `[arc-conflict: ${JSON.stringify(formatConflictToken(candidate.reference))}]`,
  ));
}

function partialEntries(input: MarkerInput, malformed: readonly { start: number; end: number; opening?: string; complete?: boolean }[],
  controls: readonly { start: number; end: number }[]): MarkerParseResult {
  const mark = malformedMarkerMark();
  if (input.entries === undefined || input.entries.aside) return { kind: "held", mark };
  const identities = new Map<number, string>();
  for (const span of malformed) {
    const conflict = span.opening === undefined ? undefined : indexedConflict(input, span.opening);
    if (conflict?.data.location.kind === "entry") identities.set(span.start, conflict.data.location.id);
  }
  const ranges = malformedEntries(input.content, input.entries.grammar, malformed, controls, identities);
  if (ranges === null) return { kind: "held", mark };
  const content = restoreMalformedEntries(input.content, input.entries.base, input.entries.grammar, ranges);
  const ready = parseMarkerContent({ ...input, content, entries: undefined });
  if (ready.kind === "held") return ready;
  const blocked = input.conflicts.filter(conflict => {
    const location = conflict.data.location;
    return location.kind === "entry" && ranges.some(range => range.id === location.id);
  });
  const resolves = ready.resolves.filter(reference => !blocked.some(conflict => sameReference(reference, conflict.reference)));
  if (ready.content === input.entries.base && resolves.length === 0) return { kind: "held", mark };
  return { ...ready, retained: mark, resolves };
}

function unchangedSides(span: MarkerSetSpan, conflict: TextConflictRecord, length: number): boolean {
  const current = length > 7 && span.current.startsWith(`${RESOLVE_BY_HAND_LINE}\n`)
    ? span.current.slice(RESOLVE_BY_HAND_LINE.length + 1) : span.current;
  return current === renderMarkerSide(conflict.current.content) && span.incoming === renderMarkerSide(conflict.incoming.content);
}

/** Explain the safe repair for incomplete controls and leftover instructions. */
export function malformedMarkerMark(): RefusedMark {
  return { reason: "marker-origin/marker-malformed: An unindexed label, incomplete marker set, or resolve-by-hand instruction remains.",
    remedy: { text: "Finish resolving the affected set and delete its markers and resolve-by-hand line, or restore the complete original set, then save again." } };
}
