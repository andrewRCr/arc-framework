/** Whole-entry observed-remove merge with independent three-way prose reconciliation. */
import type { TextConflictRecord } from "../conflict.js";
import type { EntryListConfig, ListEntry } from "./entries.js";
import { entryFrame, type EntryFrame } from "./entry-frame.js";
import { orderEntries } from "./entry-order.js";
import { entrySection, retainEntrySections } from "./entry-sections.js";
import { mergeLineText, relocateTextOffsets, type MergeTextInput, type MergeTextResult } from "./line-merge.js";

function same(left: ListEntry | undefined,right: ListEntry | undefined): boolean {
  return left === undefined ? right === undefined : right !== undefined && left.bytes === right.bytes && left.section === right.section;
}

/** Merge identity-keyed entries, keeping the current side of a same-entry clash.
 * @param input - Common base and labelled current and incoming documents.
 * @param config - Entry grammar and containing section names.
 * @returns The merged document and preserved whole-entry or prose conflicts.
 */
export function mergeEntryText(input: MergeTextInput, config: EntryListConfig): MergeTextResult {
  const base = entryFrame(input.base,config);
  const current = entryFrame(input.current,config);
  const incoming = entryFrame(input.incoming,config);
  const conflicts: TextConflictRecord[] = [];
  const selected = chooseEntries(base,current,incoming,input,conflicts);
  const prose = mergeLineText({...input,base:base.skeleton,current:current.skeleton,incoming:incoming.skeleton});
  conflicts.push(...mapConflicts(prose.conflicts,base.lineOrigins));
  const skeleton = retainEntrySections(prose.content,selected,[current,incoming,base]);
  const content = renderEntries(config,selected,base,current,incoming,skeleton,input,conflicts);
  return {content,conflicts};
}

function chooseEntries(base:EntryFrame,current:EntryFrame,incoming:EntryFrame,input:MergeTextInput,conflicts:TextConflictRecord[]): Map<string,ListEntry> {
  const originals = new Map(base.entries.map((entry)=>[entry.id ?? "",entry]));
  const left = new Map(current.entries.map((entry)=>[entry.id ?? "",entry]));
  const right = new Map(incoming.entries.map((entry)=>[entry.id ?? "",entry]));
  const chosen = new Map<string,ListEntry>();
  for (const id of new Set([...originals.keys(),...left.keys(),...right.keys()])) {
    const original = originals.get(id);
    const a = left.get(id);
    const b = right.get(id);
    const selection = same(a,b) ? a : same(a,original) ? b : same(b,original) ? a : a ?? b;
    if (selection !== undefined) chosen.set(id,selection);
    // A missing side observes only the base entry: concurrent edits survive its removal.
    if (a !== undefined && b !== undefined && !same(a,b) && !same(a,original) && !same(b,original)) {
      conflicts.push(entryConflict(input,id,original,a,b));
    }
  }
  return chosen;
}

function entryConflict(input:MergeTextInput,id:string,base:ListEntry|undefined,current:ListEntry,incoming:ListEntry): TextConflictRecord {
  return {record:input.record,location:{kind:"entry",id},base:base?.bytes ?? "",baseSection:base?.section ?? null,
    current:{content:current.bytes,section:current.section,label:input.currentLabel},
    incoming:{content:incoming.bytes,section:incoming.section,label:input.incomingLabel}};
}

function mapConflicts(conflicts:TextConflictRecord[],origins:readonly number[]): TextConflictRecord[] {
  return conflicts.map((conflict)=> {
    if (conflict.location.kind !== "hunk") return conflict;
    const {start,end} = conflict.location;
    return {...conflict,location:{kind:"hunk",start:origins[start] ?? origins.at(-1) ?? 0,
      end:end === start ? origins[start] ?? origins.at(-1) ?? 0 : (origins[end-1] ?? origins.at(-1) ?? 0)+1}};
  });
}


