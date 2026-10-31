/** Lossless generic Markdown entry splitting and stable managed identity stamping. */

/** Role-based entry grammars; callers supply the sections that hold entries. */
export interface EntryListConfig { readonly shape: "heading" | "field-header"; readonly sections: readonly string[]; readonly managedFields?: readonly string[] }
/** A detected entry, with its trailing separator kept separately from its identity-bearing bytes. */
export interface ListEntry {
  readonly kind: "entry";
  readonly section: string;
  readonly id: string | undefined;
  readonly bytes: string;
  readonly separator: string;
}
/** Bytes surrounding entries, including comments and section boundaries. */
export interface OutsideEntry { readonly kind: "outside"; readonly bytes: string }
/** The ordered lossless representation of one document. */
export interface SplitEntryList { readonly parts: readonly (ListEntry | OutsideEntry)[] }

/** Split a document while retaining its exact bytes.
 * @param content - Complete document text.
 * @param config - Entry grammar and section names.
 * @returns Ordered entries and surrounding bytes.
 */
export function splitEntryList(content: string, config: EntryListConfig): SplitEntryList {
  const masked = maskComments(content);
  const parts: (ListEntry | OutsideEntry)[] = [];
  const lines = [...masked.matchAll(/[^\n]*(?:\n|$)/gu)].filter((line) => line[0].length > 0);
  const textLines = lines.map(line => line[0].replace(/\r?\n$/u, "").trimEnd());
  const fieldHeaders = new Set(config.shape === "field-header" ? fieldHeaderSpans(textLines).map(span => span.start) : []);
  let section: string | null = null;
  let started: {offset:number;section:string} | null = null;
  let consumed = 0;
  function flush(end: number): void {
    if (started === null) return;
    if (consumed < started.offset) parts.push({kind:"outside",bytes:content.slice(consumed,started.offset)});
    const block = content.slice(started.offset,end);
    const commentStart = entryContentEnd(block);
    const raw = block.slice(0,commentStart);
    const separator = raw.match(/(?:\r?\n[ \t]*)+$/u)?.[0] ?? "";
    const bytes = raw.slice(0,raw.length-separator.length);
    parts.push({kind:"entry",section:started.section,id:readEntryId(bytes),bytes,separator});
    if (commentStart < block.length) parts.push({kind:"outside",bytes:block.slice(commentStart)});
    consumed = end;
    started = null;
  }
  for (const [index, line] of lines.entries()) {
    const text = textLines[index] ?? "";
    const offset = line.index;
    if (text.startsWith("## ") || text === "---") {
      flush(offset);
      const name = text.startsWith("## ") ? text.slice(3) : "";
      section = config.sections.includes(name) ? name : null;
    } else if (section !== null && isEntryHeader(text, config.shape, fieldHeaders.has(index))) {
      flush(offset);
      started = {offset,section};
    }
  }
  flush(content.length);
  if (consumed < content.length) parts.push({kind:"outside",bytes:content.slice(consumed)});
  return {parts};
}

/** Reassemble a lossless entry split.
 * @param split - Ordered parts produced by the splitter.
 * @returns The document bytes in original order.
 */
export function rejoinEntryList(split: SplitEntryList): string {
  return split.parts.map((part) => part.bytes + (part.kind === "entry" ? part.separator : "")).join("");
}


function isEntryHeader(line: string, shape: EntryListConfig["shape"], fieldHeader: boolean): boolean {
  return shape === "heading" ? /^###\s/u.test(line) : fieldHeader;
}

interface FieldHeaderBoldState { markers: (number | undefined)[]; codeTicks: number; boundaryDepth: number }

/** Locate complete bold field headers across consecutive non-blank lines without crossing sections. */
export function fieldHeaderSpans(lines: readonly string[]): readonly { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  const state: FieldHeaderBoldState = { markers: [], codeTicks: 0, boundaryDepth: 0 };
  for (const [index, line] of lines.entries()) {
    const text = line.trimEnd();
    if (!text.trim() || text.startsWith("## ") || text === "---") { resetFieldHeader(state); continue; }
    const start = fieldHeaderLineStart(text, index, state)
      ?? (/^\*\*.+:\*\*\s*$/u.test(text) ? index : undefined);
    if (start === undefined) continue;
    spans.push({ start, end: index });
    resetFieldHeader(state);
  }
  return spans;
}

