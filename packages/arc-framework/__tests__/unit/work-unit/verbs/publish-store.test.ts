/** Publication preserves Candidate authority and atomic record ordering off branch. */
import { describe, expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { writeMetaPause } from "../../../../src/lib/store/kinds/meta/writers.js";
import { ParsedMetaRecordSchema } from "../../../../src/lib/active/meta-schema.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { runPublish, type PublishParams } from "../../../../src/lib/work-unit/verbs/publish.js";
import { buildStoreCurrentWuReconcile } from "../../../../src/lib/work-unit/store-current-wu-reconcile.js";
import type { ExecuteTransitionContext } from "../../../../src/lib/work-unit/lifecycle-executor.js";
import type { Store } from "../../../../src/lib/store/contract.js";
const candidateId = `sha256:${"a".repeat(64)}` as const, candidateSubjectDigest = `sha256:${"b".repeat(64)}` as const;
function context(store: Store) {
  const forbidden = async (): Promise<never> => { throw new Error("tracked artifact access"); };
  const ctx: ExecuteTransitionContext = { cwd: "/repo", store, indexFs: { readdir: forbidden, readFile: forbidden },
    setPhase: forbidden, relocateArtifacts: forbidden, reconcileBranch: forbidden, reconcileWorkUnitWorktree: forbidden,
    writeSoftFields: forbidden, writeBranchField: forbidden, writeDesignField: forbidden, writeCurrentWorkflowField: forbidden };
  return { ...ctx, currentWuReconcile: buildStoreCurrentWuReconcile(store) };
}
function parameters(check: () => Promise<void>): PublishParams {
  return { name: "example", candidateId, candidateSubjectDigest, candidateCurrent: true,
    refreshCandidateAuthorization: async () => { await check(); return { candidateId, candidateSubjectDigest, candidateCurrent: true }; },
    readStandardLaneOwnerVersion: async () => 0, claimPublicationBoundary: check,
    boundary: { schemaVersion: 1, mode: "pre-publication-review", workUnit: SlugSchema.parse("example"), candidateId,
      candidateSubjectDigest, locus: "candidate-publish-ready", standardLaneOwnerVersion: 0,
      nextAction: { kind: "publish-candidate", command: "arc publish example --json", interactionText: "Publish" },
      policy: null, reservation: null, terminus: null, deliveryReviewTermini: [] } };
}
describe("store publish", () => {
  it("applies reconcile before renewed authorization and claim, then publishes without deriving Last Completed", async () => {
    const h = createLifecycleHarness();
    await h.seedMeta("done", { state: "Integrating", currentWorkflow: "integrate-work-unit" });
    const primary = await h.seedMeta("example", { candidateId, dependsOn: ["done"], lastCompleted: null }, { kind: "active" },
      { branches: [{ repository: "project", ref: "feat/example", linkedAs: "created", excluded: [] }] });
    let checks = 0;
    const result = await runPublish(context(h.store), parameters(async () => {
      const meta = ParsedMetaRecordSchema.parse(lifecycleSuccess(await h.store.read({ reference: primary.reference })).fields);
      expect(meta.state).toBe("Active"); expect(meta.dependsOn).toEqual([]); checks++;
    }));
    expect(result.status).toBe("published"); expect(checks).toBe(2);
    const meta = ParsedMetaRecordSchema.parse(lifecycleSuccess(await h.store.read({ reference: primary.reference })).fields);
    expect(meta).toMatchObject({ state: "Integrating", currentWorkflow: "integrate-work-unit", lastCompleted: null, nextTask: null });
    if (result.status === "published") expect(result.boundary).toMatchObject({ nextAction: { kind: "continue-publication" } });
  });
});

it("paused publication returns the store-backed resume action before reconcile writes", async () => {
  const h = createLifecycleHarness(); const primary = await h.seedMeta("example", { candidateId });
  lifecycleSuccess(await h.store.write({ action: "put", reference: primary.reference, expected: primary.version, placement: { kind: "active" },
    content: writeMetaPause(primary.content, { pausedBy: SlugSchema.parse("test-user"), since: "2026-10-14T00:00:00Z", reason: "Wait.", waitsOn: null, resumeNotes: null, open: false }),
    provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const paused = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
  let checkpoints = 0;
  expect(await runPublish(context(h.store), parameters(async () => { checkpoints++; }))).toMatchObject({ status: "rejected", remedy: { argv: ["arc", "resume", "example"] } });
  expect(checkpoints).toBe(0);
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference }))).toEqual(paused);
});
it("preserves a missing primary's store refusal and recovery action", async () => {
  const h = createLifecycleHarness();
  expect(await runPublish(context(h.store), parameters(async () => {}))).toMatchObject({ status: "rejected", refusal: { code: "not-found", remedy: { text: expect.any(String) } } });
});
it("a rerun after reconcile lands reaches the publication batch and preserves ignored legacy orientation", async () => {
  const h = createLifecycleHarness(); await h.seedMeta("done", { state: "Integrating", currentWorkflow: "integrate-work-unit" });
  const primary = await h.seedMeta("example", { candidateId, dependsOn: ["done"], lastCompleted: "Old completed work", nextTask: "Old pointer" }, { kind: "active" },
    { branches: [{ repository: "project", ref: "feat/example", linkedAs: "created", excluded: [] }] });
  let claims = 0;
  const params = { ...parameters(async () => {}), lastCompleted: "Accepted but unwritten override",
    claimPublicationBoundary: async () => { if (++claims === 1) throw new Error("interrupted claim"); } };
  expect(await runPublish(context(h.store), params)).toMatchObject({ status: "rejected" });
  const reconciled = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
  expect(ParsedMetaRecordSchema.parse(reconciled.fields)).toMatchObject({ state: "Active", dependsOn: [] });
  const result = await runPublish(context(h.store), params);
  expect(result.status).toBe("published");
  expect(ParsedMetaRecordSchema.parse(lifecycleSuccess(await h.store.read({ reference: primary.reference })).fields))
    .toMatchObject({ state: "Integrating", lastCompleted: "Old completed work", nextTask: "Old pointer" });
  expect(claims).toBe(2);
});

