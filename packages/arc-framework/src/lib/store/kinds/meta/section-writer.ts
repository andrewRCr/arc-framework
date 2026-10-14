/** Whole-section editing for metadata Session Context and Pause. */

import type { MetaPause } from "../../../active/meta-schema.js";
import { renderMetaPauseBody } from "./pause-section.js";
import { locateMetaFieldBlock, type MetaFieldBlockLocation } from "./line-reading.js";

interface SectionSpan {
  readonly start: number;
  readonly end: number;
  readonly lineEnding: string;
}

function sectionSpans(
  block: MetaFieldBlockLocation, content: string, includePreamble: boolean, name: string,
): readonly SectionSpan[] {
  const spans: SectionSpan[] = [];
  for (let start = includePreamble ? 0 : block.h1Index + 1; start < block.lines.length; start += 1) {
    const heading = block.lines[start];
    if (heading?.text !== `## ${name}`) continue;
    const insideBlock = start > block.h1Index && start < block.closingIndex;
    let end = start + 1;
    for (; end < block.lines.length; end += 1) {
      if (end === block.h1Index || (insideBlock && end === block.closingIndex)
        || /^## /u.test(block.lines[end]?.text ?? "")) break;
    }
    spans.push({ start: heading.startOffset, end: block.lines[end]?.startOffset ?? content.length,
      lineEnding: heading.lineEnding });
    start = end - 1;
  }
  return spans;
}

function insertionOffset(block: MetaFieldBlockLocation, content: string): number {
  return block.lines[block.fieldEndIndex]?.startOffset ?? content.length;
}

function renderSessionContext(body: string, ending: string): string {
  const normalized = body.replace(/\r?\n/gu, ending);
  return normalized === "" ? `## Session Context${ending}${ending}`
    : `## Session Context${ending}${ending}${normalized}${ending}${ending}`;
}

/** Set, replace, insert, or remove the Session Context section.
 * @param content - Anchored metadata Markdown.
 * @param body - Whole section body, or null to remove the section.
 * @returns Markdown preserving every byte outside the section.
 * @throws When the metadata is unanchored or the body contains a section boundary.
 */
export function writeMetaSessionContext(content: string, body: string | null): string {
  const block = locateMetaFieldBlock(content);
  if (body !== null && body.split(/\r?\n/u).some((line) => /^## /u.test(line) || line.trim() === "---")) {
    throw new Error("Cannot write Session Context: body contains a section boundary.");
  }
  const targets = sectionSpans(block, content, body === null, "Session Context");
  if (body === null) {
    let result = content;
    for (const target of [...targets].reverse()) {
      result = `${result.slice(0, target.start)}${result.slice(target.end)}`;
    }
    return result;
  }
  const target = targets[0];
  const ending = target?.lineEnding || block.lines[block.h1Index]?.lineEnding || "\n";
  const rendered = renderSessionContext(body, ending);
  const start = target?.start ?? insertionOffset(block, content);
  const end = target?.end ?? start;
  return `${content.slice(0, start)}${rendered}${content.slice(end)}`;
}

/** Set, replace, insert, or remove the whole Pause section.
 * @param content - Anchored metadata Markdown.
 * @param pause - Whole pause state, or null to remove it.
 * @returns Markdown preserving all bytes outside the section.
 * @throws When any prose line would end the section.
 */
export function writeMetaPause(content: string, pause: MetaPause | null): string {
  const block = locateMetaFieldBlock(content);
  const targets = sectionSpans(block, content, pause === null, "Pause");
  if (pause === null) {
    let result = content;
    for (const target of [...targets].reverse()) result = `${result.slice(0, target.start)}${result.slice(target.end)}`;
    return result;
  }
  const prose = [pause.reason, pause.resumeNotes, pause.waitsOn?.kind === "note" ? pause.waitsOn.text : null];
  if (prose.some((text) => text?.split(/\r?\n/u).some((line) => /^## /u.test(line) || line.trim() === "---"))) {
    throw new Error("Cannot write Pause: body contains a section boundary.");
  }
  const target = targets[0];
  const ending = target?.lineEnding || block.lines[block.h1Index]?.lineEnding || "\n";
  const body = renderMetaPauseBody(pause).replace(/\r?\n/gu, ending);
  const start = target?.start ?? insertionOffset(block, content), end = target?.end ?? start;
  return `${content.slice(0, start)}## Pause${ending}${ending}${body}${ending}${ending}${content.slice(end)}`;
}
