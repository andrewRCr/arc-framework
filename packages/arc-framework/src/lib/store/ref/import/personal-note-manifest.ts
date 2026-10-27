/** Complete manifest admission for personal notes required by the one-time import. */
import { isSafeManifestPath } from "../../../git/user-sync.js";

/** Validate supported legacy manifests before any caller treats their files as a complete snapshot. */
export function parseImportNoteFiles(content: string): Record<string, string> {
  const value: unknown = JSON.parse(content);
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !("version" in value) || value.version !== 1 && value.version !== 2
    || !("files" in value) || !value.files || typeof value.files !== "object" || Array.isArray(value.files)) {
    throw new Error("A required personal note has no supported files manifest");
  }
  const entries = Object.entries(value.files);
  for (const [path, bytes] of entries) {
    if (typeof bytes !== "string" || !isSafeManifestPath(path)) throw new Error(`A required personal note has an invalid file entry at ${JSON.stringify(path)}`);
  }
  return Object.fromEntries(entries);
}
