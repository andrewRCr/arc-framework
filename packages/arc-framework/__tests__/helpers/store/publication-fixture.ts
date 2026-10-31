/** Produce real code and stored Candidate evidence for store-backed publication scenarios. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Store } from "../../../src/lib/store/contract.js";
import type { StoreRecord } from "../../../src/lib/store/read.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { lifecycleSuccess } from "./lifecycle-harness.js";
import { collectCandidateSubjectTarget } from "../candidate-subject.js";
import { boundaryV2Fixture } from "../../fixtures/review-boundary.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { writeMetaCandidate } from "../../../src/lib/store/kinds/meta/writers.js";
import { createCandidateAttestation } from "../../../src/lib/work-unit/candidate-attestation.js";
import { createProjectIdentityReader } from "../../../src/lib/store/project-identity.js";
import { writeCandidateRecord } from "../../../src/lib/store/kinds/review/candidate/access.js";
import { writeSubmissionBoundary } from "../../../src/lib/store/kinds/review/integration-boundary/access.js";
import { createReviewCompositionContext } from "../../../src/scripts/review-gate/runtime/composition-context.js";
import { readReviewReadinessBinding } from "../../../src/scripts/review-gate/runtime/readiness-binding.js";
import { IntegrationBoundaryLocusV2Schema } from "../../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";

/** Attest the live generation's committed code and store a publish-ready boundary bound to its current readiness. */
export async function attestStorePublication(f: { cwd: string; name: string; repository: string; exec: GitExec; store: Store; live: StoreRecord }): Promise<void> {
  const live = lifecycleSuccess(await f.store.read({ reference: f.live.reference }));
  const owner = live.reference.owner, branch = `feat/${f.name}`;
  await f.exec("git", ["switch", "-c", branch]);
  await writeFile(join(f.cwd, "implementation.ts"), "export const value = true;\n");
  await f.exec("git", ["add", "implementation.ts"]); await f.exec("git", ["commit", "-m", "implementation"]);
  const target = await collectCandidateSubjectTarget({ cwd: f.cwd, name: f.name, baseBranch: "main", exec: f.exec });
  const attestation = createCandidateAttestation({ workUnit: f.name, subject: target.subject, baseRevision: target.revision,
    attestedBy: "test-user", attestedAt: "2026-10-24T00:00:00Z", verificationEvidenceRef: "test://publication-reuse" });
  await writeCandidateRecord(f.cwd, f.name, { schemaVersion: 1, semanticsVersion: "candidate-attestation/v1", attestation,
    subject: target.subject, transitions: [], lineageAttestations: [] }, null, { store: f.store, owner });
  lifecycleSuccess(await f.store.write({ ...recordPut(live, { content: writeMetaCandidate(live.content, attestation.candidateId),
    links: { branches: [{ repository: f.repository, ref: branch, linkedAs: "created", excluded: [] }] } }),
    provenance: { verb: "fixture", lifecycleAction: "attest" } }));
  const { family } = createReviewCompositionContext({ cwd: f.cwd, exec: f.exec, store: f.store, workItem: owner,
    projectId: createProjectIdentityReader(f.store) });
  const headSha = (await f.exec("git", ["rev-parse", "HEAD"], { cwd: f.cwd })).stdout.trim();
  const binding = await readReviewReadinessBinding({ store: f.store, workItem: owner, inFlight: family.ports.inFlight,
    repositoryId: f.repository, candidateId: attestation.candidateId, headSha });
  if (binding.status !== "complete") throw new Error(binding.condition);
  await writeSubmissionBoundary(f.cwd, IntegrationBoundaryLocusV2Schema.parse({ ...boundaryV2Fixture("candidate-publish-ready"),
    workUnit: f.name, candidateId: attestation.candidateId, candidateSubjectDigest: target.subject.subjectDigest,
    reservation: null, readinessBinding: binding.digest,
    nextAction: { kind: "publish-candidate", command: `arc publish ${f.name} --json`, interactionText: "Publish" } }), null, { store: f.store, owner });
}
