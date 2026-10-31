/** The index file in a checkout's projection state folder: written whole by temp-and-rename, read with its cause. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteFile } from "../../fs.js";
import {
  decodeProjectionIndex, encodeProjectionIndex, PROJECTION_INDEX_FORMAT, type ProjectionIndex,
} from "./index-schema.js";
import { readReference, smudgeRacyEntries, writeReference, type RecordedAfresh } from "./change-detection.js";
import type { ProjectionLocation } from "./location.js";

/** The index's file name in the state folder. */
export const PROJECTION_INDEX_FILE = "index";

/**
 * Write the index whole, never creating the folder it lives in.
 * @param location - The located checkout, its state folder already created.
 * @param index - The index to write.
 */
export async function writeProjectionIndex(location: ProjectionLocation, index: ProjectionIndex): Promise<void> {
  const path = join(location.stateDir, PROJECTION_INDEX_FILE);
  await atomicWriteFile(path, encodeProjectionIndex(index), { createParents: false });
}

/**
 * Write the index after smudging what is racy against the reference it replaces, then rewrite the reference.
 * @param input - The located checkout and its root, the index, and what this write records afresh.
 * @returns The index as written.
 */
export async function commitProjectionIndex(input: {
  location: ProjectionLocation; checkout: string; index: ProjectionIndex; recorded: RecordedAfresh;
}): Promise<ProjectionIndex> {
  const written = smudgeRacyEntries(input.index, await readReference(input.checkout), input.recorded);
  await writeProjectionIndex(input.location, written);
  await writeReference(input.checkout);
  return written;
}

/** Why an index a checkout should hold cannot be used. */
export type UnusableIndexCause = "missing" | "unreadable" | "other-format";

/** What reading a checkout's index found; each caller applies its own policy to the last two. */
export type ProjectionIndexRead =
  | { readonly kind: "index"; readonly index: ProjectionIndex }
  | { readonly kind: "no-projection" }
  | { readonly kind: "unusable"; readonly cause: UnusableIndexCause };

/**
 * Read a checkout's index.
 * @param location - The located checkout.
 * @param holdsProjection - Whether the checkout holds a projection, so a missing index is unusable, not absent.
 * @returns The index, no projection, or why it cannot be used.
 */
export async function readProjectionIndex(
  location: ProjectionLocation, holdsProjection: boolean,
): Promise<ProjectionIndexRead> {
  let text: string;
  try {
    text = await readFile(join(location.stateDir, PROJECTION_INDEX_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return holdsProjection ? { kind: "unusable", cause: "missing" } : { kind: "no-projection" };
    }
    return { kind: "unusable", cause: "unreadable" };
  }
  return decodeIndexText(text);
}

function decodeIndexText(text: string): ProjectionIndexRead {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { kind: "unusable", cause: "unreadable" };
  }
  // Another build's format is told apart before the strict parse, which would read it only as unreadable.
  const format = typeof json === "object" && json !== null ? (json as { format?: unknown }).format : undefined;
  if (typeof format === "number" && format !== PROJECTION_INDEX_FORMAT) {
    return { kind: "unusable", cause: "other-format" };
  }
  const decoded = decodeProjectionIndex(json);
  return decoded.success ? { kind: "index", index: decoded.data } : { kind: "unusable", cause: "unreadable" };
}
