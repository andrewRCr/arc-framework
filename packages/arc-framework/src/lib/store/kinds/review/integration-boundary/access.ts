/** Typed integration-boundary access with the current repository content contract. */
import { canonicalize } from "../../../../kernel/canonical/canonical-json.js";
import type { Mutation } from "../../../write.js";
import { SlugSchema } from "../../../../kernel/schema/slug.js";
import { OwnerIdentitySchema, recordReferences, RecordVersionSchema } from "../../../identity.js";
import { readSubmissionBoundaryVersioned as readFileBoundaryVersioned,
  writeSubmissionBoundary as writeFileBoundary,
  type SubmissionBoundaryReader, type SubmissionBoundaryStoreFs } from "../../../../work-unit/submission-boundary-store.js";
import { parseIntegrationBoundaryLocus } from "../../../../../scripts/review-gate/policy/integration-boundary-locus.js";
import { readReviewRecord, resolveReviewRecordAccess, unwrapReviewRecordResult, type ReviewRecordAccessOptions } from "../access-shared.js";
import { SubmissionBoundaryVersionConflictError } from "../errors.js";
import { resolveSubmissionBoundaryPath } from "../paths.js";
import type { IntegrationBoundaryLocus, VersionedSubmissionBoundary } from "./schema.js";

export { SubmissionBoundaryVersionConflictError };
export type { SubmissionBoundaryReader, SubmissionBoundaryStoreFs };

/** Boundary reads accept a minimal file reader or the invocation's store and Git runner. */
export type SubmissionBoundaryReadOptions = ReviewRecordAccessOptions<SubmissionBoundaryReader>;
/** Boundary writes accept a locking file adapter or the invocation's store and Git runner. */
export type SubmissionBoundaryWriteOptions = ReviewRecordAccessOptions<SubmissionBoundaryStoreFs>;

/** Read a boundary paired with its exact backend version. */
export async function readSubmissionBoundaryVersioned(cwd: string, name: string,
  input?: SubmissionBoundaryReader | SubmissionBoundaryReadOptions): Promise<VersionedSubmissionBoundary<IntegrationBoundaryLocus>> {
  const workUnit = SlugSchema.parse(name);
  const access = resolveReviewRecordAccess(cwd, input);
  if ("fs" in access) return readFileBoundaryVersioned(cwd, workUnit, access.fs);
  const stored = await readReviewRecord(access.store,
    recordReferences["review/integration-boundary"](OwnerIdentitySchema.parse({ type: "work-item", name: workUnit })));
  if (stored === null) return { boundary: null, version: null };
  const boundary = parseIntegrationBoundaryLocus(JSON.parse(stored.content) as unknown);
  if (boundary.workUnit !== workUnit) throw new Error("Submission boundary work unit does not match its path");
  return { boundary, version: stored.version };
}

/** Read a validated boundary, retaining established absence as null. */
export async function readSubmissionBoundary(cwd: string, name: string,
  input?: SubmissionBoundaryReader | SubmissionBoundaryReadOptions): Promise<IntegrationBoundaryLocus | null> {
  return (await readSubmissionBoundaryVersioned(cwd, name, input)).boundary;
}

/** Prepare one integration-boundary put for the caller's atomic batch. */
export function prepareSubmissionBoundaryPut(boundary: IntegrationBoundaryLocus,
  expectedVersion: string | null): Extract<Mutation, { action: "put" }> {
  const value = parseIntegrationBoundaryLocus(boundary);
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: value.workUnit });
  return { action: "put", reference: recordReferences["review/integration-boundary"](owner),
    expected: expectedVersion === null ? null : RecordVersionSchema.parse(expectedVersion), content: canonicalize(value) };
}

/** Version-check and persist one integration boundary. */
export async function writeSubmissionBoundary(cwd: string, boundary: IntegrationBoundaryLocus, expectedVersion: string | null,
  input?: SubmissionBoundaryStoreFs | SubmissionBoundaryWriteOptions): Promise<string> {
  const access = resolveReviewRecordAccess(cwd, input);
  if ("fs" in access) return writeFileBoundary(cwd, boundary, expectedVersion, access.fs);
  const result = await access.store.write({ ...prepareSubmissionBoundaryPut(boundary, expectedVersion),
    provenance: { verb: "write-submission-boundary", lifecycleAction: "edit" } });
  if (result.status === "refused" && result.refusal.code === "version-conflict") throw new SubmissionBoundaryVersionConflictError();
  unwrapReviewRecordResult(result);
  return resolveSubmissionBoundaryPath(boundary.workUnit);
}
