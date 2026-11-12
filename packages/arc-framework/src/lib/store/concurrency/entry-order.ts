/** Stable insertion anchors and retained-entry order reconciliation. */
import type { ListEntry } from "./entries.js";

function ids(entries: readonly ListEntry[],section: string,selected: Map<string,ListEntry>): string[] {
  return entries.filter((entry)=>entry.section === section && entry.id !== undefined && selected.get(entry.id)?.section === section)
    .map((entry)=>entry.id ?? "");
}
function equal(left: readonly string[],right: readonly string[]): boolean {
  return left.length === right.length && left.every((id,index)=>right[index] === id);
}

/** Order selected entries using side orders and nearest surviving insertion anchors.
 * @param base - Common-base entries.
 * @param current - Current-side entries.
 * @param incoming - Incoming-side entries.
 * @param selected - Entries selected by whole-entry reconciliation.
 * @param section - Section whose entries are being rendered.
 * @returns Identity order independent of side roles except retained conflicts.
 */
export function orderEntries(base: readonly ListEntry[],current: readonly ListEntry[],incoming: readonly ListEntry[],selected: Map<string,ListEntry>,section: string): string[] {
  const original = ids(base,section,selected);
  const existing = new Set(original);
  const left = ids(current,section,selected);
  const right = ids(incoming,section,selected);
  const leftKept = complete(left.filter((id)=>existing.has(id)),original);
  const rightKept = complete(right.filter((id)=>existing.has(id)),original);
  const order = equal(leftKept,original) ? rightKept : equal(rightKept,original) ? leftKept
    : equal(leftKept,rightKept) ? leftKept : original;
  const buckets = new Map<string,string[]>();
  const placed = new Set(existing);
  for (const side of [left,right]) {
    let anchor = "";
    for (const id of side) {
      if (!existing.has(id) && !placed.has(id)) {
        const bucket = buckets.get(anchor) ?? [];
        bucket.push(id);
        buckets.set(anchor,bucket);
        placed.add(id);
      }
      anchor = id;
    }
  }
  for (const [id,entry] of selected) {
    if (entry.section === section && !placed.has(id)) {
      const bucket = buckets.get("") ?? [];
      bucket.push(id); buckets.set("",bucket); placed.add(id);
    }
  }
  const result: string[] = [];
  function insert(anchor: string): void {
    for (const id of (buckets.get(anchor) ?? []).sort()) {
      if (result.includes(id)) continue;
      result.push(id); insert(id);
    }
  }
  insert("");
  for (const id of order) {result.push(id);insert(id);}
  return result;
}


function complete(side: readonly string[],original:readonly string[]): string[] {
  const result = [...side];
  let previous = "";
  for (const id of original) {
    if (!result.includes(id)) result.splice(previous === "" ? 0 : result.indexOf(previous)+1,0,id);
    previous = id;
  }
  return result;
}
