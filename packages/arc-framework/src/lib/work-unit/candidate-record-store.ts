/** Filesystem adapter for work-unit Candidate lineage records. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { digestBytes, type CanonicalDigest } from "../kernel/canonical/canonical-json.js";
import { atomicWriteFile } from "../fs.js";
import { SlugSchema } from "../kernel/schema/slug.js";
import type { GitExec } from "../git/index.js";
import { withAdvisoryLock } from "../advisory-lock.js";
import {
  parseCandidateManagedRecord,
  resolveCandidateSupersessionAncestors,
  CandidateSupersessionResolutionError,
  serializeCandidateManagedRecord,
  type CandidateSupersessionAncestor,
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
  withLock: (path, action) => withAdvisoryLock(path, action),
};

export interface VersionedCandidateRecord {
  record: CandidateManagedRecordV1 | null;
  version: CanonicalDigest | null;
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

/** Read older Candidate records from reachable Git history and validate every explicit supersession link. */
export async function readRepositoryCandidateSupersessionChain(input: {
  cwd: string;
  workUnit: string;
  record: CandidateManagedRecordV1;
  exec: GitExec;
}): Promise<readonly CandidateSupersessionAncestor[]> {
  if (input.record.attestation.supersedes === undefined) return [];
  const path = resolveCandidateRecordRelativePath(input.workUnit);
  let revisions: readonly string[];
  try {
    const result = await input.exec("git", ["log", "--format=%H", "--", path], {
      cwd: input.cwd, objectAccess: "local-only",
    });
    revisions = result.stdout.split(/\r?\n/u).filter((revision) => revision !== "");
  } catch (error) {
    throw new CandidateSupersessionResolutionError(
      `Candidate record history cannot be read (${error instanceof Error ? error.message : String(error)}). Restore Git history and retry pre-publication review.`,
    );
  }
  const historical: CandidateManagedRecordV1[] = [];
  const recordRevisions: string[] = [];
  let expectedId: string | undefined = input.record.attestation.supersedes;
  for (const revision of revisions) {
    if (expectedId === undefined) break;
    let content: string;
    try {
      content = (await input.exec("git", ["show", `${revision}:${path}`], {
        cwd: input.cwd, objectAccess: "local-only",
      })).stdout;
    } catch (error) {
      throw new CandidateSupersessionResolutionError(
        `Candidate record at ${revision} cannot be read (${error instanceof Error ? error.message : String(error)}). Restore Git history and retry pre-publication review.`,
      );
    }
    const record = parseCandidateManagedRecord(content);
    if (record === null) {
      let claimedId: unknown;
      try {
        claimedId = (JSON.parse(content) as { attestation?: { candidateId?: unknown } })
          .attestation?.candidateId;
      } catch { /* An unrelated historical record cannot claim the expected Candidate. */ }
      if (claimedId !== expectedId) continue;
      throw new CandidateSupersessionResolutionError(
        `Superseded Candidate record at ${revision} is malformed. Repair the record history and retry pre-publication review.`,
      );
    }
    if (record.attestation.candidateId !== expectedId) continue;
    if (record.attestation.workUnit !== input.workUnit) {
      throw new CandidateSupersessionResolutionError(
        `Superseded Candidate at ${revision} belongs to another work unit. Repair the record history and retry pre-publication review.`,
      );
    }
    historical.push(record);
    recordRevisions.push(revision);
    expectedId = record.attestation.supersedes;
  }
  return resolveCandidateSupersessionAncestors(input.record, historical).map((ancestor, index) => {
    const recordRevision = recordRevisions[index];
    if (recordRevision === undefined) {
      throw new CandidateSupersessionResolutionError("Superseded Candidate record revision is unavailable.");
    }
    return { ...ancestor, recordRevision };
  });
}

/** Locate the named Candidate record in history reachable from the live review head. */
export async function readRepositoryCandidateRecordRevision(input: {
  cwd: string;
  workUnit: string;
  candidateId: string;
  reviewHeadSha: string;
  exec: GitExec;
}): Promise<string> {
  const path = resolveCandidateRecordRelativePath(input.workUnit);
  let history: Awaited<ReturnType<GitExec>>;
  try {
    history = await input.exec("git", ["log", input.reviewHeadSha, "--format=%H", "--", path], {
      cwd: input.cwd, objectAccess: "local-only",
    });
  } catch (error) {
    throw new CandidateSupersessionResolutionError(
      `Candidate record history at review head ${input.reviewHeadSha} cannot be read `
        + `(${error instanceof Error ? error.message : String(error)}). Restore the review head and retry re-root.`,
    );
  }
  for (const revision of history.stdout.split(/\r?\n/u).filter((value) => value !== "")) {
    let raw: Awaited<ReturnType<GitExec>>;
    try {
      raw = await input.exec("git", ["show", `${revision}:${path}`], {
        cwd: input.cwd, objectAccess: "local-only",
      });
    } catch (error) {
      throw new CandidateSupersessionResolutionError(
        `Candidate record at ${revision} cannot be read `
          + `(${error instanceof Error ? error.message : String(error)}). Restore the record and retry re-root.`,
      );
    }
    const record = parseCandidateManagedRecord(raw.stdout);
    if (record === null) {
      throw new CandidateSupersessionResolutionError(
        `Candidate record at ${revision} is malformed. Restore the record and retry re-root.`,
      );
    }
    if (record.attestation.candidateId === input.candidateId
      && record.attestation.workUnit === input.workUnit) return revision;
  }
  throw new CandidateSupersessionResolutionError(
    `Candidate ${input.candidateId} has no committed record at review head ${input.reviewHeadSha} for review recovery. `
      + "Restore its managed record at that head before retrying re-root.",
  );
}

/** Read one Candidate record together with the exact bytes-version a later write must carry. */
export async function readCandidateRecordVersioned(
  cwd: string,
  name: string,
  fs: CandidateRecordStoreFs = nodeCandidateRecordStoreFs,
): Promise<VersionedCandidateRecord> {
  const workUnit = SlugSchema.parse(name);
  const relativePath = resolveCandidateRecordRelativePath(workUnit);
  const content = await readCandidateRecordContent(cwd, relativePath, fs);
  if (content === null) return { record: null, version: null };
  const record = parseCandidateManagedRecord(content);
  if (record === null) throw new Error(`Candidate record is malformed: ${relativePath}`);
  if (record.attestation.workUnit !== workUnit) {
    throw new Error(`Candidate record work unit does not match its path: ${relativePath}`);
  }
  return { record, version: digestBytes(Buffer.from(content, "utf8")) };
}

/** Read only the exact bytes-version of one Candidate record, without parsing its contents. */
export async function readCandidateRecordVersion(
  cwd: string,
  name: string,
  fs: CandidateRecordStoreFs = nodeCandidateRecordStoreFs,
): Promise<CanonicalDigest | null> {
  const relativePath = resolveCandidateRecordRelativePath(name);
  const content = await readCandidateRecordContent(cwd, relativePath, fs);
  return content === null ? null : digestBytes(Buffer.from(content, "utf8"));
}

async function readCandidateRecordContent(
  cwd: string,
  relativePath: string,
  fs: CandidateRecordStoreFs,
): Promise<string | null> {
  try {
    return await fs.readFile(join(cwd, relativePath));
  } catch (error) {
    if ((error as { code?: unknown }).code === "ENOENT") return null;
    throw error;
  }
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
