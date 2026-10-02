/** Stable managed entry IDs drawn only from a caller-provided random source. */
import { rejoinEntryList, splitEntryList, type EntryListConfig, type ListEntry } from "./entries.js";

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
    return {...part,id,bytes:insertId(part,config.shape,id)};
  });
  return rejoinEntryList({parts});
}


function insertId(entry: ListEntry, shape: EntryListConfig["shape"], id: string): string {
  const lines = [...entry.bytes.matchAll(/[^\n]*(?:\n|$)/gu)].filter((line)=>line[0].length > 0);
  let position = 0;
  if (shape === "field-header") {
    position = lines.findIndex((line)=>/^[_*]Remove when:/u.test(line[0].trim()));
    if (position < 0) throw new Error("Field-header entry has no removal trigger");
  } else {
    for (const [index,line] of lines.entries()) {
      if (/^\s*-\s+_[^_]+:_/u.test(line[0])) position = index;
    }
    while (/^\s{2,}\S/u.test(lines[position+1]?.[0] ?? "")) position++;
  }
  const line = lines[position];
  if (line === undefined) throw new Error("Entry has no header");
  const newline = line[0].endsWith("\r\n") || (!line[0].endsWith("\n") && entry.bytes.includes("\r\n")) ? "\r\n" : "\n";
  const idLine = `${shape === "heading" ? "- " : ""}_Id:_ \`${id}\``;
  const offset = line.index+line[0].length;
  const inserted = line[0].endsWith("\n") ? idLine+newline : newline+idLine;
  return entry.bytes.slice(0,offset)+inserted+entry.bytes.slice(offset);
}


function drawId(used: Set<string>, random: () => number): string {
  for (let attempt=0;attempt<1024;attempt++) {
    const draw = random();
    if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error("Random draw must be between zero and one");
    const id = Math.floor(draw*0x100000000).toString(16).padStart(8,"0");
    if (!used.has(id)) return id;
  }
  throw new Error("Random source did not produce a distinct entry ID");
}