it("preserves the resume remedy when a pause arrives after prepare, then publishes after resume", async () => {
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("example", { candidateId }, { kind: "active" },
    { branches: [{ repository: "project", ref: "feat/example", linkedAs: "created", excluded: [] }] });
  const ctx = context(h.store), apply = ctx.currentWuReconcile.apply;
  let pauseOnce = true, claims = 0;
  ctx.currentWuReconcile.apply = async (prepared) => {
    if (pauseOnce) {
      pauseOnce = false;
      lifecycleSuccess(await h.store.write({ action: "put", reference: primary.reference, expected: primary.version,
        placement: { kind: "active" }, content: writeMetaPause(primary.content, { pausedBy: SlugSchema.parse("test-user"),
          since: "2026-10-15T00:00:00Z", reason: "Wait.", waitsOn: null, resumeNotes: null, open: false }),
        provenance: { verb: "pause", lifecycleAction: "pause" } }));
    }
    return apply(prepared);
  };
  const params = { ...parameters(async () => {}), claimPublicationBoundary: async () => { claims++; } };
  expect(await runPublish(ctx, params)).toMatchObject({ status: "reconcile-failed", reason: "paused",
    remedy: { argv: ["arc", "resume", "example"] } });
  const paused = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
  expect(paused.fields).toMatchObject({ state: "Active", pause: expect.any(Object) });
  expect(claims).toBe(0);
  lifecycleSuccess(await h.store.write({ action: "put", reference: paused.reference, expected: paused.version,
    placement: { kind: "active" }, content: writeMetaPause(paused.content, null),
    provenance: { verb: "resume", lifecycleAction: "resume" } }));
  expect(await runPublish(ctx, params)).toMatchObject({ status: "published" });
  expect(claims).toBe(1);
});
