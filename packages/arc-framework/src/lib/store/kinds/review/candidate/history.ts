/** Candidate supersession and revision reads over the repository's plain path log. */
import type { GitExec } from "../../../../git/exec.js";
import { parseCandidateManagedRecord, resolveCandidateSupersessionAncestors, CandidateSupersessionResolutionError,
  type CandidateSupersessionAncestor } from "../../../../work-unit/candidate-attestation.js";
import { resolveCandidateRecordRelativePath } from "../paths.js";
import type { CandidateManagedRecordV1 } from "./schema.js";

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
    const record = await readLinkedHistoricalCandidate(input, revision, path, expectedId);
    if (record === null) continue;
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

async function readLinkedHistoricalCandidate(input: { cwd: string; workUnit: string; exec: GitExec },
  revision: string, path: string, expectedId: string): Promise<CandidateManagedRecordV1 | null> {
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
    if (claimedCandidateId(content) !== expectedId) return null;
    throw new CandidateSupersessionResolutionError(
      `Superseded Candidate record at ${revision} is malformed. Repair the record history and retry pre-publication review.`,
    );
  }
  if (record.attestation.candidateId !== expectedId) return null;
  if (record.attestation.workUnit !== input.workUnit) {
    throw new CandidateSupersessionResolutionError(
      `Superseded Candidate at ${revision} belongs to another work unit. Repair the record history and retry pre-publication review.`,
    );
  }
  return record;
}
function claimedCandidateId(content: string): unknown {
  try { return (JSON.parse(content) as { attestation?: { candidateId?: unknown } }).attestation?.candidateId; }
  catch { return undefined; }
}
