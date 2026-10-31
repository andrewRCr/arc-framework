/** Git blob ids the projection computes itself, over content as the store holds it. */
import { createHash } from "node:crypto";
import { parseStampedFile } from "./stamp.js";

/** A repository's object format, as `extensions.objectformat` names it. */
export type ObjectFormat = "sha1" | "sha256";

/**
 * Hash bytes as Git hashes a blob: `blob <length>\0` followed by the bytes.
 * @param content - The blob's content; text is hashed as UTF-8.
 * @param format - The repository's object format.
 * @returns The blob id in hex.
 */
export function gitBlobId(content: string | Uint8Array, format: ObjectFormat): string {
  const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  return createHash(format).update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
}

/**
 * The blob id of a file's content as the store holds it: LF line endings, and for Markdown, its base stamp and notice
 * lines stripped. A file of another kind carries no stamp, so nothing in it strips.
 * @param text - The file's text.
 * @param input - The repository's object format, and whether the file is Markdown.
 * @returns The stored content's blob id.
 */
export function storedBlobId(text: string, input: { format: ObjectFormat; markdown: boolean }): string {
  const stored = input.markdown ? parseStampedFile(text).content : text.replaceAll("\r\n", "\n");
  return gitBlobId(stored, input.format);
}
