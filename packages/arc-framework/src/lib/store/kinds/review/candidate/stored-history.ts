/** Exact Candidate generations and supersession links from operational record history. */
import type { Store, HistoryEntry } from "../../../contract.js";
import { recordReferences, type OwnerIdentity } from "../../../identity.js";
import { selectReviewRecordOwner, unwrapReviewRecordResult } from "../access-shared.js";
import { parseCandidateManagedRecord, resolveCandidateSupersessionAncestors, CandidateSupersessionResolutionError,
  type CandidateSupersessionAncestor, type CandidateManagedRecordV1 } from "../../../../work-unit/candidate-attestation.js";

interface StoredHistoryInput { store: Store; workUnit: string; workItem?: OwnerIdentity }

async function history(input: StoredHistoryInput): Promise<HistoryEntry[]> {
  const owner = selectReviewRecordOwner(input.store, input.workUnit, input.workItem);
  return unwrapReviewRecordResult(await input.store.history({ reference: recordReferences["review/candidate"](owner) }));
}

function historicalCandidate(entry: HistoryEntry, workUnit: string): { record: CandidateManagedRecordV1; version: string } | null {
  if (entry.content === null || entry.version === null) return null;
  const record = parseCandidateManagedRecord(entry.content);
  if (record === null || record.attestation.workUnit !== workUnit) {
    throw new CandidateSupersessionResolutionError(`Candidate record at store version ${entry.version} is malformed or belongs to another work unit. `
      + "Repair its record history and retry review.");
  }
  return { record, version: entry.version };
}

/** Walk strictly older Candidate identities while retaining each matching record's opaque version. */
export async function readStoredCandidateSupersessionChain(input: StoredHistoryInput & {
  record: CandidateManagedRecordV1;
}): Promise<readonly CandidateSupersessionAncestor[]> {
  let expected = input.record.attestation.supersedes;
  const records: CandidateManagedRecordV1[] = [];
  const versions: string[] = [];
  for (const entry of await history(input)) {
    if (expected === undefined) break;
    const value = historicalCandidate(entry, input.workUnit);
    if (value === null || value.record.attestation.candidateId !== expected) continue;
    records.push(value.record);
    versions.push(value.version);
    expected = value.record.attestation.supersedes;
  }
  return resolveCandidateSupersessionAncestors(input.record, records).map((ancestor, index) => {
    const recordRevision = versions[index];
    if (recordRevision === undefined) throw new CandidateSupersessionResolutionError("Superseded Candidate record version is unavailable.");
    return { ...ancestor, recordRevision };
  });
}

/** Locate the latest exact stored version carrying the named Candidate identity. */
export async function readStoredCandidateRecordRevision(input: StoredHistoryInput & { candidateId: string }): Promise<string> {
  for (const entry of await history(input)) {
    const value = historicalCandidate(entry, input.workUnit);
    if (value?.record.attestation.candidateId === input.candidateId) return value.version;
  }
  throw new CandidateSupersessionResolutionError(`Candidate ${input.candidateId} has no stored record version. `
    + "Restore its managed record history before retrying re-root.");
}
