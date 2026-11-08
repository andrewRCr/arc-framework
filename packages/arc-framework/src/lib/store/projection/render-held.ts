/** Preserve existing marker sets and compare replacement spans in stable file coordinates. */
import { formatConflictToken, parseConflictToken } from "../../status/conflict-token.js";
import type { RecordReference } from "../identity.js";
import { RESOLVE_BY_HAND_LINE, type MarkerOrigin } from "./marker-render.js";
import { scanMarkers } from "./marker-scan.js";

/** A complete existing set with its original labels and exact raw sides. */
export interface HeldMarker {
  readonly start: number; readonly end: number; readonly origin: MarkerOrigin;
  readonly opening: string; readonly closing: string; readonly current: string; readonly incoming: string;
}

/** Read existing sets by their labels; malformed or unrecognized sets cannot be safely rendered. */
export function readHeldMarkers(content: string, length: number | undefined, open: readonly RecordReference[], owner: RecordReference["owner"]): HeldMarker[] | null {
  if (length === undefined) return [];
  const scan = scanMarkers(content, length);
  if (scan.malformed.length > 0) return null;
  const result: HeldMarker[] = [];
  for (const set of scan.sets) {
    const origin = markerOrigin(set.opening, open, owner);
    if (origin === null) return null;
    result.push({ ...set, origin, current: length > 7 && set.current.startsWith(`${RESOLVE_BY_HAND_LINE}\n`)
      ? set.current.slice(RESOLVE_BY_HAND_LINE.length + 1) : set.current,
    closing: (content.slice(set.start, set.end).trimEnd().split("\n").at(-1) ?? "").slice(length) });
  }
  return result;
}

/** Select length from the shown content and sides, excluding the existing generated controls. */
export function heldMarkerContents(content: string, held: readonly HeldMarker[]): string[] {
  const result: string[] = [];
  let cursor = 0;
  for (const set of held) {
    result.push(content.slice(cursor, set.start), set.current, set.incoming);
    cursor = set.end;
  }
  result.push(content.slice(cursor));
  return result;
}

/** Re-render a held set's controls at the file-wide length, retaining its labels and sides. */
export function renderHeldMarker(set: HeldMarker, length: number): string {
  return `${"<".repeat(length)} ${set.opening}\n` + (length > 7 ? `${RESOLVE_BY_HAND_LINE}\n` : "")
    + set.current + `${"=".repeat(length)}\n` + set.incoming + `${">".repeat(length)}${set.closing}`;
}

/** Compare line spans; a zero-line point overlaps either edge as well as the interior. */
export function renderSpansOverlap(content: string, left: { start: number; end: number }, right: { start: number; end: number }): boolean {
  const a = lineSpan(content, left), b = lineSpan(content, right);
  if (a.start === a.end) return a.start >= b.start && a.start <= b.end;
  if (b.start === b.end) return b.start >= a.start && b.start <= a.end;
  return a.start < b.end && b.start < a.end;
}

function lineSpan(content: string, span: { start: number; end: number }): { start: number; end: number } {
  const row = (offset: number) => content.slice(0, offset).split("\n").length - 1;
  return { start: row(span.start), end: span.start === span.end ? row(span.start) : row(span.end - 1) + 1 };
}

function markerOrigin(opening: string, open: readonly RecordReference[], owner: RecordReference["owner"]): MarkerOrigin | null {
  const match = /\[arc-conflict: (checkout|".*")\]$/u.exec(opening);
  if (match?.[1] === "checkout") return { shows: "checkout" };
  let token: unknown;
  try { token = JSON.parse(match?.[1] ?? "null"); } catch { return null; }
  const reference = typeof token === "string" ? parseConflictToken(token) : null;
  if (reference === null) return null;
  const known = open.find(candidate => formatConflictToken(candidate) === token);
  const sameOwner = reference.owner.type === owner.type && reference.owner.name === owner.name;
  return { shows: "stored", conflict: known ?? (sameOwner ? { ...reference, owner } : reference) };
}
