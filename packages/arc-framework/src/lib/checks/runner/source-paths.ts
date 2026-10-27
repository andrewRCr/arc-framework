/** Decode literal NUL-framed source names without replacement or traversal normalization. */
import { SourceEntryPathSchema } from "./contract-source.js";
import { SourceCaptureError } from "./source-error.js";
import { isAbsolute, relative, sep } from "node:path";

/** Whether a native path is lexically the root itself or one of its descendants. */
export function sourcePathContains(root: string, path: string): boolean {
  const name = relative(root, path);
  return !isAbsolute(name) && name !== ".." && !name.startsWith(`..${sep}`);
}

/** Decode literal source UTF-8 text, preserving BOM characters and refusing replacement decoding. */
export function decodeSourceText(bytes: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new SourceCaptureError("Source text is not valid UTF-8"); }
}

/** Decode byte-preserving Git paths, rejecting malformed framing, UTF-8 and duplicate names. */
export function decodeSourcePaths(bytes: Uint8Array): string[] {
  if (bytes.length === 0) return [];
  const text = decodeSourceText(bytes);
  const paths = text.split("\0");
  if (paths.pop() !== "" || paths.some(path => !SourceEntryPathSchema.safeParse(path).success)
    || new Set(paths).size !== paths.length) throw new SourceCaptureError("Source paths are not uniquely representable");
  return paths;
}
