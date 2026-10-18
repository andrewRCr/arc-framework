/** Stable managed entry IDs drawn only from a caller-provided random source. */
import { maskComments, rejoinEntryList, splitEntryList, type EntryListConfig, type ListEntry } from "./entries.js";

/** Stamp entries missing an identity without rewriting any other bytes.
 * @param content - Document to persist.
 * @param config - Entry grammar and section names.
 * @param random - Independent draws in the half-open interval from zero to one.
 * @returns The document with only missing managed ID lines inserted.
 */
export function stampEntryIds(content: string, config: EntryListConfig, random: () => number): string {
  const split = splitEntryList(content,config);
  const used = new Set(split.parts.flatMap((part) => part.kind === "entry" && part.id !== undefined ? [part.id] : []));
  const parts = split.parts.map((part) => {
    if (part.kind !== "entry" || part.id !== undefined) return part;
    const id = drawId(used,random);
    used.add(id);
    return {...part,id,bytes:insertId(part,config,id)};
  });
  return rejoinEntryList({parts});
}


function insertId(entry: ListEntry, config: EntryListConfig, id: string): string {
  const { shape } = config;
  const lines = [...entry.bytes.matchAll(/[^\n]*(?:\n|$)/gu)].filter((line)=>line[0].length > 0);
  const visible = [...maskComments(entry.bytes).matchAll(/[^\n]*(?:\n|$)/gu)].filter((line)=>line[0].length > 0);
  const position = shape === "field-header" ? triggerEnd(visible.map((line) => line[0])) : headingFieldsEnd(visible.map((line) => line[0]), config.managedFields);
  const line = lines[position];
  if (line === undefined) throw new Error("Entry has no header");
  const newline = line[0].endsWith("\r\n") || (!line[0].endsWith("\n") && entry.bytes.includes("\r\n")) ? "\r\n" : "\n";
  const idLine = `${shape === "heading" ? "- " : ""}_Id:_ \`${id}\``;
  return insertOutsideComment(entry.bytes,line.index+line[0].length,idLine,newline);
}

function triggerEnd(lines: readonly string[]): number {
  let position = lines.findIndex((line) => /^[_*]Remove when:/u.test(line.trim()));
  const first = lines[position];
  if (first === undefined) throw new Error("Field-header entry has no removal trigger");
  if (/^\s*[_*]Remove when:[_*]/u.test(first)) return position;
  const delimiter = first.trim()[0] ?? "_";
  while (!(lines[position] ?? "").trimEnd().endsWith(delimiter) && position + 1 < lines.length) position++;
  return position;
}

function headingFieldsEnd(lines: readonly string[], managedFields?: readonly string[]): number {
  let position = 0;
  for (const [index, line] of lines.entries()) {
    const key = /^\s*-\s+_(.+?):_/u.exec(line)?.[1] ?? /^\s*-\s+`?(WU_Target):/u.exec(line)?.[1];
    const matches = managedFields === undefined ? /^\s*-\s+_[^_]+:_/u.test(line)
      : key !== undefined && (managedFields.includes(key) || (key === "Disposition" && lines.slice(1, index).every((prior) => prior.trim() === "")));
    if (matches) position = index;
  }
  while (/^\s{2,}\S/u.test(lines[position + 1] ?? "")) position++;
  return position;
}

function insertOutsideComment(bytes:string,offset:number,idLine:string,newline:string): string {
  const comment = [...bytes.matchAll(/<!--[\s\S]*?(?:-->|$)/gu)]
    .find((match)=>match.index < offset && offset < match.index+match[0].length);
  if (comment !== undefined) offset = comment.index;
  const prefix = offset > 0 && bytes[offset-1] !== "\n" ? newline : "";
  const suffix = offset < bytes.length ? newline : "";
  const inserted = prefix+idLine+suffix;
  return bytes.slice(0,offset)+inserted+bytes.slice(offset);
}


/** Draw a unique list-local identity using the same primitive as first-persist stamping.
 * @param used - Identities already held in this list.
 * @param random - A random draw in the half-open unit interval.
 * @returns An unused lowercase eight-hex identity.
 */
export function drawId(used: ReadonlySet<string>, random: () => number): string {
  for (let attempt=0;attempt<1024;attempt++) {
    const draw = random();
    if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error("Random draw must be between zero and one");
    const id = Math.floor(draw*0x100000000).toString(16).padStart(8,"0");
    if (!used.has(id)) return id;
  }
  throw new Error("Random source did not produce a distinct entry ID");
}
