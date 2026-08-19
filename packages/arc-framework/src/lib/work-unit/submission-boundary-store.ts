/** Filesystem adapter for the durable Candidate publication-resume boundary. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { canonicalize, digestBytes } from "../canonical/canonical-json.js";
import { atomicWriteFile } from "../fs.js";
import { SlugSchema } from "../kernel/schema/slug.js";
import { acquireAdvisoryLock, releaseAdvisoryLock } from "../user-sync/notes-lock.js";
import {
  IntegrationBoundaryLocusSchema,
  type IntegrationBoundaryLocus,
} from "../../scripts/review-gate/policy/integration-boundary-locus.js";

export interface SubmissionBoundaryReader {
  readFile(path: string): Promise<string>;
}

export interface SubmissionBoundaryStoreFs extends SubmissionBoundaryReader {
  writeFile(path: string, content: string): Promise<void>;
  withLock<T>(path: string, action: () => Promise<T>): Promise<T>;
}

const nodeFs: SubmissionBoundaryStoreFs = {
  readFile: (path) => readFile(path, "utf8"),
  writeFile: atomicWriteFile,
  withLock: async (path, action) => {
    const handle = await acquireAdvisoryLock(path);
    try {
      return await action();
    } finally {
      await releaseAdvisoryLock(handle);
    }
  },
};

export interface VersionedSubmissionBoundary {
  boundary: IntegrationBoundaryLocus | null;
  version: string | null;
}

export class SubmissionBoundaryVersionConflictError extends Error {
  constructor() {
    super("Submission boundary changed after it was read");
    this.name = "SubmissionBoundaryVersionConflictError";
  }
}

/** Resolve the repository-relative durable boundary path for one work unit. */
export function resolveSubmissionBoundaryPath(name: string): string {
  return `.arc/system/.internal/candidates/${SlugSchema.parse(name)}.boundary.json`;
}

/** Read one durable integration boundary, or null when none has been recorded. */
export async function readSubmissionBoundary(
  cwd: string,
  name: string,
  fs: SubmissionBoundaryReader = nodeFs,
): Promise<IntegrationBoundaryLocus | null> {
  return (await readSubmissionBoundaryVersioned(cwd, name, fs)).boundary;
}

/** Read one boundary together with the exact bytes-version a later write must carry. */
export async function readSubmissionBoundaryVersioned(
  cwd: string,
  name: string,
  fs: SubmissionBoundaryReader = nodeFs,
): Promise<VersionedSubmissionBoundary> {
  const workUnit = SlugSchema.parse(name);
  try {
    const content = await fs.readFile(join(cwd, resolveSubmissionBoundaryPath(workUnit)));
    const value = JSON.parse(content) as unknown;
    const boundary = IntegrationBoundaryLocusSchema.parse(value);
    if (boundary.workUnit !== workUnit) {
      throw new Error("Submission boundary work unit does not match its path");
    }
    return { boundary, version: digestBytes(Buffer.from(content, "utf8")) };
  } catch (error) {
    if ((error as { code?: unknown }).code === "ENOENT") return { boundary: null, version: null };
    throw error;
  }
}

/** Version-check and atomically replace one validated durable integration boundary. */
export async function writeSubmissionBoundary(
  cwd: string,
  boundary: IntegrationBoundaryLocus,
  expectedVersion: string | null,
  fs: SubmissionBoundaryStoreFs = nodeFs,
): Promise<string> {
  const value = IntegrationBoundaryLocusSchema.parse(boundary);
  const path = resolveSubmissionBoundaryPath(value.workUnit);
  const absolutePath = join(cwd, path);
  await fs.withLock(`${absolutePath}.lock`, async () => {
    const current = await readSubmissionBoundaryVersioned(cwd, value.workUnit, fs);
    if (current.version !== expectedVersion) throw new SubmissionBoundaryVersionConflictError();
    await fs.writeFile(absolutePath, canonicalize(value));
  });
  return path;
}
