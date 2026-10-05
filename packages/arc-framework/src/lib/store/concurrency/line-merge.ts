/** Three-way prose merge with preserved labelled conflicts and byte-level newline handling. */
import { diff3Merge, diffIndices } from "node-diff3";
import type { TextConflictRecord, SideLabel } from "../conflict.js";
import type { RecordReference } from "../identity.js";

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
  const base = lines(input.base);
  const current = lines(input.current);
  const incoming = lines(input.incoming);
  const result: string[] = [];
  const conflicts: TextConflictRecord[] = [];
  for (const region of diff3Merge(current, base, incoming, {excludeFalseConflicts:true,stringSeparator:/\n/u})) {
    result.push(...(region.ok ?? region.conflict?.a ?? []));
    const clash = region.conflict;
    if (clash !== undefined) {
      conflicts.push({record:input.record,location:{kind:"hunk",start:clash.oIndex,end:clash.oIndex+clash.o.length},
        base:clash.o.join("\n"),current:{content:clash.a.join("\n"),label:input.currentLabel},
        incoming:{content:clash.b.join("\n"),label:input.incomingLabel}});
    }
  }
  const finalNewline = input.current.endsWith("\n") === input.base.endsWith("\n")
    ? input.incoming.endsWith("\n") : input.current.endsWith("\n");
  return {content:result.join("\n") + (finalNewline ? "\n" : ""),conflicts};
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
