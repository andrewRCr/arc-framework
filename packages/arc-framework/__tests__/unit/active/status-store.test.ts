/** Active status projects native review authority without materialized metadata fields. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { runActiveStatus, runActiveSessionInitStatus } from "../../../src/commands/active/status.js";
import { createReviewHarness } from "../../helpers/store/review-harness.js";
import { candidateFixture } from "../../helpers/store/tracked-write-fixture.js";
import { projectDurableCandidateTarget } from "../../helpers/candidate.js";
import { writeWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import { boundWorkUnitSubject } from "../../helpers/store/bound-checkout.js";
import { projectCandidateReviewBoundary } from "../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";

it.each(["full", "session-init"] as const)("projects the stored Integrating Candidate and linked branch in %s status", async mode => {
  const h = createReviewHarness(), cwd = await mkdtemp(join(tmpdir(), "arc-active-review-store-"));
  onTestFinished(async () => rm(cwd, { recursive: true, force: true }));
  const record = candidateFixture();
  const primary = await h.seedMeta("example", { state: "Integrating", currentWorkflow: "integrate-work-unit" }, { kind: "active" },
    { branches: [{ repository: "project", ref: "refs/heads/feat/example", linkedAs: "created", excluded: [] },
      { repository: "other-project", ref: "feat/foreign", linkedAs: "created", excluded: [] }] });
  await h.seedCandidate(primary.reference.owner, record);
  const boundary = projectCandidateReviewBoundary({ workUnit: "example", candidateId: record.attestation.candidateId,
    candidateSubjectDigest: record.subject.subjectDigest }, 2);
  await h.seedBoundary(primary.reference.owner, boundary);
  await writeWorktreeMarker(cwd, { spawnedByArc: false, createdFor: boundWorkUnitSubject(primary),
    spawningIdentity: "andrew", createdAt: "2026-10-19T00:00:00.000Z" });
  const git = scriptGitExec([{ match: ["rev-parse", "--abbrev-ref", "HEAD"], responses: [{ stdout: "feat/example" }] }]);
  const options = { cwd, store: h.store, projectId: async () => "project", exec: git.exec,
    projectCandidateTarget: projectDurableCandidateTarget };
  if (mode === "full") {
    expect(await runActiveStatus(options)).toMatchObject({ candidates: [{ candidateId: record.attestation.candidateId,
      branch: "feat/example", integrationBoundary: boundary }], warnings: [] });
  } else {
    expect(await runActiveSessionInitStatus(options)).toMatchObject({ resolution: "single", sessionType: "integration",
      integrationBoundary: boundary, warnings: [] });
  }
});
