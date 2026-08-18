/** Filesystem adapter for work-unit Candidate lineage records. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { atomicWriteFile } from "../fs.js";
import { SlugSchema } from "../kernel/schema/slug.js";
import {
  parseCandidateManagedRecord,
  serializeCandidateManagedRecord,
  type CandidateManagedRecordV1,
} from "./candidate-attestation.js";

export const CANDIDATE_RECORD_NAMESPACE = ".arc/system/.internal/candidates";

export interface CandidateRecordStoreFs {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
}

const nodeCandidateRecordStoreFs: CandidateRecordStoreFs = {
  readFile: (path) => readFile(path, "utf8"),
  writeFile: atomicWriteFile,
};

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
  const workUnit = SlugSchema.parse(name);
  const relativePath = resolveCandidateRecordRelativePath(workUnit);
  let content: string;
  try {
    content = await fs.readFile(join(cwd, relativePath));
  } catch (error) {
    if ((error as { code?: unknown }).code === "ENOENT") return null;
    throw error;
  }
  const record = parseCandidateManagedRecord(content);
  if (record === null) throw new Error(`Candidate record is malformed: ${relativePath}`);
  if (record.attestation.workUnit !== workUnit) {
    throw new Error(`Candidate record work unit does not match its path: ${relativePath}`);
  }
  return record;
}

/** Atomically replace one validated Candidate record. */
export async function writeCandidateRecord(
  cwd: string,
  name: string,
  record: CandidateManagedRecordV1,
  fs: CandidateRecordStoreFs = nodeCandidateRecordStoreFs,
): Promise<string> {
  const relativePath = resolveCandidateRecordRelativePath(name);
  await fs.writeFile(join(cwd, relativePath), serializeCandidateManagedRecord(record));
  return relativePath;
}
