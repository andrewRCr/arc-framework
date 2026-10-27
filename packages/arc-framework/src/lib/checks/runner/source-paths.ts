/** Decode literal NUL-framed source names without replacement or traversal normalization. */
import { SourceEntryPathSchema } from "./contract-source.js";
import { SourceCaptureError } from "./source-error.js";

/** Decode literal UTF-8 path text, preserving BOM characters and refusing replacement decoding. */
export function decodeSourceText(bytes: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new SourceCaptureError("Source path or link target is not valid UTF-8"); }
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
