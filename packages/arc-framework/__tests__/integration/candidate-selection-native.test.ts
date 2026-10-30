/** Native applicability selection completes in the store with no projected record to stage. */
import { expect, it, onTestFinished } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { handleCandidateApplicabilityResolve } from "../../src/handlers/candidate.js";
import { createCandidateAttestation, candidateReviewApplicabilitySelections } from "../../src/lib/work-unit/candidate-attestation.js";
import { collectGitCandidateSubject } from "../../src/lib/work-unit/git-candidate-subject.js";
import { readGitCandidateTargetBase } from "../../src/lib/work-unit/git-candidate-effective-target.js";
import { createRawGitExec } from "../../src/lib/io-context.js";
import { projectGitReviewContributionApplicability } from "../../src/scripts/review-gate/policy/git-review-contribution-applicability.js";
import { readCandidateRecordVersioned } from "../../src/lib/store/kinds/review/candidate/access.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import type { Store } from "../../src/lib/store/index.js";
import { lackingEndedHistory } from "../helpers/store/ended-history.js";

async function selection(archived = false) {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native;
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  const projectId = "123e4567-e89b-42d3-a456-426614174099", branch = "feat/example";
  await h.reference.seedProject(projectId);
  await git("config", "arc.identity", "test-user");
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\n");
  await writeFile(join(cwd, ".gitignore"), ".arc/system/.internal/\n.arc/user/\n");
  await git("add", ".");
  await git("commit", "-m", "Configure project");
  await git("switch", "-c", branch);
  await writeFile(join(cwd, "feature.txt"), "reviewed\n");
  await git("add", "feature.txt");
  await git("commit", "-m", "Implement feature");
  const collected = await collectGitCandidateSubject({ cwd, name: "example", baseBranch: "main", exec });
  if (collected.status !== "collected") throw new Error(collected.detail);
  const primary = await h.reference.seedMeta("example", archived ? { branch: null, state: "Shipped", currentWorkflow: null }
    : { branch: null }, archived ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } : { kind: "active" }, {
    branches: [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }],
  });
  const record = { schemaVersion: 1 as const, semanticsVersion: "candidate-attestation/v1" as const,
    subject: collected.target.subject, attestation: createCandidateAttestation({ workUnit: "example", subject: collected.target.subject,
      baseRevision: collected.target.revision, attestedBy: "test-user", attestedAt: "2026-10-20T12:00:00Z",
      verificationEvidenceRef: "test://verification" }), transitions: [], lineageAttestations: [] };
  const saved = await h.reference.seedCandidate(primary.reference.owner, record);
  await writeWorktreeMarker(cwd, { spawnedByArc: false, spawningIdentity: "test-user", createdAt: "2026-10-20T12:00:00Z",
    createdFor: { kind: "work-unit", name: "example" } });
  await writeFile(join(cwd, "feature.txt"), "changed\n");
  await git("commit", "-am", "Adjust feature");
  const currentHead = await git("rev-parse", "HEAD");
  const basis = await readGitCandidateTargetBase({ cwd, revision: currentHead, baseBranch: "main", exec });
  if (basis.status !== "resolved") throw new Error(basis.detail);
  const base = basis.base;
  const projection = await projectGitReviewContributionApplicability({ selector: { schemaVersion: 1, repositoryId: projectId,
    repository: "owner/repository", pullRequest: 42, lane: "standard", sourceId: "codex-pr", priorAttemptId: "attempt-prior",
    priorHead: collected.target.revision, currentHead, priorBase: base, currentBase: base }, exec: createRawGitExec(cwd),
    observeEndpoints: async () => ({ head: currentHead, base }) });
  expect(projection).toHaveProperty("state", "decision-required");
  const request = { kind: "review-applicability-selection", offer: { schemaVersion: 1, kind: "review-applicability-selection",
    workUnitId: "example", expectedRecordVersion: saved.version, candidateId: record.attestation.candidateId,
    projection, choices: ["covered", "review-required"], interactionText: "Classify the review residual." },
    selection: { selectedBy: "test-user", selectedAt: "2026-10-20T12:01:00Z", choice: "covered" } };
  const invoke = async (store: Store = h.reference.store) => {
    let output = "";
    const exits: number[] = [];
    await handleCandidateApplicabilityResolve("example", "-", undefined, { readText: async () => JSON.stringify(request),
      write: text => { output += text; }, setExitCode: code => exits.push(code) },
    { cwd, exec, store, projectId: h.reference.projectId, workItem: primary.reference.owner });
    expect(exits, output).toEqual([]);
    expect(JSON.parse(output)).toMatchObject({ state: expect.stringMatching(/^(resolved|exact-replay)$/), nextAction: "continue" });
  };
  return { h, cwd, git, primary, invoke };
}

it("records and replays an applicability selection without changing the Git index", async () => {
  const { h, cwd, git, primary, invoke } = await selection();
  await invoke();
  const selected = await readCandidateRecordVersioned(cwd, "example", { store: h.reference.store, owner: primary.reference.owner });
  if (selected.record === null) throw new Error("Expected the stored selection");
  expect(candidateReviewApplicabilitySelections(selected.record)).toMatchObject([{ choice: "covered", selectedBy: "test-user" }]);
  await invoke();
  expect(await readCandidateRecordVersioned(cwd, "example", { store: h.reference.store, owner: primary.reference.owner })).toEqual(selected);
  expect(await git("diff", "--cached", "--name-only")).toBe("");
}, 30_000);

it("records a selection on an archived work unit after pulling the history this clone lacks", async () => {
  const { h, cwd, primary, invoke } = await selection(true);
  await invoke(lackingEndedHistory(h.reference.store, primary.reference.owner));
  const selected = await readCandidateRecordVersioned(cwd, "example", { store: h.reference.store, owner: primary.reference.owner });
  expect(selected.record === null ? [] : candidateReviewApplicabilitySelections(selected.record))
    .toMatchObject([{ choice: "covered", selectedBy: "test-user" }]);
}, 30_000);
