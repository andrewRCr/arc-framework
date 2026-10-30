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
import { handleReviewLocalPrepare, handleReviewLocalAttest } from "../../src/handlers/review.js";
import { LocalPrepareEnvelopeSchema } from "../../src/scripts/review-gate/core/review-command-envelope.js";
import { localReviewResult } from "../helpers/in-process-review.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import type { Store } from "../../src/lib/store/index.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { writeMetaState } from "../../src/lib/store/kinds/meta/writers.js";
import { lackingEndedHistory } from "../helpers/store/ended-history.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099";
afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });
async function fixture(lifecycle: "Active" | "Integrating" = "Active") {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native;
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"),
    "branch.base: main\narchive.cadence: manual\nreview.standard_sources: [delegated-agent]\n");
  await exec("git", ["config", "arc.identity", "test-user"], { cwd });
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
  const attest = async (newRoot = false, store: Store = h.reference.store) => {
    output.length = 0;
    await attestCandidateWithReviewBoundary({ ...base, store }, AttestCommandInputSchema.parse({ name: "example", json: true, newRoot }));
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

async function seedHostedBoundary(h: Awaited<ReturnType<typeof fixture>>) {
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
  return boundary;
}

it("repairs publication identity and retains an unchanged native hosted boundary without projected files", async () => {
  const h = await fixture("Integrating"), boundary = await seedHostedBoundary(h);
  const before = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.reference.store, owner: h.primary.reference.owner });
  await expect(h.publish()).resolves.toMatchObject({ status: "rejected",
    remedy: { text: expect.stringContaining("Restore the project's unique, valid identity record") } });
  await h.reference.seedProject(projectId);
  expect(await h.publish()).toMatchObject({ status: "unchanged", boundary });
  expect(await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.reference.store, owner: h.primary.reference.owner })).toEqual(before);
  expect((await h.exec("git", ["status", "--porcelain"], { cwd: h.cwd })).stdout.trim()).toBe("");
}, 30_000);

it.each(["review/candidate", "review/integration-boundary"] as const)(
  "refuses publication through its typed refusal when the %s read refuses, and publishes once repaired", async kind => {
    const h = await fixture("Integrating"), boundary = await seedHostedBoundary(h);
    await h.reference.seedProject(projectId);
    // A ref read whose record objects are missing refuses in this shape, naming the record and no command.
    const refusal = { code: "state-unresolvable" as const, class: "recoverable" as const, historyRefs: [],
      condition: "The stored record's objects are missing.", remedy: { text: "Restore or fetch the missing record objects, then retry the read." } };
    const read = h.reference.store.read.bind(h.reference.store);
    let held = true;
    h.reference.store.read = async input => held && input.reference.kind === kind
      ? { status: "refused", refusal: { ...refusal, reference: input.reference } } : read(input);
    expect(await h.publish()).toMatchObject({ status: "rejected", reason: refusal.condition,
      remedy: { invariant: refusal.condition, text: expect.stringContaining(refusal.remedy.text) } });
    expect(process.exitCode).toBe(1);
    held = false;
    process.exitCode = 0;
    expect(await h.publish()).toMatchObject({ status: "unchanged", boundary });
  }, 30_000);

it("names the native Candidate version during live-review recovery and re-roots after that review ends", async () => {
  const h = await fixture(), originalCwd = process.cwd();
  await h.reference.seedProject(projectId);
  const runReview = async (request: unknown, mode: "prepare" | "attest") => {
    let output = "";
    const boundary = { resolveRoot: () => h.cwd, readText: async () => JSON.stringify(request),
      write: (text: string) => { output += text; }, setExitCode: () => {} };
    const invocation = { store: h.reference.store };
    if (mode === "prepare") await handleReviewLocalPrepare("-", boundary, undefined, invocation);
    else await handleReviewLocalAttest("-", boundary, undefined, invocation);
    return JSON.parse(output) as unknown;
  };
  try {
    process.chdir(h.cwd);
    const prepared = LocalPrepareEnvelopeSchema.parse(await runReview({ schemaVersion: 1,
      evaluatorIdentity: "independent-reviewer", routingFacts: { contentKind: "code-bearing", reviewRisk: "routine",
        changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary" },
      policyJudgment: { scopeMode: "whole-target", invocation: { mode: "force", sourceId: "delegated-agent" } } }, "prepare"));
    if (prepared.state !== "ready") throw new Error(JSON.stringify(prepared));
    const before = await readCandidateRecordVersioned(h.cwd, "example", { store: h.reference.store, owner: h.primary.reference.owner });
    const reviewHead = (await h.exec("git", ["rev-parse", "HEAD"], { cwd: h.cwd })).stdout.trim();
    await writeFile(join(h.cwd, "example.ts"), "export const example = false;\n");
    await h.exec("git", ["commit", "-am", "Correct example"], { cwd: h.cwd });
    const refused = await h.attest(true);
    expect(refused, JSON.stringify(refused)).toMatchObject({ status: "refused", reason: "re-root-live-review",
      recordRevision: before.version, nextAction: { candidateRecordRevision: before.version },
      recommendedActionText: expect.stringContaining("Candidate record store version") });
    await h.exec("git", ["branch", "saved-correction"], { cwd: h.cwd });
    await h.exec("git", ["reset", "--hard", reviewHead], { cwd: h.cwd });
    const result = await runReview({ ...localReviewResult(prepared.payload, "completed-review", []),
      operationRef: prepared.payload.operationRef }, "attest");
    expect(result, JSON.stringify(result)).toMatchObject({ state: "attested-current" });
    await h.exec("git", ["merge", "saved-correction"], { cwd: h.cwd });
    expect(await h.attest(true)).toMatchObject({ status: "attested", operation: "re-root", locus: { schemaVersion: 2 } });
  } finally { process.chdir(originalCwd); }
}, 30_000);

it("re-roots a Shipped work unit and prepares its review after pulling the history this clone lacks", async () => {
  const h = await fixture(), originalCwd = process.cwd();
  await h.reference.seedProject(projectId);
  const live = lifecycleSuccess(await h.reference.store.read({ reference: h.primary.reference }));
  lifecycleSuccess(await h.reference.store.write({ ...recordPut(live, { content: writeMetaState(live.content, "Shipped"),
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }),
  provenance: { verb: "archive", lifecycleAction: "archive" } }));
  await writeFile(join(h.cwd, "example.ts"), "export const example = false;\n");
  await h.exec("git", ["commit", "-am", "Correct example"], { cwd: h.cwd });
  const lacking = () => lackingEndedHistory(h.reference.store, h.primary.reference.owner);
  const rooted = await h.attest(true, lacking());
  expect(rooted, JSON.stringify(rooted)).toMatchObject({ status: "attested", operation: "re-root" });
  let output = "";
  const request = { schemaVersion: 1, evaluatorIdentity: "independent-reviewer", routingFacts: { contentKind: "code-bearing",
    reviewRisk: "routine", changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary" },
  policyJudgment: { scopeMode: "whole-target", invocation: { mode: "force", sourceId: "delegated-agent" } } };
  try {
    process.chdir(h.cwd);
    await handleReviewLocalPrepare("-", { resolveRoot: () => h.cwd, readText: async () => JSON.stringify(request),
      write: (text: string) => { output += text; }, setExitCode: () => {} }, undefined, { store: lacking() });
  } finally { process.chdir(originalCwd); }
  expect(LocalPrepareEnvelopeSchema.parse(JSON.parse(output)), output).toHaveProperty("state", "ready");
}, 30_000);
