/** Filesystem adapter for the durable Candidate publication-resume boundary. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { canonicalize } from "../canonical/canonical-json.js";
import { atomicWriteFile } from "../fs.js";
import { SlugSchema } from "../kernel/schema/slug.js";
import {
  IntegrationBoundaryLocusSchema,
  type IntegrationBoundaryLocus,
} from "../../scripts/review-gate/policy/integration-boundary-locus.js";

export interface SubmissionBoundaryStoreFs {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
}

const nodeFs: SubmissionBoundaryStoreFs = {
  readFile: (path) => readFile(path, "utf8"),
  writeFile: atomicWriteFile,
};

/** Resolve the repository-relative durable boundary path for one work unit. */
export function resolveSubmissionBoundaryPath(name: string): string {
  return `.arc/system/.internal/candidates/${SlugSchema.parse(name)}.boundary.json`;
}

/** Read one durable integration boundary, or null when none has been recorded. */
export async function readSubmissionBoundary(
  cwd: string,
  name: string,
  fs: SubmissionBoundaryStoreFs = nodeFs,
): Promise<IntegrationBoundaryLocus | null> {
  try {
    const value = JSON.parse(await fs.readFile(join(cwd, resolveSubmissionBoundaryPath(name)))) as unknown;
    return IntegrationBoundaryLocusSchema.parse(value);
  } catch (error) {
    if ((error as { code?: unknown }).code === "ENOENT") return null;
    throw error;
  }
}

/** Atomically replace one validated durable integration boundary. */
export async function writeSubmissionBoundary(
  cwd: string,
  boundary: IntegrationBoundaryLocus,
  fs: SubmissionBoundaryStoreFs = nodeFs,
): Promise<string> {
  const value = IntegrationBoundaryLocusSchema.parse(boundary);
  const path = resolveSubmissionBoundaryPath(value.workUnit);
  await fs.writeFile(join(cwd, path), canonicalize(value));
  return path;
}
