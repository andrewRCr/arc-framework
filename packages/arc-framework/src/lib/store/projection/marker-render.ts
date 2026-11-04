/** Render labelled conflict sets with one collision-free marker length for a file. */
import type { TextConflictRecord } from "../conflict.js";
import type { RecordEntry } from "./index-schema.js";
import { formatConflictToken } from "../../status/conflict-token.js";

/** An escalated set requires removing this instruction together with its markers. */
export const RESOLVE_BY_HAND_LINE = "<!-- arc-resolve-by-hand: Resolve this conflict by hand and delete this line with the markers. -->";

/** The indexed origin of a marker set. */
export type MarkerOrigin = NonNullable<RecordEntry["markers"]>["sets"][number];

/** A file-wide renderer shared by every conflict the file contains. */
export interface MarkerRenderer {
  readonly length: number;
  render(conflict: TextConflictRecord, origin: MarkerOrigin): string;
}

/** Choose the file's marker length from its whole content and every preserved side. */
export function createMarkerRenderer(contents: readonly string[]): MarkerRenderer {
  let longest = 0;
  for (const content of contents) {
    for (const match of content.matchAll(/^([<=>|])\1{6,}/gmu)) longest = Math.max(longest, match[0].length);
  }
  const length = longest === 0 ? 7 : longest + 4;
  return { length, render: (conflict, origin) => {
    const source = origin.shows === "checkout" ? "checkout" : JSON.stringify(formatConflictToken(origin.conflict));
    return `${"<".repeat(length)} ${label(conflict.current.label)} [arc-conflict: ${source}]\n`
      + (length === 7 ? "" : `${RESOLVE_BY_HAND_LINE}\n`)
      + renderMarkerSide(conflict.current.content) + `${"=".repeat(length)}\n`
      + renderMarkerSide(conflict.incoming.content) + `${">".repeat(length)} ${label(conflict.incoming.label)}\n`;
  } };
}

/** Put a preserved side before the next marker without joining their lines. */
export function renderMarkerSide(content: string): string {
  return content === "" || content.endsWith("\n") ? content : `${content}\n`;
}

function label(value: TextConflictRecord["current"]["label"]): string {
  return `${value.actor.replaceAll("\r", "\\r").replaceAll("\n", "\\n")} @ ${value.time}`;
}
