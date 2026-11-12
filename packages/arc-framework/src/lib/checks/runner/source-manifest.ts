/** Canonical public source-manifest encoding and whole-artifact identity. */
import { createHash } from "node:crypto";
import { SourceManifestSchema, type SourceManifest, type SourceManifestEntry } from "./contract-source.js";
import { SourceCaptureError } from "./source-error.js";

/** One normalized manifest and the exact UTF-8 encoding its digest identifies. */
export interface SourceManifestIdentity {
  manifest: SourceManifest;
  encoding: string;
  digest: `sha256:${string}`;
}

/** Order and encode a complete source manifest independently from its storage locations. */
export function identifySourceManifest(manifest: SourceManifest): SourceManifestIdentity {
  const entries = [...manifest.entries].sort((first, second) => Buffer.compare(Buffer.from(first.path), Buffer.from(second.path)));
  const parsed = SourceManifestSchema.safeParse({ ...manifest, entries });
  if (!parsed.success) throw new SourceCaptureError("Source manifest is invalid");
  const { tree, head, base, merged } = parsed.data.coordinates;
  const canonical: SourceManifest = { version: 1, coordinates: {
    tree, ...(head === undefined ? {} : { head }), ...(base === undefined ? {} : { base }), merged,
  }, entries: parsed.data.entries.map(canonicalEntry) };
  const encoding = JSON.stringify(canonical);
  return { manifest: canonical, encoding, digest: `sha256:${createHash("sha256").update(encoding, "utf8").digest("hex")}` };
}

function canonicalEntry(entry: SourceManifestEntry): SourceManifestEntry {
  return entry.kind === "file"
    ? { path: entry.path, kind: "file", mode: entry.mode, digest: entry.digest, bytes: entry.bytes }
    : { path: entry.path, kind: "symlink", target: entry.target };
}
