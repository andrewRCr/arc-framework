/** Prepare a conflicted file's next view without replacing it or changing stored content. */
import type { StoreRecord } from "../read.js";
import type { RecordEntry, RefusedMark } from "./index-schema.js";
import { gitBlobId, type ObjectFormat } from "./blob-id.js";
import { createMarkerRenderer } from "./marker-render.js";
import { readHeldMarkers, heldMarkerContents, renderHeldMarker, type HeldMarker } from "./render-held.js";
import { malformedMarkerMark } from "./marker-parse.js";
import { formatConflictToken } from "../../status/conflict-token.js";
import { mergeLineText } from "../concurrency/line-merge.js";
import { parseStampedFile } from "./stamp.js";
import { renderRecordContent, type RecordRenderContext, type RenderedRecord } from "./record-render.js";

/** The settled, guard-checked file and the newer stored record to merge into it. */
export interface ConflictedRefreshInput {
  readonly path: string;
  readonly text: string;
  readonly entry: RecordEntry;
  readonly current: StoreRecord;
}
/** A replacement's rendered view, or a retryable refresh that leaves the original file intact. */
export type ConflictedRefresh = { readonly kind: "ready"; readonly rendered: RenderedRecord }
  | { readonly kind: "pending"; readonly mark: RefusedMark };
/** Store reads, shared history, and this command's labels and object format. */
export interface ConflictedRefreshContext extends RecordRenderContext {
  readonly format: ObjectFormat;
  readonly actor: string;
  readonly now?: () => Date;
}

/** Merge newer stored changes into a marked file, preserving open markers and refusing overlaps. */
export async function prepareConflictedRefresh(context: ConflictedRefreshContext, input: ConflictedRefreshInput): Promise<ConflictedRefresh> {
  const history = await context.memo.read(input.entry.reference);
  if (history.status === "refused") return pending({ reason: history.refusal.condition, remedy: history.refusal.remedy });
  const base = history.result.find(entry => entry.version === input.entry.base.version)?.content;
  if (base === undefined || base === null) return pending({ reason: "The conflicted file's stored base is unreadable.",
    remedy: { text: "Restore readable record history, then refresh the file again." } });
  const stamped = input.path.endsWith(".md");
  const body = stamped ? parseStampedFile(input.text).content : input.text.replaceAll("\r\n", "\n");
  const incoming = refreshIncoming(context, input, body);
  if (incoming.kind === "pending") return incoming;
  const time = (context.now?.() ?? new Date()).toISOString();
  const merged = mergeLineText({ record: input.entry.reference, baseVersion: input.entry.base.version,
    base, current: input.current.content, incoming: incoming.content,
    currentLabel: { actor: input.current.version, time }, incomingLabel: { actor: context.actor, time } });
  if (merged.conflicts.length > 0) return pending({ reason: "A stored change overlaps an unresolved marker set.",
    remedy: { text: "Resolve the file's open markers and save again; a later command will retry the refresh." } });
  const rendered = await renderRecordContent(context, { record: input.current, content: merged.content,
    markerLength: incoming.length, stamped });
  return rendered.status === "refused" ? pending({ reason: rendered.refusal.condition, remedy: rendered.refusal.remedy })
    : { kind: "ready", rendered: rendered.result };
}

function pending(mark: RefusedMark): Extract<ConflictedRefresh, { kind: "pending" }> { return { kind: "pending", mark }; }


interface IncomingView { readonly kind: "incoming"; readonly content: string; readonly length: number | undefined }
type IncomingRefresh = IncomingView | Extract<ConflictedRefresh, { kind: "pending" }>;

function refreshIncoming(context: ConflictedRefreshContext, input: ConflictedRefreshInput, body: string): IncomingRefresh {
  const length = input.entry.markers?.length;
  if (length === undefined) return { kind: "incoming", content: body, length };
  const held = readHeldMarkers(body, length, input.current.conflicts, input.entry.reference.owner);
  if (held === null) return pending(malformedMarkerMark());
  const content = gitBlobId(input.text, context.format) === input.entry.written
    ? dropClosedMarkers(body, held, new Set(input.current.conflicts.map(formatConflictToken))) : body;
  const remaining = readHeldMarkers(content, length, input.current.conflicts, input.entry.reference.owner);
  if (remaining === null) return pending(malformedMarkerMark());
  if (remaining.length === 0) return { kind: "incoming", content, length: undefined };
  return growIncoming(content, remaining, input.current.content, length);
}

function dropClosedMarkers(body: string, held: readonly HeldMarker[], open: ReadonlySet<string>): string {
  let content = body;
  for (const set of [...held].reverse()) {
    if (set.origin.shows !== "stored" || open.has(formatConflictToken(set.origin.conflict))) continue;
    const current = body.slice(set.start, set.end).endsWith("\n") ? set.current : set.current.replace(/\n$/u, "");
    content = content.slice(0, set.start) + current + content.slice(set.end);
  }
  return content;
}

function growIncoming(content: string, held: readonly HeldMarker[], current: string, length: number): IncomingView {
  const grown = createMarkerRenderer([...heldMarkerContents(content, held), current]).length;
  if (grown <= length) return { kind: "incoming", content, length };
  let result = content;
  for (const set of [...held].reverse()) {
    const newline = content.slice(set.start, set.end).endsWith("\n") ? "\n" : "";
    result = result.slice(0, set.start) + renderHeldMarker(set, grown) + newline + result.slice(set.end);
  }
  return { kind: "incoming", content: result, length: grown };
}
