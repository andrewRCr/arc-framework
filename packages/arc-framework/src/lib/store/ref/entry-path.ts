/** Keep observed entry path coordinates together when projecting a captured tree. */
import type { RefTreeEntry } from "./batch-read.js";

type EntryPathChange = { fromPrefix: string; toPrefix: string } | { path: string };
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** Project an entry into another tree's path coordinates. */
export function projectRefTreeEntry(entry: RefTreeEntry, change: EntryPathChange): RefTreeEntry {
  if ("path" in change) {
    if (change.path === entry.path) return { ...entry };
    if (entry.invalidName || entry.rawPath) throw new Error("An invalid UTF-8 observed name cannot be replaced through its decoded path");
    encodePath(change.path);
    return { ...entry, path: change.path };
  }
  const from = encodePath(change.fromPrefix), to = encodePath(change.toPrefix);
  if ([change.fromPrefix, change.toPrefix].some(prefix => prefix !== "" && !prefix.endsWith("/"))
    || !entry.path.startsWith(change.fromPrefix)) throw new Error("An entry projection requires matching component prefixes");
  const path = change.toPrefix + entry.path.slice(change.fromPrefix.length);
  if (!entry.rawPath) return { ...entry, path };
  if (!from.every((byte, index) => entry.rawPath?.[index] === byte)) throw new Error("An observed entry's raw prefix does not match its decoded prefix");
  const suffix = entry.rawPath.subarray(from.length), rawPath = new Uint8Array(to.length + suffix.length);
  rawPath.set(to);
  rawPath.set(suffix, to.length);
  return { ...entry, path, rawPath };
}

function encodePath(path: string): Uint8Array {
  const bytes = encoder.encode(path);
  if (decoder.decode(bytes) !== path) throw new Error("An entry projection requires a lossless UTF-8 path");
  return bytes;
}
