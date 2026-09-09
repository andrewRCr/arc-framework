/** Filesystem adapter for work-unit Candidate lineage records. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { digestBytes } from "../canonical/canonical-json.js";
import { atomicWriteFile } from "../fs.js";
import { SlugSchema } from "../kernel/schema/slug.js";
import { acquireAdvisoryLock, releaseAdvisoryLock } from "../advisory-lock.js";
import {
  parseCandidateManagedRecord,
  serializeCandidateManagedRecord,
  type CandidateManagedRecordV1,
} from "./candidate-attestation.js";

export const CANDIDATE_RECORD_NAMESPACE = ".arc/system/.internal/candidates";

export interface CandidateRecordStoreFs {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  withLock<T>(path: string, action: () => Promise<T>): Promise<T>;
}

const nodeCandidateRecordStoreFs: CandidateRecordStoreFs = {
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

export interface VersionedCandidateRecord {
  record: CandidateManagedRecordV1 | null;
  version: string | null;
}

export class CandidateRecordVersionConflictError extends Error {
  constructor() {
    super("Candidate record changed after it was read");
    this.name = "CandidateRecordVersionConflictError";
  }
}

/** Resolve a Candidate record's repository-relative path. */
export function resolveCandidateRecordRelativePath(name: string): string {
  return `${CANDIDATE_RECORD_NAMESPACE}/${SlugSchema.parse(name)}.json`;
}

/** Read and validate one Candidate record, or return null when absent. */
export async function readCandidateRecord(
  cwd: string,
  name: string,
  fs: CandidateRecordStoreFs = nodeCandidateRecordStoreFs,
): Promise<CandidateManagedRecordV1 | null> {
  return (await readCandidateRecordVersioned(cwd, name, fs)).record;
}

/** Read one Candidate record together with the exact bytes-version a later write must carry. */
export async function readCandidateRecordVersioned(
  cwd: string,
  name: string,
  fs: CandidateRecordStoreFs = nodeCandidateRecordStoreFs,
): Promise<VersionedCandidateRecord> {
  const workUnit = SlugSchema.parse(name);
  const relativePath = resolveCandidateRecordRelativePath(workUnit);
  let content: string;
  try {
    content = await fs.readFile(join(cwd, relativePath));
  } catch (error) {
    if ((error as { code?: unknown }).code === "ENOENT") return { record: null, version: null };
    throw error;
  }
  const record = parseCandidateManagedRecord(content);
  if (record === null) throw new Error(`Candidate record is malformed: ${relativePath}`);
  if (record.attestation.workUnit !== workUnit) {
    throw new Error(`Candidate record work unit does not match its path: ${relativePath}`);
  }
  return { record, version: digestBytes(Buffer.from(content, "utf8")) };
}

/** Version-check and atomically replace one validated Candidate record. */
export async function writeCandidateRecord(
  cwd: string,
  name: string,
  record: CandidateManagedRecordV1,
  expectedVersion: string | null,
  fs: CandidateRecordStoreFs = nodeCandidateRecordStoreFs,
): Promise<string> {
  const relativePath = resolveCandidateRecordRelativePath(name);
  const absolutePath = join(cwd, relativePath);
  await fs.withLock(`${absolutePath}.lock`, async () => {
    const current = await readCandidateRecordVersioned(cwd, name, fs);
    if (current.version !== expectedVersion) throw new CandidateRecordVersionConflictError();
    await fs.writeFile(absolutePath, serializeCandidateManagedRecord(record));
  });
  return relativePath;
}
