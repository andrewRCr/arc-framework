/** Typed integration-boundary access: version-one content in the repository, either version natively. */
import { canonicalize } from "../../../../kernel/canonical/canonical-json.js";
import type { Mutation } from "../../../write.js";
import { SlugSchema } from "../../../../kernel/schema/slug.js";
import { OwnerIdentitySchema, recordReferences, RecordVersionSchema, type OwnerIdentity } from "../../../identity.js";
import { readSubmissionBoundaryVersioned as readFileBoundaryVersioned,
  writeSubmissionBoundary as writeFileBoundary,
  type SubmissionBoundaryReader, type SubmissionBoundaryStoreFs } from "../../../../work-unit/submission-boundary-store.js";
import { parseIntegrationBoundaryLocus } from "../../../../../scripts/review-gate/policy/integration-boundary-locus.js";
import { decodeStoredReviewRecord, isInRepoKeyMismatch, readReviewRecord, requireReviewRecordOwner, requireReviewRecordOwnerName, resolveReviewRecordAccess, selectReviewRecordOwner, storedWorkUnitMismatch, unwrapReviewRecordResult,
  type ReviewRecordAccessOptions } from "../access-shared.js";
import { SubmissionBoundaryVersionConflictError } from "../errors.js";
import { resolveSubmissionBoundaryPath } from "../paths.js";
import { IntegrationBoundaryLocusV2Schema, type ReviewIntegrationBoundary, type VersionedSubmissionBoundary } from "./schema.js";

export { SubmissionBoundaryVersionConflictError };

/** Boundary reads accept a minimal file reader or the invocation's store and Git runner. */
export type SubmissionBoundaryReadOptions = ReviewRecordAccessOptions<SubmissionBoundaryReader>;
/** Boundary writes accept a locking file adapter or the invocation's store and Git runner. */
type SubmissionBoundaryWriteOptions = ReviewRecordAccessOptions<SubmissionBoundaryStoreFs>;

/** Read a boundary paired with its exact backend version. */
export async function readSubmissionBoundaryVersioned(cwd: string, name: string,
  input?: SubmissionBoundaryReader | SubmissionBoundaryReadOptions): Promise<VersionedSubmissionBoundary> {
  const workUnit = SlugSchema.parse(name);
  const access = resolveReviewRecordAccess(cwd, input);
  if ("fs" in access) return readFileBoundaryVersioned(cwd, workUnit, access.fs);
  const stored = await readReviewRecord(access.store,
    recordReferences["review/integration-boundary"](selectReviewRecordOwner(access.store, workUnit, access.owner))).catch((error: unknown) => {
    if (isInRepoKeyMismatch(error)) throw new Error("Submission boundary work unit does not match its path");
    throw error;
  });
  if (stored === null) return { boundary: null, version: null };
  const boundary = decodeStoredReviewRecord(access.store, stored, raw => {
    const content: unknown = JSON.parse(raw);
    const native = access.store.capabilities.stateOffBranch && content !== null && typeof content === "object"
      && "schemaVersion" in content && content.schemaVersion === 2;
    return native ? IntegrationBoundaryLocusV2Schema.parse(content) : parseIntegrationBoundaryLocus(content);
  });
  if (boundary.workUnit !== workUnit) {
    throw storedWorkUnitMismatch(access.store, "submission boundary", workUnit, boundary.workUnit,
      "Submission boundary work unit does not match its path");
  }
  return { boundary, version: stored.version };
}

/** Read a validated boundary, retaining established absence as null. */
export async function readSubmissionBoundary(cwd: string, name: string,
  input?: SubmissionBoundaryReader | SubmissionBoundaryReadOptions): Promise<ReviewIntegrationBoundary | null> {
  return (await readSubmissionBoundaryVersioned(cwd, name, input)).boundary;
}

/** Prepare one integration-boundary put for the caller's atomic batch. */
export function prepareSubmissionBoundaryPut(boundary: ReviewIntegrationBoundary,
  expectedVersion: string | null, selectedOwner?: OwnerIdentity): Extract<Mutation, { action: "put" }> {
  const value = boundary.schemaVersion === 1 ? parseIntegrationBoundaryLocus(boundary) : IntegrationBoundaryLocusV2Schema.parse(boundary);
  requireReviewRecordOwnerName(selectedOwner, value.workUnit);
  const owner = selectedOwner ?? OwnerIdentitySchema.parse({ type: "work-item", name: value.workUnit });
  return { action: "put", reference: recordReferences["review/integration-boundary"](owner),
    expected: expectedVersion === null ? null : RecordVersionSchema.parse(expectedVersion), content: canonicalize(value) };
}

/** Version-check and persist one integration boundary, returning its tracked path, or null where no tracked file holds it. */
export async function writeSubmissionBoundary(cwd: string, boundary: ReviewIntegrationBoundary, expectedVersion: string | null,
  input?: SubmissionBoundaryStoreFs | SubmissionBoundaryWriteOptions): Promise<string | null> {
  const access = resolveReviewRecordAccess(cwd, input);
  if ("fs" in access) return writeFileBoundary(cwd, parseIntegrationBoundaryLocus(boundary), expectedVersion, access.fs);
  const value = access.store.capabilities.stateOffBranch ? boundary : parseIntegrationBoundaryLocus(boundary);
  const owner = await requireReviewRecordOwner(access.store,
    selectReviewRecordOwner(access.store, SlugSchema.parse(boundary.workUnit), access.owner), boundary.workUnit);
  const result = await access.store.write({ ...prepareSubmissionBoundaryPut(value, expectedVersion, owner),
    provenance: { verb: "write-submission-boundary", lifecycleAction: "edit" } });
  if (result.status === "refused" && result.refusal.code === "version-conflict") throw new SubmissionBoundaryVersionConflictError();
  unwrapReviewRecordResult(access.store, result);
  return access.store.capabilities.stateOffBranch ? null : resolveSubmissionBoundaryPath(boundary.workUnit);
}
