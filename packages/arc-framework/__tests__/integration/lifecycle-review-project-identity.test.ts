/** Lifecycle review boundaries retain project repair guidance through real native re-entry. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { readCandidateRecordVersioned } from "../../src/lib/store/kinds/review/candidate/access.js";
import { readSubmissionBoundaryVersioned, writeSubmissionBoundary } from "../../src/lib/store/kinds/review/integration-boundary/access.js";
import { AttestResultSchema } from "../../src/lib/work-unit/verbs/attest.js";
import { AttestCommandInputSchema, attestCandidateWithReviewBoundary, publishCandidateWithReviewBoundary } from "../../src/handlers/lifecycle-delivery-review.js";
import { PublishCommandInputSchema } from "../../src/handlers/lifecycle.js";
import { createStandardReviewReservation, projectPublicationBoundary } from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { createHostedHandleFixture } from "../fixtures/hosted-review.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099";
afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });
async function fixture(lifecycle: "Active" | "Integrating" = "Active") {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native;
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\narchive.cadence: manual\n");
  await exec("git", ["add", "."], { cwd });
  await exec("git", ["commit", "-m", "Configure lifecycle fixture"], { cwd });
  const branch = "topic/opaque";
  await exec("git", ["switch", "-c", branch], { cwd });
  await writeFile(join(cwd, "example.ts"), "export const example = true;\n");
  await exec("git", ["add", "example.ts"], { cwd });
  await exec("git", ["commit", "-m", "Implement example"], { cwd });
  const primary = await h.reference.seedMeta("example", { branch: null, state: lifecycle,
    taskList: "tasks-example.md", currentWorkflow: lifecycle === "Active" ? "process-task-loop" : "integrate-work-unit" },
  { kind: "active" }, { branches: [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }] });
  await h.reference.seed(recordReferences["work-item/task-list"](primary.reference.owner),
    "# Task List: example\n\n## **Phase 1:** Build\n\n### `[x]` **1.1 Build**\n");
  const io = createUserIOContext(); io.exec = exec;
  const base = { cwd, identity: "test-user", io, store: h.reference.store };
  const output: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output.push(String(chunk)); return true; });
  const attest = async (newRoot = false) => {
    output.length = 0;
    await attestCandidateWithReviewBoundary(base, AttestCommandInputSchema.parse({ name: "example", json: true, newRoot }));
    return JSON.parse(output.join("")) as unknown;
  };
  const initial = AttestResultSchema.parse(await attest());
  if (initial.status !== "attested") throw new Error(`Expected initial attestation: ${JSON.stringify(initial)}`);
  return { ...h, cwd, exec, primary, initial, branch, attest, publish: async () => {
    output.length = 0;
    await publishCandidateWithReviewBoundary(base, "example", PublishCommandInputSchema.parse({ slug: "example", json: true }));
    return JSON.parse(output.join("")) as unknown;
  } };
}

it("refuses re-root with the project port's remedy and attests the corrected native invocation", async () => {
  const h = await fixture();
  await writeFile(join(h.cwd, "example.ts"), "export const example = false;\n");
  await h.exec("git", ["add", "example.ts"], { cwd: h.cwd });
  await h.exec("git", ["commit", "-m", "Correct example"], { cwd: h.cwd });
  const version = lifecycleSuccess(await h.reference.store.version());
  await expect(h.attest(true)).resolves.toMatchObject({ status: "rejected",
    remedy: { text: expect.stringContaining("Restore the project's unique, valid identity record") } });
  expect(lifecycleSuccess(await h.reference.store.version())).toBe(version);
  await h.reference.seedProject(projectId);
  expect(await h.attest(true)).toMatchObject({ status: "attested", operation: "re-root", locus: { schemaVersion: 2 } });
  const saved = await readCandidateRecordVersioned(h.cwd, "example", { store: h.reference.store, owner: h.primary.reference.owner });
  expect(saved.record?.attestation.supersedes).toBe(h.initial.locus.candidateId);
}, 30_000);

it("repairs publication identity and retains an unchanged native hosted boundary without projected files", async () => {
  const h = await fixture("Integrating");
  const head = (await h.exec("git", ["rev-parse", "HEAD"], { cwd: h.cwd })).stdout.trim();
  const handle = createHostedHandleFixture({ repositoryId: projectId,
    target: { repository: "owner/repo", pullRequest: 42, headSha: head },
    lineage: { kind: "candidate", candidateId: h.initial.locus.candidateId } });
  const { obligation, reasons, rubricVersion, rubricDigest, retrigger, count } = handle.admission.requirement;
  const reservation = createStandardReviewReservation({ candidateId: h.initial.locus.candidateId, sourceId: "codex-pr",
    repository: "owner/repo", headSha: head, obligation: { obligation, reasons, rubricVersion, rubricDigest, retrigger, count } });
  const snapshot = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.reference.store, owner: h.primary.reference.owner });
  const boundary = projectPublicationBoundary({ workUnit: "example", branch: h.branch,
    candidateId: h.initial.locus.candidateId, candidateSubjectDigest: h.initial.locus.candidateSubjectDigest,
    reservation, terminus: null, readinessBinding: null, changeRequest: { repository: "owner/repo", pullRequest: 42 } }, 2);
  await writeSubmissionBoundary(h.cwd, boundary, snapshot.version, { store: h.reference.store, owner: h.primary.reference.owner });
  const before = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.reference.store, owner: h.primary.reference.owner });
  await expect(h.publish()).resolves.toMatchObject({ status: "rejected",
    remedy: { text: expect.stringContaining("Restore the project's unique, valid identity record") } });
  await h.reference.seedProject(projectId);
  expect(await h.publish()).toMatchObject({ status: "unchanged", boundary });
  expect(await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.reference.store, owner: h.primary.reference.owner })).toEqual(before);
  expect((await h.exec("git", ["status", "--porcelain"], { cwd: h.cwd })).stdout.trim()).toBe("");
}, 30_000);
