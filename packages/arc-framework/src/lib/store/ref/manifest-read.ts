/** Resolve a state manifest's complete tree structure without fetching its gitlink tips. */

import type { RefBackendContext } from "./context.js";
import { readBatchObjects, type BatchObject } from "./batch-read.js";
import { buildRefManifest, isManifestRef, type ManifestEntry } from "./manifest.js";

/** Return only complete canonical manifests; unavailable or other objects do not resolve. */
export async function readRefManifest(context: RefBackendContext, version: string): Promise<ReadonlyMap<string, string> | null> {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(version)) return null;
  let pending = [{ oid: version, prefix: "refs/arc/" }];
  const tips = new Map<string, string>();
  while (pending.length > 0) {
    const objects = await readBatchObjects(context, [...new Set(pending.map(({ oid }) => oid))]);
    const next: typeof pending = [];
    for (const { oid, prefix } of pending) {
      const entries = manifestEntries(objects.get(oid), version.length / 2);
      if (!entries || !collectEntries(entries, prefix, tips, next)) return null;
    }
    pending = next;
  }
  return buildRefManifest(tips, version.length === 64 ? "sha256" : "sha1").version === version ? tips : null;
}

function collectEntries(entries: readonly ManifestEntry[], prefix: string, tips: Map<string, string>,
  next: { oid: string; prefix: string }[]): boolean {
  for (const entry of entries) {
    const ref = prefix + entry.name;
    if (entry.mode === "40000") { next.push({ oid: entry.oid, prefix: `${ref}/` }); continue; }
    if (!isManifestRef(ref)) return false;
    tips.set(ref, entry.oid);
  }
  return true;
}

function manifestEntries(object: BatchObject | null | undefined, width: number): ManifestEntry[] | null {
  if (object?.type !== "tree") return null;
  const entries: ManifestEntry[] = [];
  let cursor = 0;
  const bytes = object.bytes;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  while (cursor < bytes.length) {
    const space = bytes.indexOf(32, cursor), nul = bytes.indexOf(0, space + 1);
    if (space < cursor || nul <= space + 1 || nul + 1 + width > bytes.length) return null;
    const mode = decoder.decode(bytes.subarray(cursor, space));
    if (mode !== "40000" && mode !== "160000") return null;
    let name: string;
    try { name = decoder.decode(bytes.subarray(space + 1, nul)); } catch { return null; }
    if (name.includes("/")) return null;
    entries.push({ mode, name, oid: Buffer.from(bytes.subarray(nul + 1, nul + 1 + width)).toString("hex") });
    cursor = nul + 1 + width;
  }
  return entries;
}
