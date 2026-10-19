/** Typed Candidate access through the invocation's store or an explicit filesystem adapter. */
import { SlugSchema } from "../../../../kernel/schema/slug.js";
import type { Mutation } from "../../../write.js";
import { OwnerIdentitySchema, recordReferences, RecordVersionSchema } from "../../../identity.js";
import { readCandidateRecordVersioned as readFileCandidateRecordVersioned,
  readCandidateRecordVersion as readFileCandidateRecordVersion,
  writeCandidateRecord as writeFileCandidateRecord,
  type CandidateRecordStoreFs } from "../../../../work-unit/candidate-record-store.js";
import { parseCandidateManagedRecord, serializeCandidateManagedRecord } from "../../../../work-unit/candidate-attestation.js";
import { readReviewRecord, resolveReviewRecordAccess, unwrapReviewRecordResult, type ReviewRecordAccessOptions } from "../access-shared.js";
import { CandidateRecordVersionConflictError } from "../errors.js";
import { resolveCandidateRecordRelativePath } from "../paths.js";
import type { CandidateManagedRecordV1, VersionedCandidateRecord } from "./schema.js";

export { CandidateRecordVersionConflictError };
export type { CandidateRecordStoreFs };

/** Candidate access accepts the invocation's store, Git runner, or explicit file adapter. */
export type CandidateRecordAccessOptions = ReviewRecordAccessOptions<CandidateRecordStoreFs>;

/** Read a Candidate with the backend's opaque version. */
export async function readCandidateRecordVersioned(cwd: string, name: string,
  options?: CandidateRecordStoreFs | CandidateRecordAccessOptions): Promise<VersionedCandidateRecord> {
  const workUnit = SlugSchema.parse(name);
  const access = resolveReviewRecordAccess(cwd, options);
  if ("fs" in access) return readFileCandidateRecordVersioned(cwd, workUnit, access.fs);
  const stored = await readReviewRecord(access.store,
    recordReferences["review/candidate"](OwnerIdentitySchema.parse({ type: "work-item", name: workUnit })));
  if (stored === null) return { record: null, version: null };
  const path = resolveCandidateRecordRelativePath(workUnit);
  const record = parseCandidateManagedRecord(stored.content);
  if (record === null) throw new Error(`Candidate record is malformed: ${path}`);
  if (record.attestation.workUnit !== workUnit) throw new Error(`Candidate record work unit does not match its path: ${path}`);
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
  return (await readReviewRecord(access.store,
    recordReferences["review/candidate"](OwnerIdentitySchema.parse({ type: "work-item", name: workUnit }))))?.version ?? null;
}

/** Prepare one Candidate put for the caller's atomic batch. */
export function prepareCandidateRecordPut(name: string, record: CandidateManagedRecordV1,
  expectedVersion: string | null): Extract<Mutation, { action: "put" }> {
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: SlugSchema.parse(name) });
  return { action: "put", reference: recordReferences["review/candidate"](owner),
    expected: expectedVersion === null ? null : RecordVersionSchema.parse(expectedVersion),
    content: serializeCandidateManagedRecord(record) };
}

/** Version-check and persist one Candidate through the selected writer. */
export async function writeCandidateRecord(cwd: string, name: string, record: CandidateManagedRecordV1,
  expectedVersion: string | null, options?: CandidateRecordStoreFs | CandidateRecordAccessOptions): Promise<string> {
  const access = resolveReviewRecordAccess(cwd, options);
  if ("fs" in access) return writeFileCandidateRecord(cwd, name, record, expectedVersion, access.fs);
  const result = await access.store.write({ ...prepareCandidateRecordPut(name, record, expectedVersion),
    provenance: { verb: "write-candidate-record", lifecycleAction: "edit" } });
  if (result.status === "refused" && result.refusal.code === "version-conflict") throw new CandidateRecordVersionConflictError();
  unwrapReviewRecordResult(result);
  return resolveCandidateRecordRelativePath(name);
}
