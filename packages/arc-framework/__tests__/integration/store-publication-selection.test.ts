/** Publication handlers keep the selected record through Candidate evidence and a concurrent name clash. */
import { boundWorkUnitSubject } from "../helpers/store/bound-checkout.js";
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runHandlerAt } from "../helpers/handler.js";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { createClashDouble } from "../helpers/store/clash-double.js";
import { collectGitCandidateSubject } from "../../src/lib/work-unit/git-candidate-subject.js";
import { createCandidateAttestation } from "../../src/lib/work-unit/candidate-attestation.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { readSubmissionBoundaryVersioned } from "../../src/lib/store/kinds/review/integration-boundary/access.js";
import { handleReviewPrePublication } from "../../src/handlers/review.js";
import { buildExecutorContext } from "../../src/lib/work-unit/executor-context.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import type { VerbBase } from "../../src/handlers/lifecycle-shared.js";
import type { ExecuteTransitionContext } from "../../src/lib/work-unit/lifecycle-executor.js";
const state = vi.hoisted(() => ({ base: undefined as VerbBase | undefined, executor: undefined as ExecuteTransitionContext | undefined }));
vi.mock("../../src/handlers/lifecycle-shared.js", async importOriginal => ({
  ...await importOriginal<typeof import("../../src/handlers/lifecycle-shared.js")>(),
  resolveVerbBase: () => Promise.resolve(state.base),
  buildExecutor: () => Promise.resolve({ executor: state.executor, settings: { "branch.base": "main" } }),
}));
import { handlePublish } from "../../src/handlers/lifecycle.js";
beforeEach(() => { vi.resetAllMocks(); state.base = undefined; state.executor = undefined; });
afterEach(() => { vi.restoreAllMocks(); });

it.each([true, false])("publication retains Candidate evidence and name admission through a clash, explicit=%s", async explicit => {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd } = h.native;
  const exec: typeof h.native.exec = async (command, args, options) => {
    if (command === "gh") return { stdout: args[1] === "list" ? "[]" : "{}", stderr: "" };
    if (args.join(" ") === "config --get remote.origin.url") return { stdout: "https://github.com/owner/repository.git", stderr: "" };
    return h.native.exec(command, args, options);
  };
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  const projectId = "123e4567-e89b-42d3-a456-426614174099", branch = "feat/example";
  await h.reference.seedProject(projectId);
  await git("config", "arc.identity", "test-user");
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\nreview.standard_sources: [codex-pr]\n");
  await writeFile(join(cwd, ".gitignore"), ".arc/system/.internal/\n.arc/user/\n");
  await git("add", ".");
  await git("commit", "-m", "Configure review");
  await git("switch", "-c", branch);
  await writeFile(join(cwd, "implementation.ts"), "export const value = true;\n");
  await git("add", "implementation.ts");
  await git("commit", "-m", "Implement example");
  const primary = await h.reference.seedMeta("example", { taskList: "tasks-example.md", branch: null }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }],
  });
  if (!explicit) await writeWorktreeMarker(cwd, { spawnedByArc: false, spawningIdentity: "test-user",
    createdAt: "2026-10-14T00:00:00Z", createdFor: boundWorkUnitSubject(primary) });
  await h.reference.seed(recordReferences["work-item/task-list"](primary.reference.owner),
    "# Task List: Example\n\n## **Phase 1:** Build\n\n### `[x]` **1.1 Build feature**\n");
  const collected = await collectGitCandidateSubject({ cwd, name: "example", baseBranch: "main", exec });
  if (collected.status !== "collected") throw new Error(collected.detail);
  await h.reference.seedCandidate(primary.reference.owner, { schemaVersion: 1, semanticsVersion: "candidate-attestation/v1",
    subject: collected.target.subject, attestation: createCandidateAttestation({ workUnit: "example",
      subject: collected.target.subject, baseRevision: collected.target.revision, attestedBy: "test-user",
      attestedAt: "2026-10-14T00:00:00Z", verificationEvidenceRef: "test://publication-selection" }),
    transitions: [], lineageAttestations: [] });
  let reviewOutput = "";
  await handleReviewPrePublication("example", { selfReview: "settled", lanes: "lanes.json" }, {
    resolveRoot: () => cwd, write: text => { reviewOutput += text; }, setExitCode: () => undefined,
    readText: async () => JSON.stringify({ frontline: { invocation: { mode: "skip" } }, standard: { terminus: { mode: "owner-accepted" } } }),
  }, undefined, { ...h.native, exec, workItem: primary.reference.owner });
  expect(JSON.parse(reviewOutput), reviewOutput).toMatchObject({ locus: "candidate-publish-ready" });
  const readBoundary = () => readSubmissionBoundaryVersioned(cwd, "example", { store: h.reference.store, owner: primary.reference.owner });
  const ready = await readBoundary();
  const other = await h.reference.seedMeta("other");
  const store = createClashDouble(h.reference.store, { slug: "example", holders: [primary.reference, other.reference],
    mode: explicit ? "mid-verb" : "clash" });
  const io = { ...createUserIOContext(), exec };
  state.base = { cwd, identity: "test-user", io, store };
  state.executor = buildExecutorContext({ cwd, io, store, projectId: async () => projectId, identity: "test-user", teamMode: false, internalTemplateDir: "/templates" });
  const result = await runHandlerAt(cwd, () => handlePublish(explicit ? "example" : undefined, { json: true }));
  expect(result.exitCode, result.stdout + result.stderr).toBe(explicit ? 0 : 1);
  expect(JSON.parse(result.stdout)).toMatchObject(explicit ? { status: "published" }
    : { status: "rejected", refusal: { code: "ambiguous-match", candidates: expect.arrayContaining([
      { ...primary.reference, owner: { ...primary.reference.owner, name: "example" } },
      { ...other.reference, owner: { ...other.reference.owner, name: "example" } },
    ]) } });
  const after = lifecycleSuccess(await h.reference.store.read({ reference: primary.reference }));
  expect(after.fields).toMatchObject({ state: explicit ? "Integrating" : "Active" });
  if (!explicit) {
    expect(after).toEqual(primary);
    expect(await readBoundary()).toEqual(ready);
  }
  expect(lifecycleSuccess(await h.reference.store.read({ reference: other.reference }))).toEqual(other);
}, 30_000);
