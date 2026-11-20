/** Active status projects native review authority without materialized metadata fields, in any checkout layout. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { runActiveStatus, runActiveSessionInitStatus } from "../../../src/commands/active/status.js";
import { createReviewHarness } from "../../helpers/store/review-harness.js";
import { candidateFixture } from "../../helpers/store/tracked-write-fixture.js";
import { projectCandidateApplicabilityDecision, projectDurableCandidateTarget } from "../../helpers/candidate.js";
import { writeWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import { boundWorkUnitSubject } from "../../helpers/store/bound-checkout.js";
import { createStandardReviewReservation, projectCandidateReviewBoundary }
  from "../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { IntegrationBoundaryLocusV2Schema } from "../../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import { boundaryV2Fixture } from "../../fixtures/review-boundary.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";
import { recordReferences, type Store, type StoreRecord } from "../../../src/lib/store/index.js";
import { lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { writeMetaCurrentWorkflow } from "../../../src/lib/store/kinds/meta/writers.js";
import { beginProjectionCommand, projectionProcessState, recordEngineStoreCapability }
  from "../../../src/lib/store/projection/process-state.js";
import { SlugSchema } from "../../../src/lib/kernel/schema/slug.js";

it.each([
  ["full", "unprojected"], ["session-init", "unprojected"], ["full", "nested"], ["session-init", "nested"],
] as const)("projects the stored Integrating Candidate and linked branch in %s status (%s layout)", async (mode, layout) => {
  const h = createReviewHarness(), cwd = await mkdtemp(join(tmpdir(), "arc-active-review-store-"));
  onTestFinished(async () => rm(cwd, { recursive: true, force: true }));
  const path = layout === "nested" ? ".arc/active/current/meta-example.md" : ".arc/active/meta-example.md";
  if (layout === "nested") {
    onTestFinished(() => { beginProjectionCommand(); });
    recordEngineStoreCapability(cwd, true);
    projectionProcessState().layoutContexts.set(cwd, Promise.resolve({ claim: SlugSchema.parse("example"),
      layoutActive: "nested" }));
  }
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
    expect(await runActiveStatus(options)).toMatchObject({ candidates: [{ path,
      candidateId: record.attestation.candidateId, branch: "feat/example", integrationBoundary: boundary }], warnings: [] });
  } else {
    expect(await runActiveSessionInitStatus(options)).toMatchObject({ resolution: "single", path,
      sessionType: "integration", integrationBoundary: boundary, warnings: [] });
  }
});

it.each(["full", "session-init"] as const)("resumes execution with a retained Candidate in %s status", async mode => {
  const h = createReviewHarness(), cwd = await mkdtemp(join(tmpdir(), "arc-active-reopened-store-"));
  onTestFinished(async () => rm(cwd, { recursive: true, force: true }));
  const primary = await h.seedMeta("example", { state: "Active", currentWorkflow: "process-task-loop", taskList: "tasks-example.md" });
  await h.seedCandidate(primary.reference.owner, candidateFixture());
  await writeWorktreeMarker(cwd, { spawnedByArc: false, createdFor: boundWorkUnitSubject(primary),
    spawningIdentity: "andrew", createdAt: "2026-10-19T00:00:00.000Z" });
  const git = scriptGitExec([{ match: ["rev-parse", "--abbrev-ref", "HEAD"], responses: [{ stdout: "feat/example" }] }]);
  const options = { cwd, store: h.store, projectId: async () => "project", exec: git.exec,
    projectCandidateTarget: async () => { throw new Error("Execution must not project historical Candidate authority"); },
    readPendingCandidateReviewFixAuthority: async () => { throw new Error("Execution must not read Candidate fix authority"); } };
  if (mode === "full") expect(await runActiveStatus(options)).toMatchObject({ candidates: [{ candidateId: null }], warnings: [] });
  else expect(await runActiveSessionInitStatus(options)).toMatchObject({ resolution: "single", sessionType: "execution",
    integrationBoundary: null, warnings: [] });
});

const record = candidateFixture();
const coordinates = { workUnit: "example", candidateId: record.attestation.candidateId,
  candidateSubjectDigest: record.subject.subjectDigest };
const staleSubject = canonicalDigest({ subject: "stale" });

/** Bind a scratch checkout's marker to the held work unit and read its status through the given store. */
async function boundStatus(primary: StoreRecord, store: Store, projectCandidateTarget = projectDurableCandidateTarget) {
  const cwd = await mkdtemp(join(tmpdir(), "arc-active-candidate-store-"));
  onTestFinished(async () => rm(cwd, { recursive: true, force: true }));
  await writeWorktreeMarker(cwd, { spawnedByArc: false, createdFor: boundWorkUnitSubject(primary),
    spawningIdentity: "andrew", createdAt: "2026-10-19T00:00:00.000Z" });
  const git = scriptGitExec([{ match: ["rev-parse", "--abbrev-ref", "HEAD"], responses: [{ stdout: "feat/example" }] }]);
  const options = { cwd, store, projectId: async () => "project", exec: git.exec, projectCandidateTarget };
  return { full: () => runActiveStatus(options), session: () => runActiveSessionInitStatus(options) };
}

