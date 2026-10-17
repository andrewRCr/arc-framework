/** Decode the immediate entries of a captured Git tree without another process. */

import type { BatchObject, RefTreeEntry } from "./batch-read.js";

/** Establish tree entries, returning null for unavailable or malformed tree bytes. */
export function parseRefTreeObject(object: BatchObject | null | undefined): RefTreeEntry[] | null {
  if (object?.type !== "tree") return null;
  const entries: RefTreeEntry[] = [];
  const width = object.oid.length / 2;
  let cursor = 0;
  try {
    while (cursor < object.bytes.length) {
      const space = object.bytes.indexOf(32, cursor), end = object.bytes.indexOf(0, space + 1);
      if (space < cursor || end <= space + 1 || end + 1 + width > object.bytes.length) return null;
      const decoder = new TextDecoder("utf-8", { fatal: true });
      const mode = decoder.decode(object.bytes.subarray(cursor, space)).padStart(6, "0");
      const path = decoder.decode(object.bytes.subarray(space + 1, end));
      entries.push({ mode, path, oid: Buffer.from(object.bytes.subarray(end + 1, end + 1 + width)).toString("hex") });
      cursor = end + 1 + width;
    }
  } catch { return null; }
  return entries;
}
