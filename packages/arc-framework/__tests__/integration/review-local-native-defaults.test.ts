/** Native local review defaults publish portable results from their authenticated checkout owner. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { localReviewResult } from "../helpers/in-process-review.js";
import { collectGitCandidateSubject } from "../../src/lib/work-unit/git-candidate-subject.js";
import { createCandidateAttestation } from "../../src/lib/work-unit/candidate-attestation.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { createReviewOutcomePort } from "../../src/lib/store/kinds/review/outcome/access.js";
import { IntegrationBoundaryLocusV2Schema } from "../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { LocalPrepareEnvelopeSchema, LocalAttestEnvelopeSchema, LocalResumeEnvelopeSchema, ReduceEnvelopeSchema }
  from "../../src/scripts/review-gate/core/review-command-envelope.js";
import { parseNativeReviewOperationReference } from "../../src/scripts/review-gate/core/review-operation-reference.js";
import { handleReviewLocalPrepare, handleReviewLocalAttest, handleReviewLocalResume, handleReviewReduce }
  from "../../src/handlers/review.js";

it("prepares, attests, resumes, and reduces a stored work unit through actual defaults without an injected owner", async () => {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native;
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  const projectId = "123e4567-e89b-42d3-a456-426614174099", branch = "topic/opaque";
  await h.reference.seedProject(projectId);
  const primary = await h.reference.seedMeta("example", { owner: "andrew", branch: null, workClass: "Light" }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }],
  });
  await git("config", "arc.identity", "andrew");
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"),
    "branch.base: main\nreview.standard_sources: [delegated-agent]\nreview.standard_max_passes: 4\n");
  await writeFile(join(cwd, ".gitignore"), ".arc/system/.internal/\n.arc/user/\n");
  await writeFile(join(cwd, "example.ts"), "export const value = 0;\n");
  await git("add", ".");
  await git("commit", "-m", "Configure local review");
  const base = await git("rev-parse", "HEAD");
  await git("switch", "-c", branch);
  await writeFile(join(cwd, "example.ts"), "export const value = 1;\n");
  await git("commit", "-am", "Implement example");
  await writeWorktreeMarker(cwd, { spawnedByArc: false, spawningIdentity: "andrew", createdAt: "2026-10-20T15:00:00Z",
    createdFor: { kind: "work-unit", name: "example" } });
  const collected = await collectGitCandidateSubject({ cwd, name: "example", baseBranch: "main", exec });
  if (collected.status !== "collected") throw new Error(collected.detail);
  const attestation = createCandidateAttestation({ workUnit: "example", subject: collected.target.subject,
    baseRevision: base, attestedBy: "andrew", attestedAt: "2026-10-20T15:00:00Z", verificationEvidenceRef: "test://verified" });
  await h.reference.seedCandidate(primary.reference.owner, { schemaVersion: 1, semanticsVersion: "candidate-attestation/v1",
    attestation, subject: collected.target.subject, transitions: [], lineageAttestations: [] });
  await h.reference.seedBoundary(primary.reference.owner, IntegrationBoundaryLocusV2Schema.parse({ schemaVersion: 2,
    mode: "pre-publication-review", workUnit: "example", candidateId: attestation.candidateId,
    candidateSubjectDigest: collected.target.subject.subjectDigest, locus: "candidate-review-pending", reservation: null,
    nextAction: { kind: "run-self-review", command: "self-review", interactionText: "Review the Candidate." } }));
  const invoke = async (handler: typeof handleReviewLocalPrepare | typeof handleReviewLocalAttest
    | typeof handleReviewLocalResume | typeof handleReviewReduce, request: unknown) => {
    let output = "";
    const exitCodes: number[] = [];
    await handler("-", { resolveRoot: () => cwd, readText: async () => JSON.stringify(request),
      write: text => { output += text; }, setExitCode: code => exitCodes.push(code) }, undefined, h.native);
    expect(exitCodes, output).toEqual([]);
    return JSON.parse(output) as unknown;
  };
  const prepared = LocalPrepareEnvelopeSchema.parse(await invoke(handleReviewLocalPrepare, { schemaVersion: 1,
    evaluatorIdentity: "independent-reviewer", routingFacts: { contentKind: "code-bearing", reviewRisk: "routine",
      changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary" } }));
  expect(prepared.state).toBe("ready");
  if (prepared.state !== "ready" || prepared.payload.operationRef === undefined) throw new Error("Expected a native admission");
  const operationRef = prepared.payload.operationRef;
  expect(parseNativeReviewOperationReference(operationRef).workItem).toEqual(primary.reference.owner);
  const request = { ...localReviewResult(prepared.payload, "default-native-review", []), operationRef };
  const attested = LocalAttestEnvelopeSchema.parse(await invoke(handleReviewLocalAttest, request));
  expect(attested.state).toBe("attested-current");
  const outcomes = createReviewOutcomePort(h.reference.store, primary.reference.owner);
  const stored = await outcomes.read(prepared.payload.operationId);
  expect(stored?.value).toMatchObject({ outcome: "clean", target: { repositoryId: projectId },
    lineage: { kind: "candidate", candidateId: attestation.candidateId } });
  const continuation = { schemaVersion: 1, operationId: prepared.payload.operationId, operationRef };
  expect(LocalResumeEnvelopeSchema.parse(await invoke(handleReviewLocalResume, continuation)).state).toBe("review-complete");
  expect(ReduceEnvelopeSchema.parse(await invoke(handleReviewReduce, continuation)).state).toBe("advisory-complete");
  expect(LocalAttestEnvelopeSchema.parse(await invoke(handleReviewLocalAttest, request)).state).toBe("attested-current");
  expect(await outcomes.read(prepared.payload.operationId)).toEqual(stored);
}, 60_000);
