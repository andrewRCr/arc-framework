/** The index file in a checkout's projection state folder, written whole by temp-and-rename. */
import { join } from "node:path";
import { atomicWriteFile } from "../../fs.js";
import { encodeProjectionIndex, type ProjectionIndex } from "./index-schema.js";
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