/** Hold an Active work unit in Candidate preparation, its task list complete, with its Candidate stored. */
async function preparingWorkUnit(h: ReturnType<typeof createReviewHarness>): Promise<StoreRecord> {
  const seeded = await h.seedMeta("example", { state: "Active", taskList: "tasks-example.md" });
  await h.seed(recordReferences["work-item/task-list"](seeded.reference.owner),
    "# Task List\n\n## **Phase 1:** Build\n\n### `[x]` **1.1 Complete**\n");
  const meta = lifecycleSuccess(await h.store.read({ reference: seeded.reference }));
  lifecycleSuccess(await h.store.write({ action: "put", reference: meta.reference, expected: meta.version,
    placement: { kind: "active" }, content: writeMetaCurrentWorkflow(meta.content, "prepare-work-unit"),
    provenance: { verb: "prepare-work-unit", lifecycleAction: "prepare" } }));
  await h.seedCandidate(seeded.reference.owner, record);
  return lifecycleSuccess(await h.store.read({ reference: seeded.reference }));
}

/** Hold an Integrating work unit linked to its branch, with its Candidate stored. */
async function integratingWorkUnit(h: ReturnType<typeof createReviewHarness>): Promise<StoreRecord> {
  const primary = await h.seedMeta("example", { state: "Integrating", currentWorkflow: "integrate-work-unit" },
    { kind: "active" }, { branches: [{ repository: "project", ref: "refs/heads/feat/example", linkedAs: "created", excluded: [] }] });
  await h.seedCandidate(primary.reference.owner, record);
  return primary;
}

it("preserves the exact stored Active prepublication boundary in full and session-init status", async () => {
  const h = createReviewHarness();
  const primary = await preparingWorkUnit(h);
  const boundary = IntegrationBoundaryLocusV2Schema.parse({ ...boundaryV2Fixture("candidate-publish-ready"), ...coordinates,
    terminus: canonicalDigest({ terminus: "owner-accepted" }) });
  await h.seedBoundary(primary.reference.owner, boundary);
  const status = await boundStatus(primary, h.store);
  expect(await status.full()).toMatchObject({ candidates: [{ integrationBoundary: boundary }], warnings: [] });
  expect(await status.session()).toMatchObject({ sessionType: "prepublication", currentWorkflow: "prepare-work-unit",
    integrationBoundary: boundary, warnings: [] });
});

it("falls back to initial review when the stored Active prepublication boundary names a stale subject", async () => {
  const h = createReviewHarness();
  const primary = await preparingWorkUnit(h);
  await h.seedBoundary(primary.reference.owner, IntegrationBoundaryLocusV2Schema.parse({
    ...boundaryV2Fixture("candidate-publish-ready"), ...coordinates, candidateSubjectDigest: staleSubject }));
  const status = await boundStatus(primary, h.store);
  expect(await status.session()).toMatchObject({ sessionType: "prepublication", integrationBoundary: {
    ...coordinates, schemaVersion: 2, terminus: null, locus: "candidate-review-pending",
    nextAction: { kind: "run-self-review", command: "arc review pre-publication example" } } });
});