function resetFieldHeader(state: FieldHeaderBoldState): void {
  state.markers.length = 0;
  state.codeTicks = 0;
  state.boundaryDepth = 0;
}

function fieldHeaderLineStart(text: string, line: number, state: FieldHeaderBoldState): number | undefined {
  let escapedThrough = 0;
  for (const token of text.matchAll(/\\|`+|\*\*/gu)) {
    if (token.index < escapedThrough) continue;
    if (token[0] === "\\" && state.codeTicks === 0) { escapedThrough = token.index + 2; continue; }
    const start = fieldHeaderToken(text, line, token[0], token.index, state);
    if (start !== undefined) return start;
  }
  return undefined;
}

function fieldHeaderToken(text: string, line: number, token: string, offset: number, state: FieldHeaderBoldState): number | undefined {
  if (token.startsWith("`")) {
    if (state.markers.length > 0) state.codeTicks = fieldHeaderCodeTicks(state.codeTicks, token.length);
    return undefined;
  }
  if (token !== "**" || state.codeTicks !== 0) return undefined;
  return fieldHeaderBold(text, line, offset, state);
}

function fieldHeaderCodeTicks(current: number, width: number): number {
  if (current === 0) return width;
  return current === width ? 0 : current;
}

function fieldHeaderBold(text: string, line: number, offset: number, state: FieldHeaderBoldState): number | undefined {
  const { markers } = state;
  if (offset === 0) {
    // A completed inline span leaves its outer title pending; closed prose does not.
    if (state.boundaryDepth === 0 && markers.length !== 1) markers.length = 0;
    markers.push(line);
    state.boundaryDepth++;
    return undefined;
  }
  if (markers.length === 0) return undefined;
  const { opens, closes } = fieldHeaderBoldFlanking(text, offset);
  state.boundaryDepth = fieldHeaderBoundaryDepth(state.boundaryDepth, opens, closes);
  // Inline closers match nested openers regardless of whether they started a line.
  if (closes && (!opens || markers.length > 1)) {
    const opening = markers.pop();
    return opening !== undefined && offset === text.length - 2 && /:\*\*$/u.test(text) ? opening : undefined;
  }
  if (opens) markers.push(undefined);
  return undefined;
}

function fieldHeaderBoundaryDepth(depth: number, opens: boolean, closes: boolean): number {
  if (closes && depth > 0) return depth - 1;
  return opens ? depth + 1 : depth;
}

function fieldHeaderBoldFlanking(text: string, offset: number): { opens: boolean; closes: boolean } {
  const before = boldCharacterClass(text.slice(Math.max(0, offset - 2), offset).match(/.$/u)?.[0]);
  const after = boldCharacterClass(text.slice(offset + 2, offset + 4).match(/^./u)?.[0]);
  return {
    opens: after === "text" || (after === "punctuation" && before !== "text"),
    closes: before === "text" || (before === "punctuation" && after !== "text"),
  };
}

function boldCharacterClass(character: string | undefined): "space" | "punctuation" | "text" {
  if (character === undefined || /\s/u.test(character)) return "space";
  return /[\p{P}\p{S}]/u.test(character) ? "punctuation" : "text";
}

/** Hide comments from recognition while retaining offsets and line endings.
 * @param content - Markdown containing opaque HTML comments.
 * @returns Equal-length text with comment characters hidden.
 */
export function maskComments(content: string): string {
  return content.replace(/<!--[\s\S]*?(?:-->|$)/gu, (comment) => comment.replace(/[^\r\n]/g," "));
}

/** Read the stable managed entry field outside comment examples.
 * @param bytes - One entry's text.
 * @returns Its valid lowercase eight-hex identity, if present.
 */
export function readEntryId(bytes: string): string | undefined {
  return /_Id:_\s*`([0-9a-f]{8})`/u.exec(maskComments(bytes))?.[1];
}


/** Find the start of document-level closed comments following an entry's content.
 * @param block - Entry block whose trailing closed comments are outside its content.
 * @returns First trailing comment offset, or the block length when none follows.
 */
export function entryContentEnd(block: string): number {
  let end = block.length;
  for (const comment of [...block.matchAll(/<!--[\s\S]*?-->/gu)].reverse()) {
    if (block.slice(comment.index+comment[0].length,end).trim().length > 0) break;
    end = comment.index;
  }
  return end;
}
