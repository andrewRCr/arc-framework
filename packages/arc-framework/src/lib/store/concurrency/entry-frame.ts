/** Lossless prose frames and positions independent of entry edits and removals. */
import { splitEntryList, type EntryListConfig, type ListEntry } from "./entries.js";

/** Surrounding prose and entry insertion positions from one document. */
export interface EntryFrame {
  skeleton: string;
  entries: ListEntry[];
  offsets: Map<string,number>;
  lineOrigins: number[];
  separatorLines: Map<string,number>;
}

/** Remove entries from the prose view while retaining their insertion positions.
 * @param content - Complete document.
 * @param config - Entry grammar and section names.
 * @returns Outside prose and identity-keyed entry positions.
 */
export function entryFrame(content: string,config: EntryListConfig): EntryFrame {
  const frame: EntryFrame = {skeleton:"",entries:[],offsets:new Map(),lineOrigins:[],separatorLines:new Map()};
  let line = 0;
  for (const part of splitEntryList(content,config).parts) {
    if (part.kind === "entry") {
      if (part.id === undefined || frame.offsets.has(part.id)) throw new Error("Entries need distinct managed IDs before merge");
      frame.entries.push(part);
      frame.offsets.set(part.id,frame.skeleton.length);
      frame.separatorLines.set(part.id,line+part.bytes.split("\n").length-1);
      line += (part.bytes+part.separator).split("\n").length-1;
    } else {
      frame.skeleton += part.bytes;
      const count = part.bytes.split("\n").length-1;
      for (let index=0;index<count;index++) frame.lineOrigins.push(line+index);
      line += count;
    }
  }
  frame.lineOrigins.push(line);
  return frame;
}
