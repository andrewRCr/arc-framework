/** Three-way prose merge with preserved labelled conflicts and byte-level newline handling. */
import { diff3MergeRegions, diffIndices } from "node-diff3";
import type { TextConflictRecord, SideLabel } from "../conflict.js";
import type { RecordReference } from "../identity.js";
import { alignMergedTables, compareTablePadding } from "./table-padding.js";

/** Role-labelled inputs; a conflict always keeps the store's current side. */
export interface MergeTextInput {
  readonly base: string;
  readonly current: string;
  readonly incoming: string;
  readonly record: RecordReference;
  readonly currentLabel: SideLabel;
  readonly incomingLabel: SideLabel;
}
/** Text to persist and the clashes to store alongside it. */
export interface MergeTextResult { content: string; conflicts: TextConflictRecord[] }

/** Merge complete text without inline conflict markers.
 * @param input - Base and caller-labelled current and incoming versions.
 * @returns Merged text retaining the current side of every conflicting hunk.
 */
export function mergeLineText(input: MergeTextInput): MergeTextResult {
  if (input.current === input.base) return {content:input.incoming,conflicts:[]};
  if (input.incoming === input.base || input.current === input.incoming) return {content:input.current,conflicts:[]};
  const base = lines(input.base);
  const current = lines(input.current);
  const incoming = lines(input.incoming);
  const comparisons = {o:compareTablePadding(base),a:compareTablePadding(current),b:compareTablePadding(incoming)};
  const originals = {o:base,a:current,b:incoming};
  const origins = {o:unchangedLines(comparisons.o.normalized,comparisons.a.normalized),
    a:new Map(current.map((_,index) => [index,index])),b:new Map<number,number>()};
  const result: string[] = [];
  const currentLines: (number | undefined)[] = [];
  const conflicts: TextConflictRecord[] = [];
  for (const region of diff3MergeRegions(comparisons.a.normalized,comparisons.o.normalized,comparisons.b.normalized)) {
    if (region.stable) {
      for (let index = region.bufferStart; index < region.bufferStart + region.bufferLength; index += 1) {
        const origin = origins[region.buffer].get(index);
        result.push(retainedLine(originals[region.buffer][index],current,origin));
        currentLines.push(origin);
      }
    } else {
      result.push(...current.slice(region.aStart,region.aStart + region.aLength));
      currentLines.push(...Array.from({length:region.aLength},(_,index) => region.aStart + index));
      if (sameLines(region.aContent,region.bContent)) continue;
      conflicts.push({record:input.record,location:{kind:"hunk",start:region.oStart,end:region.oStart + region.oLength},
        base:base.slice(region.oStart,region.oStart + region.oLength).join("\n"),
        current:{content:current.slice(region.aStart,region.aStart + region.aLength).join("\n"),label:input.currentLabel},
        incoming:{content:incoming.slice(region.bStart,region.bStart + region.bLength).join("\n"),label:input.incomingLabel}});
    }
  }
  const finalNewline = input.current.endsWith("\n") === input.base.endsWith("\n")
    ? input.incoming.endsWith("\n") : input.current.endsWith("\n");
  return {content:alignMergedTables(result,currentLines,comparisons.a,current).join("\n") + (finalNewline ? "\n" : ""),conflicts};
}

function sameLines(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((line,index) => line === right[index]);
}

function retainedLine(original: string | undefined, current: readonly string[], origin: number | undefined): string {
  return (origin === undefined ? undefined : current[origin]) ?? original ?? "";
}

function unchangedLines(source: string[], target: string[]): Map<number,number> {
  const matches = new Map<number,number>();
  let sourceIndex = 0;
  let targetIndex = 0;
  for (const change of [...diffIndices(source,target),{buffer1:[source.length,0],buffer2:[target.length,0]}]) {
    while (sourceIndex < change.buffer1[0]) matches.set(sourceIndex++,targetIndex++);
    sourceIndex += change.buffer1[1];
    targetIndex = change.buffer2[0] + change.buffer2[1];
  }
  return matches;
}

function lines(text: string): string[] {
  if (text.length === 0) return [];
  return (text.endsWith("\n") ? text.slice(0,-1) : text).split("\n");
}


/** Translate boundary offsets through line edits without exposing dependency types.
 * @param source - Text holding the original boundary positions.
 * @param target - Text after the prose merge.
 * @param offsets - Character boundaries to relocate.
 * @returns Character boundaries in the target, preserving unchanged line positions.
 */
export function relocateTextOffsets(source: string,target: string,offsets:readonly number[]): number[] {
  const before = source.split("\n");
  const after = target.split("\n");
  const changes = diffIndices(before,after);
  return offsets.map((offset)=> {
    const prefix = source.slice(0,offset);
    const row = prefix.split("\n").length-1;
    const column = prefix.length-(prefix.lastIndexOf("\n")+1);
    let shifted = row;
    for (const change of changes) {
      const [start,length] = change.buffer1;
      if (row < start) break;
      if (row <= start+length) {
        shifted = change.buffer2[0]+Math.min(row-start,change.buffer2[1]);
        break;
      }
      shifted += change.buffer2[1]-length;
    }
    const head = after.slice(0,shifted).join("\n");
    return Math.min(target.length,(shifted === 0 ? 0 : head.length+1)+Math.min(column,after[shifted]?.length ?? 0));
  });
}
