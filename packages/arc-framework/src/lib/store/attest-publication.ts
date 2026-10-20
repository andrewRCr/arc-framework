/** Expected-version publication of one native Candidate, boundary, and metadata orientation. */
import type { AttestContext } from "../work-unit/verbs/attest.js";
import type { PublishedIntegrationBoundaryLocus } from "../../scripts/review-gate/policy/integration-boundary-locus.js";
import type { Store } from "./contract.js";
import type { StoreRecord } from "./read.js";
import type { StoreResult } from "./refusal.js";
import { readLifecycleMetaFields, recordPut, workUnitMetaPath, batchLifecycleWrites } from "./lifecycle-write.js";
import { writeMetaCurrentWorkflow, writeMetaNextAction } from "./kinds/meta/writers.js";
import { prepareCandidateRecordPut } from "./kinds/review/candidate/access.js";
import { prepareSubmissionBoundaryPut } from "./kinds/review/integration-boundary/access.js";
import { resolveCandidateRecordRelativePath } from "./kinds/review/paths.js";

type Publication = Parameters<AttestContext["publish"]>[0];
type PublishedAttestation = Awaited<ReturnType<AttestContext["publish"]>>;
/** Exact record bases and the caller's selected publication continuation. */
export interface StoredAttestationInput {
  store: Store;
  primary: StoreRecord;
  publication: Publication;
  boundary: PublishedIntegrationBoundaryLocus;
  expectedBoundaryVersion: string | null;
  boundaryMatches: boolean;
  nextAction: string;
}
/** Persist a native attestation while retaining every metadata field outside its orientation. */
export async function writeStoredAttestation(input: StoredAttestationInput): Promise<StoreResult<PublishedAttestation>> {
  const { store, primary, publication, boundary } = input;
  const fields = readLifecycleMetaFields(primary);
  if (fields.status === "refused") return fields;
  let content = primary.content;
  if (!publication.repairCurrent || fields.result.currentWorkflow !== publication.currentWorkflow) {
    content = writeMetaCurrentWorkflow(content, publication.currentWorkflow);
  }
  if (!publication.repairCurrent || !input.boundaryMatches || fields.result.nextAction === null) {
    content = writeMetaNextAction(content, input.nextAction);
  }
  const writes = [prepareCandidateRecordPut(publication.name, publication.record, publication.expectedRecordVersion, primary.reference.owner),
    prepareSubmissionBoundaryPut(boundary, input.expectedBoundaryVersion, primary.reference.owner), recordPut(primary, { content })];
  const written = await batchLifecycleWrites(store, writes, { verb: "attest", lifecycleAction: "attest" });
  if (written.status === "refused") return written;
  return { status: "ok", result: { recordPath: resolveCandidateRecordRelativePath(publication.name),
    metaPath: workUnitMetaPath(primary), locus: boundary } };
}
