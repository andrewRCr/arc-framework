/** Typed Candidate access through the invocation's store or an explicit filesystem adapter. */
import { SlugSchema } from "../../../../kernel/schema/slug.js";
import type { Mutation } from "../../../write.js";
import { OwnerIdentitySchema, recordReferences, RecordVersionSchema, type OwnerIdentity } from "../../../identity.js";
import { readCandidateRecordVersioned as readFileCandidateRecordVersioned,
  readCandidateRecordVersion as readFileCandidateRecordVersion,
  writeCandidateRecord as writeFileCandidateRecord,
  type CandidateRecordStoreFs } from "../../../../work-unit/candidate-record-store.js";
import { CandidateManagedRecordV1Schema, parseCandidateManagedRecord, serializeCandidateManagedRecord } from "../../../../work-unit/candidate-attestation.js";
import { decodeStoredReviewRecord, isInRepoKeyMismatch, readReviewRecord, resolveReviewRecordAccess, selectReviewRecordOwner, storedWorkUnitMismatch, unwrapReviewRecordResult,
  type ReviewRecordAccessOptions } from "../access-shared.js";
import { CandidateRecordVersionConflictError } from "../errors.js";
import { resolveCandidateRecordRelativePath } from "../paths.js";
import type { CandidateManagedRecordV1, VersionedCandidateRecord } from "./schema.js";

export { CandidateRecordVersionConflictError };
export type { CandidateRecordStoreFs };

/** Candidate access accepts the invocation's store, Git runner, or explicit file adapter. */
type CandidateRecordAccessOptions = ReviewRecordAccessOptions<CandidateRecordStoreFs>;

/** Read a Candidate with the backend's opaque version. */
export async function readCandidateRecordVersioned(cwd: string, name: string,
  options?: CandidateRecordStoreFs | CandidateRecordAccessOptions): Promise<VersionedCandidateRecord> {
  const workUnit = SlugSchema.parse(name);
  const access = resolveReviewRecordAccess(cwd, options);
  if ("fs" in access) return readFileCandidateRecordVersioned(cwd, workUnit, access.fs);
  const path = resolveCandidateRecordRelativePath(workUnit);
  const stored = await readReviewRecord(access.store,
    recordReferences["review/candidate"](selectReviewRecordOwner(access.store, workUnit, access.owner))).catch((error: unknown) => {
    if (isInRepoKeyMismatch(error)) throw new Error(`Candidate record work unit does not match its path: ${path}`);
    throw error;
  });
  if (stored === null) return { record: null, version: null };
  const record = access.store.capabilities.stateOffBranch
    ? decodeStoredReviewRecord(access.store, stored, content => CandidateManagedRecordV1Schema.parse(JSON.parse(content)))
    : parseCandidateManagedRecord(stored.content);
  if (record === null) throw new Error(`Candidate record is malformed: ${path}`);
  if (record.attestation.workUnit !== workUnit) {
    throw storedWorkUnitMismatch(access.store, "Candidate record", workUnit, record.attestation.workUnit,
      `Candidate record work unit does not match its path: ${path}`);
  }
  return { record, version: stored.version };
}

/** Read a validated Candidate, retaining established absence as null. */
export async function readCandidateRecord(cwd: string, name: string,
  options?: CandidateRecordStoreFs | CandidateRecordAccessOptions): Promise<CandidateManagedRecordV1 | null> {
  return (await readCandidateRecordVersioned(cwd, name, options)).record;
}

/** Read the backend version without requiring parseable Candidate content. */
export async function readCandidateRecordVersion(cwd: string, name: string,
  options?: CandidateRecordStoreFs | CandidateRecordAccessOptions): Promise<string | null> {
  const workUnit = SlugSchema.parse(name);
  const access = resolveReviewRecordAccess(cwd, options);
  if ("fs" in access) return readFileCandidateRecordVersion(cwd, workUnit, access.fs);
  try {
    return (await readReviewRecord(access.store,
      recordReferences["review/candidate"](selectReviewRecordOwner(access.store, workUnit, access.owner))))?.version ?? null;
  } catch (error) {
    // The version needs no parse, so an in-repo file keyed elsewhere still reports its bytes, as its file reader does.
    if (isInRepoKeyMismatch(error)) return readFileCandidateRecordVersion(cwd, workUnit);
    throw error;
  }
}

/** Prepare one Candidate put for the caller's atomic batch. */
export function prepareCandidateRecordPut(name: string, record: CandidateManagedRecordV1,
  expectedVersion: string | null, selectedOwner?: OwnerIdentity): Extract<Mutation, { action: "put" }> {
  const workUnit = SlugSchema.parse(name);
  const owner = selectedOwner ?? OwnerIdentitySchema.parse({ type: "work-item", name: workUnit });
  return { action: "put", reference: recordReferences["review/candidate"](owner),
    expected: expectedVersion === null ? null : RecordVersionSchema.parse(expectedVersion),
    content: serializeCandidateManagedRecord(record) };
}

/** Version-check and persist one Candidate, returning its tracked path, or null where no tracked file holds it. */
export async function writeCandidateRecord(cwd: string, name: string, record: CandidateManagedRecordV1,
  expectedVersion: string | null, options?: CandidateRecordStoreFs | CandidateRecordAccessOptions): Promise<string | null> {
  const access = resolveReviewRecordAccess(cwd, options);
  if ("fs" in access) return writeFileCandidateRecord(cwd, name, record, expectedVersion, access.fs);
  const owner = selectReviewRecordOwner(access.store, SlugSchema.parse(name), access.owner);
  const result = await access.store.write({ ...prepareCandidateRecordPut(name, record, expectedVersion, owner),
    provenance: { verb: "write-candidate-record", lifecycleAction: "edit" } });
  if (result.status === "refused" && result.refusal.code === "version-conflict") throw new CandidateRecordVersionConflictError();
  unwrapReviewRecordResult(access.store, result);
  return access.store.capabilities.stateOffBranch ? null : resolveCandidateRecordRelativePath(name);
}
