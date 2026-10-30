/** Produce real code and Candidate evidence for store-backed publication scenarios. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Store } from "../../../src/lib/store/contract.js";
import type { StoreRecord } from "../../../src/lib/store/read.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { lifecycleSuccess } from "./lifecycle-harness.js";
import { collectCandidateSubjectTarget } from "../candidate-subject.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { writeMetaCandidate } from "../../../src/lib/store/kinds/meta/writers.js";
import { createCandidateAttestation } from "../../../src/lib/work-unit/candidate-attestation.js";
import { writeCandidateRecord } from "../../../src/lib/work-unit/candidate-record-store.js";
import { writeSubmissionBoundary } from "../../../src/lib/work-unit/submission-boundary-store.js";
import { CandidatePublishReadyBoundarySchema } from "../../../src/scripts/review-gate/policy/integration-boundary-locus.js";

export async function attestStorePublication(f: { cwd: string; name: string; repository: string; exec: GitExec; store: Store; live: StoreRecord }): Promise<void> {
  const live = lifecycleSuccess(await f.store.read({ reference: f.live.reference }));
  const branch = `feat/${f.name}`;
  await f.exec("git", ["switch", "-c", branch]);
  await writeFile(join(f.cwd, "implementation.ts"), "export const value = true;\n");
  await f.exec("git", ["add", "implementation.ts"]); await f.exec("git", ["commit", "-m", "implementation"]);
  const target = await collectCandidateSubjectTarget({ cwd: f.cwd, name: f.name, baseBranch: "main", exec: f.exec });
  const attestation = createCandidateAttestation({ workUnit: f.name, subject: target.subject, baseRevision: target.revision,
    attestedBy: "test-user", attestedAt: "2026-10-24T00:00:00Z", verificationEvidenceRef: "test://publication-reuse" });
  await writeCandidateRecord(f.cwd, f.name, { schemaVersion: 1, semanticsVersion: "candidate-attestation/v1", attestation,
    subject: target.subject, transitions: [], lineageAttestations: [] }, null);
  await writeSubmissionBoundary(f.cwd, CandidatePublishReadyBoundarySchema.parse({ schemaVersion: 1, mode: "pre-publication-review",
    workUnit: f.name, candidateId: attestation.candidateId, candidateSubjectDigest: target.subject.subjectDigest,
    locus: "candidate-publish-ready", standardLaneOwnerVersion: 0, policy: null, reservation: null, terminus: null,
    deliveryReviewTermini: [], nextAction: { kind: "publish-candidate", command: `arc publish ${f.name} --json`, interactionText: "Publish" } }), null);
  lifecycleSuccess(await f.store.write({ ...recordPut(live, { content: writeMetaCandidate(live.content, attestation.candidateId),
    links: { branches: [{ repository: f.repository, ref: branch, linkedAs: "created", excluded: [] }] } }),
    provenance: { verb: "fixture", lifecycleAction: "attest" } }));
}
