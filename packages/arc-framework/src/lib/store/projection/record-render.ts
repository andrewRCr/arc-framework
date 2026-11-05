/** Render stored conflict evidence without changing the record used as the file's base. */
import { readHeldMarkers, heldMarkerContents, renderHeldMarker, renderSpansOverlap, type HeldMarker } from "./render-held.js";
import { createMarkerRenderer } from "./marker-render.js";
import { placeStoredConflict, type ConflictPlacement } from "./conflict-placement.js";
import { KIND_MECHANISMS } from "../registry.js";
import { ConflictRecordSchema, type ConflictRecord } from "../conflict.js";
import type { RecordReference } from "../identity.js";
import { formatConflictToken } from "../../status/conflict-token.js";
import type { Store } from "../contract.js";
import type { StoreRecord } from "../read.js";
import type { StoreResult } from "../refusal.js";
import { createHistoryMemo, type HistoryMemo } from "./base-recovery.js";
import type { RecordEntry } from "./index-schema.js";

/** Laid content, stamp notices, and the mappings installed with those bytes. */
export interface RenderedRecord {
  readonly content: string;
  readonly notices: readonly string[];
  readonly state: Pick<RecordEntry, "markers" | "notices" | "unshown">;
}
/** The command's store reads and shared historical answers. */
export interface RecordRenderContext { readonly store: Store; readonly memo: HistoryMemo }
/** Content to lay under a stored record's stamp, optionally already holding marker sets. */
export interface RecordRenderInput {
  readonly record: StoreRecord;
  readonly content: string;
  readonly markerLength?: number;
  readonly stamped: boolean;
}

/** A command-bound renderer shared by its replacements and guarded restaging. */
export type RecordRenderer = (input: RecordRenderInput) => Promise<StoreResult<RenderedRecord>>;

/** Bind store reads and one history memo for every rendering in a command. */
export function createRecordRenderer(context: { store: Store; memo?: HistoryMemo }): RecordRenderer {
  const bound = { store: context.store, memo: context.memo ?? createHistoryMemo(context.store) };
  return input => renderRecordContent(bound, input);
}

/** Render every open conflict at a checked span or as a notice where placement fails. */
export async function renderRecordContent(context: RecordRenderContext, input: RecordRenderInput): Promise<StoreResult<RenderedRecord>> {
  const held = readHeldMarkers(input.content, input.markerLength, input.record.conflicts, input.record.reference.owner);
  if (held === null) return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference: input.record.reference,
    rule: "projection.render-markers", condition: "The content holds malformed or unrecognized conflict markers.",
    remedy: { text: "Repair the marker sets before refreshing the file again." } } };
  const conflicts = await readConflicts(context.store, input.record.conflicts.filter(reference => !held.some(set =>
    set.origin.shows === "stored" && formatConflictToken(set.origin.conflict) === formatConflictToken(reference))));
  if (conflicts.status === "refused") return conflicts;
  const drawn: PlacedConflict[] = [];
  const notices: StoredConflict[] = [];
  const occupied: { start: number; end: number }[] = [...held];
  for (const conflict of conflicts.result) {
    const data = conflict.data;
    const placement = "baseVersion" in data || "baseSection" in data
      ? await placeStoredConflict({ content: input.content, conflict: data, memo: context.memo,
        grammar: KIND_MECHANISMS[input.record.reference.kind].entry }) : null;
    if (placement === null || occupied.some(span => renderSpansOverlap(input.content, placement, span))) notices.push(conflict);
    else { drawn.push({ conflict, placement }); occupied.push(placement); }
  }
  return { status: "ok", result: layRenderedContent(input, held, drawn, notices) };
}

interface PlacedConflict { readonly conflict: StoredConflict; readonly placement: ConflictPlacement }

function layRenderedContent(input: RecordRenderInput, held: readonly HeldMarker[], drawn: readonly PlacedConflict[], notices: readonly StoredConflict[]): RenderedRecord {
  const renderer = createMarkerRenderer([...heldMarkerContents(input.content, held), ...drawn.flatMap(({ conflict }) => {
    const data = conflict.data;
    return "baseVersion" in data || "baseSection" in data ? [data.current.content, data.incoming.content] : [];
  })]);
  const replacements = held.map(set => ({ start: set.start, end: set.end, origin: set.origin,
    text: renderHeldMarker(set, renderer.length) + (input.content.slice(set.start, set.end).endsWith("\n") ? "\n" : "") }));
  for (const { conflict, placement } of drawn) {
    const text = renderer.renderLines({ length: renderer.length,
      current: { lines: placement.current, label: conflict.data.current.label },
      incoming: { lines: placement.incoming, label: conflict.data.incoming.label } }, { shows: "stored", conflict: conflict.reference }).join("\n");
    const newline = input.content.slice(placement.start, placement.end).endsWith("\n")
      || (placement.start === placement.end && (placement.end < input.content.length || input.content.endsWith("\n")));
    replacements.push({ ...placement, origin: { shows: "stored", conflict: conflict.reference }, text: text + (newline ? "\n" : "") });
  }
  let content = input.content;
  for (const replacement of [...replacements].sort((a, b) => b.start - a.start)) {
    content = content.slice(0, replacement.start) + replacement.text + content.slice(replacement.end);
  }
  const sets = replacements.sort((a, b) => a.start - b.start).map(replacement => replacement.origin);
  const references = notices.map(conflict => conflict.reference);
  return { content, notices: input.stamped ? notices.map(conflictNotice) : [], state: {
    markers: sets.length === 0 ? null : { length: renderer.length, sets },
    notices: input.stamped ? references : [], unshown: input.stamped ? [] : references,
  } };
}

interface StoredConflict { readonly reference: RecordReference; readonly data: ConflictRecord }

async function readConflicts(store: Store, references: readonly RecordReference[]): Promise<StoreResult<StoredConflict[]>> {
  const result: StoredConflict[] = [];
  const sorted = [...references].sort((a, b) => compareTokens(a, b));
  for (const reference of sorted) {
    const read = await store.read({ reference });
    if (read.status === "refused") return read;
    let value: unknown;
    try { value = JSON.parse(read.result.content); } catch { value = null; }
    const parsed = ConflictRecordSchema.safeParse(value);
    if (!parsed.success) return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference,
      rule: "projection.render-conflict", condition: "An open conflict record cannot be parsed for rendering.",
      remedy: { text: "Repair the stored conflict record, then refresh the file again." } } };
    result.push({ reference, data: parsed.data });
  }
  return { status: "ok", result };
}

function conflictNotice(conflict: StoredConflict): string {
  const token = formatConflictToken(conflict.reference);
  const label = conflict.data.incoming.label;
  return `Conflict ${token}; incoming ${label.actor} @ ${label.time}. View both sides: arc status --conflicts ${token}. Resolve: arc save --resolve ${token}.`
    .replaceAll("\r", "\\r").replaceAll("\n", "\\n").replaceAll("-->", "--&gt;");
}

function compareTokens(left: RecordReference, right: RecordReference): number {
  const a = formatConflictToken(left), b = formatConflictToken(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