it.each([
  ["Active", "prepare-work-unit", "prepublication"],
  ["Integrating", "integrate-work-unit", "integration"],
] as const)("withholds the %s session while its Candidate cannot be read, and resumes it once readable", async (
  state, workflow, sessionType,
) => {
  const h = createReviewHarness();
  const primary = state === "Active" ? await preparingWorkUnit(h) : await integratingWorkUnit(h);
  const boundary = projectCandidateReviewBoundary(coordinates, 2);
  if (state === "Integrating") await h.seedBoundary(primary.reference.owner, boundary);
  let refused = true;
  // A ref read whose record objects are missing refuses in this shape.
  const refusal = { code: "state-unresolvable" as const, class: "recoverable" as const, historyRefs: [],
    reference: recordReferences["review/candidate"](primary.reference.owner),
    condition: "The stored record's objects are missing.",
    remedy: { text: "Restore or fetch the missing record objects, then retry the read." } };
  const base = h.store;
  const store: Store = { capabilities: base.capabilities, list: input => base.list(input), write: input => base.write(input),
    batch: input => base.batch(input), version: () => base.version(), history: input => base.history(input),
    changes: input => base.changes(input), lookup: input => base.lookup(input), push: input => base.push(input),
    pull: input => base.pull(input), maintain: () => base.maintain(),
    read: async input => refused && input.reference.kind === "review/candidate"
      ? { status: "refused", refusal } : base.read(input) };
  const status = await boundStatus(primary, store);
  const unavailable = expect.stringMatching(/Candidate authority for meta-example\.md is unavailable/u);
  expect(await status.full()).toMatchObject({ candidates: [{ integrationBoundary: null }], warnings: [unavailable] });
  expect(await status.session()).toMatchObject({ resolution: "single", sessionType: null,
    currentWorkflow: workflow, integrationBoundary: null, warnings: [unavailable] });
  refused = false;
  expect(await status.session()).toMatchObject({ sessionType, integrationBoundary: boundary, warnings: [] });
});

it("recovers the publication reservation from the stored Integrating boundary in full and session-init status", async () => {
  const h = createReviewHarness();
  const primary = await integratingWorkUnit(h);
  const reservation = createStandardReviewReservation({ candidateId: coordinates.candidateId, sourceId: "codex-pr",
    repository: "arc-framework/example", headSha: "b".repeat(40), obligation: { obligation: "required",
      reasons: ["sensitive-change-set"], rubricVersion: "standard-review/v1", rubricDigest: canonicalDigest({ rubric: 1 }),
      retrigger: "full-final", count: 1 } });
  const readinessBinding = canonicalDigest({ readiness: 1 });
  await h.seedBoundary(primary.reference.owner, IntegrationBoundaryLocusV2Schema.parse({
    ...boundaryV2Fixture("candidate-publish-ready"), ...coordinates, reservation, readinessBinding }));
  const recovered = IntegrationBoundaryLocusV2Schema.parse({ schemaVersion: 2, mode: "integration-boundary", ...coordinates,
    locus: "publication-pending", nextAction: { kind: "continue-publication", command: "git push -u origin feat/example",
      interactionText: "Resume publication at the idempotent push, then resolve or open the change request." },
    reservation, terminus: null, readinessBinding });
  const status = await boundStatus(primary, h.store);
  expect(await status.full()).toMatchObject({ candidates: [{ integrationBoundary: recovered }], warnings: [] });
  expect(await status.session()).toMatchObject({ sessionType: "integration", integrationBoundary: recovered, warnings: [] });
});

it("keeps the Integrating boundary in full and session-init status while Candidate applicability awaits authority", async () => {
  const h = createReviewHarness();
  const primary = await integratingWorkUnit(h);
  const boundary = projectCandidateReviewBoundary(coordinates, 2);
  await h.seedBoundary(primary.reference.owner, boundary);
  const status = await boundStatus(primary, h.store, projectCandidateApplicabilityDecision);
  expect(await status.full()).toMatchObject({ candidates: [{ integrationBoundary: boundary }], warnings: [] });
  expect(await status.session()).toMatchObject({ resolution: "single", sessionType: "integration",
    currentWorkflow: "integrate-work-unit", integrationBoundary: boundary, warnings: [] });
});

it("leaves Active prepublication unresolved while Candidate applicability awaits authority", async () => {
  const h = createReviewHarness();
  const primary = await preparingWorkUnit(h);
  const status = await boundStatus(primary, h.store, projectCandidateApplicabilityDecision);
  expect(await status.session()).toMatchObject({ resolution: "single", sessionType: null,
    currentWorkflow: "prepare-work-unit", integrationBoundary: null,
    warnings: [expect.stringMatching(/Candidate target for meta-example\.md requires request-authority/u)] });
});

it("refuses the Integrating boundary in full and session-init status when it names another subject", async () => {
  const h = createReviewHarness();
  const primary = await integratingWorkUnit(h);
  await h.seedBoundary(primary.reference.owner,
    projectCandidateReviewBoundary({ ...coordinates, candidateSubjectDigest: staleSubject }, 2));
  const status = await boundStatus(primary, h.store, projectCandidateApplicabilityDecision);
  const mismatch = expect.stringMatching(/Candidate boundary for meta-example\.md does not match its durable Candidate subject/u);
  expect(await status.full()).toMatchObject({ candidates: [{ integrationBoundary: null }], warnings: [mismatch] });
  expect(await status.session()).toMatchObject({ resolution: "single", sessionType: null,
    currentWorkflow: "integrate-work-unit", integrationBoundary: null, warnings: [mismatch] });
});
