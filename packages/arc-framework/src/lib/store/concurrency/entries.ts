/** Lossless generic Markdown entry splitting and stable managed identity stamping. */

/** Role-based entry grammars; callers supply the sections that hold entries. */
export interface EntryListConfig { readonly shape: "heading" | "field-header"; readonly sections: readonly string[] }
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
  let section: string | null = null;
  let started: {offset:number;section:string} | null = null;
  let consumed = 0;
  function flush(end: number): void {
    if (started === null) return;
    if (consumed < started.offset) parts.push({kind:"outside",bytes:content.slice(consumed,started.offset)});
    const block = content.slice(started.offset,end);
    const commentStart = trailingComments(block);
    const raw = block.slice(0,commentStart);
    const separator = raw.match(/(?:\r?\n[ \t]*)+$/u)?.[0] ?? "";
    const bytes = raw.slice(0,raw.length-separator.length);
    parts.push({kind:"entry",section:started.section,id:readEntryId(bytes),bytes,separator});
    if (commentStart < block.length) parts.push({kind:"outside",bytes:block.slice(commentStart)});
    consumed = end;
    started = null;
  }
  for (const line of lines) {
    const text = line[0].replace(/\r?\n$/u,"").trimEnd();
    const offset = line.index;
    if (text.startsWith("## ") || text === "---") {
      flush(offset);
      const name = text.startsWith("## ") ? text.slice(3) : "";
      section = config.sections.includes(name) ? name : null;
    } else if (section !== null && isEntryHeader(text,config.shape)) {
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


function isEntryHeader(line: string, shape: EntryListConfig["shape"]): boolean {
  return shape === "heading" ? /^###\s/u.test(line) : /^\*\*.+:\*\*\s*$/u.test(line);
}

/** Hide comments from recognition while retaining offsets and line endings.
 * @param content - Markdown containing opaque HTML comments.
 * @returns Equal-length text with comment characters hidden.
 */
export function maskComments(content: string): string {
  return content.replace(/<!--[\s\S]*?(?:-->|$)/gu, (comment) => comment.replace(/[^\r\n]/gu," "));
}

/** Read the stable managed entry field outside comment examples.
 * @param bytes - One entry's text.
 * @returns Its valid lowercase eight-hex identity, if present.
 */
export function readEntryId(bytes: string): string | undefined {
  return /_Id:_\s*`([0-9a-f]{8})`/u.exec(maskComments(bytes))?.[1];
}


function trailingComments(block: string): number {
  let end = block.length;
  for (const comment of [...block.matchAll(/<!--[\s\S]*?-->/gu)].reverse()) {
    if (block.slice(comment.index+comment[0].length,end).trim().length > 0) break;
    end = comment.index;
  }
  return end;
}