function renderEntries(config:EntryListConfig,selected:Map<string,ListEntry>,base:EntryFrame,current:EntryFrame,incoming:EntryFrame,prose:string,input:MergeTextInput,conflicts:TextConflictRecord[]): string {
  const chunks: {position:number;bytes:string;order:number}[] = [];
  for (const section of config.sections) {
    const order = orderEntries(base.entries,current.entries,incoming.entries,selected,section);
    const positions = placementOffsets(order,section,selected,base,current,incoming,prose);
    const bounds = entrySection(prose,section);
    for (const [index,id] of order.entries()) {
      const entry = selected.get(id);
      if (entry === undefined) continue;
      const separator = mergeSeparator(id,base,current,incoming,input,conflicts);
      if (bounds === undefined) throw new Error(`Selected entry lacks its section: ${section}`);
      const position = Math.max(bounds.body,Math.min(positions[index] ?? bounds.end,bounds.end));
      chunks.push({position,bytes:entry.bytes+separator,order:chunks.length});
    }
  }
  chunks.sort((left,right)=>left.position-right.position || left.order-right.order);
  let result = "";
  let cursor = 0;
  for (const chunk of chunks) {
    result += prose.slice(cursor,chunk.position);
    if (result.length > 0 && !result.endsWith("\n")) result += chunk.bytes.match(/\r?\n/u)?.[0] ?? "\n";
    result += chunk.bytes;
    cursor = chunk.position;
  }
  return result+prose.slice(cursor);
}

function placementOffsets(order:readonly string[],section:string,selected:Map<string,ListEntry>,base:EntryFrame,current:EntryFrame,incoming:EntryFrame,prose:string): number[] {
  const originalIds = new Set(base.entries.filter((entry)=>entry.section === section && selected.get(entry.id ?? "")?.section === section).map((entry)=>entry.id));
  const positions = new Map<string,number>();
  for (const id of order) {
    if (originalIds.has(id)) {
      positions.set(id,retainedPosition(id,section,base,current,incoming,prose));
    }
  }
  let prior = 0;
  return order.map((id,index)=> {
    let position = positions.get(id);
    if (position === undefined) {
      const side = same(selected.get(id),current.entries.find((entry)=>entry.id === id)) ? current : incoming;
      position = relocateTextOffsets(side.skeleton,prose,[side.offsets.get(id) ?? 0])[0] ?? 0;
    }
    const next = order.slice(index+1).find((following)=>positions.has(following));
    const upper = next === undefined ? prose.length : positions.get(next) ?? prose.length;
    position = Math.max(prior,Math.min(position,upper));
    prior = position;
    return position;
  });
}

function retainedPosition(id:string,section:string,base:EntryFrame,current:EntryFrame,incoming:EntryFrame,prose:string): number {
  const position = (frame:EntryFrame): number | undefined => {
    if (frame.entries.find((entry)=>entry.id === id)?.section !== section) return undefined;
    const offset = frame.offsets.get(id);
    return offset === undefined ? undefined : relocateTextOffsets(frame.skeleton,prose,[offset])[0];
  };
  const original = position(base) ?? 0;
  const left = position(current);
  const right = position(incoming);
  if (left === original && right !== undefined) return right;
  return left ?? right ?? original;
}

function mergeSeparator(id:string,base:EntryFrame,current:EntryFrame,incoming:EntryFrame,input:MergeTextInput,conflicts:TextConflictRecord[]): string {
  const original = base.entries.find((entry)=>entry.id === id)?.separator;
  const left = current.entries.find((entry)=>entry.id === id)?.separator;
  const right = incoming.entries.find((entry)=>entry.id === id)?.separator;
  if (original === undefined) return left ?? right ?? "\n\n";
  const merged = mergeLineText({...input,base:original,current:left ?? original,incoming:right ?? original});
  const offset = base.separatorLines.get(id) ?? 0;
  conflicts.push(...merged.conflicts.map((conflict)=>conflict.location.kind === "hunk"
    ? {...conflict,location:{kind:"hunk" as const,start:conflict.location.start+offset,end:conflict.location.end+offset}} : conflict));
  return merged.content;
}
