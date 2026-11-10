/** Render labelled conflict sets with one collision-free marker length for a file. */
import type { TextConflictRecord } from "../conflict.js";
import type { RecordEntry } from "./index-schema.js";
import { formatConflictToken } from "../../status/conflict-token.js";
import type { ConflictMarkerInput } from "../concurrency/line-merge.js";

/** An escalated set requires removing this instruction together with its markers. */
export const RESOLVE_BY_HAND_LINE = "<!-- arc-resolve-by-hand: Resolve this conflict by hand and delete this line with the markers. -->";

/** The indexed origin of a marker set. */
export type MarkerOrigin = NonNullable<RecordEntry["markers"]>["sets"][number];

/** A file-wide renderer shared by every conflict the file contains. */
export interface MarkerRenderer {
  readonly length: number;
  render(conflict: TextConflictRecord, origin: MarkerOrigin): string;
  renderLines(conflict: ConflictMarkerInput, origin: MarkerOrigin): readonly string[];
}

/** Choose the file's marker length from its whole content and every preserved side. */
export function createMarkerRenderer(contents: readonly string[]): MarkerRenderer {
  let longest = 0;
  for (const content of contents) {
    for (const match of content.matchAll(/^([<=>|])\1{6,}/gmu)) longest = Math.max(longest, match[0].length);
  }
  const length = longest === 0 ? 7 : longest + 4;
  const render = (conflict: StoredMarkerSides, origin: MarkerOrigin): string => {
    const source = origin.shows === "checkout" ? "checkout" : JSON.stringify(formatConflictToken(origin.conflict));
    return `${"<".repeat(length)} ${label(conflict.current.label)} [arc-conflict: ${source}]\n`
      + (length === 7 ? "" : `${RESOLVE_BY_HAND_LINE}\n`)
      + renderStoredSide(conflict, "current") + `${"=".repeat(length)}\n`
      + renderStoredSide(conflict, "incoming") + `${">".repeat(length)} ${label(conflict.incoming.label)}\n`;
  };
  return { length, render, renderLines: (set, origin) => render({
    current: { content: lines(set.current.lines), label: set.current.label },
    incoming: { content: lines(set.incoming.lines), label: set.incoming.label },
  }, origin).slice(0, -1).split("\n") };
}

function lines(values: readonly string[]): string { return values.length === 0 ? "" : `${values.join("\n")}\n`; }

/** Put a preserved side before the next marker without joining their lines. */
export function renderMarkerSide(content: string): string {
  return content === "" || content.endsWith("\n") ? content : `${content}\n`;
}

function label(value: TextConflictRecord["current"]["label"]): string {
  return `${value.actor.replaceAll("\r", "\\r").replaceAll("\n", "\\n")} @ ${value.time}`;
}

type StoredMarkerSides = Pick<TextConflictRecord, "current" | "incoming"> & { readonly currentLines?: number; readonly incomingLines?: number };

/** Expand a stored hunk's joined lines with their exact count; entry sides retain their existing boundaries. */
export function renderStoredSide(conflict: StoredMarkerSides, side: "current" | "incoming"): string {
  const count = side === "current" ? conflict.currentLines : conflict.incomingLines;
  const content = conflict[side].content;
  return count === undefined ? renderMarkerSide(content) : count === 0 ? "" : `${content}\n`;
}
