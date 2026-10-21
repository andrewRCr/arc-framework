/** Integration lifecycle reads derive current authority from stored metadata. */
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { readLifecycleSummary, createIntegrationCheckpointDependencies } from "../../../../src/scripts/integration/checkpoint-composition.js";
import { createReviewHarness } from "../../../helpers/store/review-harness.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { createIntegrationMergeDependencies } from "../../../../src/scripts/integration/merge-composition.js";
import { readIntegrationCheckpointComposition } from "../../../../src/scripts/integration/checkpoint-store.js";
import { composeCanonicalSettlementPlan } from "../../../../src/scripts/integration/settlement-plan.js";
import { createUserSurfaceResolver } from "../../../../src/lib/user-surfaces.js";
import { SlugSchema, canonicalDigest } from "../../../../src/lib/kernel/index.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { candidateFixture } from "../../../helpers/store/tracked-write-fixture.js";
import { TransientIdentityRecordSchema } from "../../../../src/lib/errand/identity-record.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";

async function fixture() {
  const h = createReviewHarness(), cwd = await mkdtemp(join(tmpdir(), "arc-native-lifecycle-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, ".arc/active"), { recursive: true });
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "archive.cadence: manual\n");
  await writeFile(join(cwd, ".arc/active/meta-example.md"), makeMetaFixture("example", { state: "Active" }));
  const fs = { readFile: (path: string) => readFile(path, "utf8"), readdir: (path: string) => readdir(path, { withFileTypes: true }) };
  const primary = await h.seedMeta("example", { state: "Integrating", currentWorkflow: "integrate-work-unit" });
  lifecycleSuccess(await h.store.write({ ...recordPut(primary, { content: `${primary.content}\n## Completion Notes\n\nDelivered the feature.\n` }),
    provenance: { verb: "seed-lifecycle", lifecycleAction: "edit" } }));
  return { ...h, cwd, fs, primary };
}

it("uses stored position and artifact facts while retaining the whole lifecycle snapshot version", async () => {
  const h = await fixture();
  expect(await readLifecycleSummary(h.cwd, "example", "manual", "whole-state-v1", h.fs, h.store)).toMatchObject({
    storageVersion: "whole-state-v1", state: "integrating", position: { phase: "Integrating", location: "active" },
    artifactFacts: [], complete: true,
  });
});

it.each(["not-found", "record-malformed"] as const)("represents a stored %s refusal and recovers after repair", async code => {
  const h = await fixture(), lookup = h.store.lookup.bind(h.store);
  h.store.lookup = async () => ({ status: "refused", refusal: code === "not-found"
    ? { code, class: "recoverable", lookup: { kind: "slug", slug: h.primary.reference.owner.name },
        condition: "Metadata is absent.", remedy: { text: "Restore the record." } }
    : { code, class: "recoverable", reference: h.primary.reference, rule: "meta.shape",
        condition: "Metadata is malformed.", remedy: { text: "Repair the record." } } });
  const summary = await readLifecycleSummary(h.cwd, "example", "manual", "whole-state-v1", h.fs, h.store);
  expect(summary).toMatchObject({ state: "nonexistent", position: null, complete: false });
  expect(summary.artifactFacts).toEqual(code === "not-found" ? [] : [expect.objectContaining({
    code: "malformed-artifact", message: expect.stringContaining("Metadata is malformed."),
  })]);
  h.store.lookup = lookup;
  expect(await readLifecycleSummary(h.cwd, "example", "manual", "whole-state-v1", h.fs, h.store)).toHaveProperty("complete", true);
});

async function compositionFixture() {
  const h = await fixture(), head = "a".repeat(40);
  const exec = scriptGitExec([
    { match: ["rev-parse", "--abbrev-ref", "HEAD"], responses: [{ stdout: "topic/opaque\n", stderr: "" }] },
    { match: ["rev-parse", "HEAD"], responses: [{ stdout: head, stderr: "" }] },
    { match: ["config", "--null", "--get", "arc.identity"], responses: [{ stdout: "test-user\0", stderr: "" }] },
  ]).exec;
  const lifecycleStorage = { readSnapshot: async () => ({ version: "whole-state-v1", fs: h.fs,
    metaVersion: () => "stale-projection-version" }) };
  const options = { cwd: h.cwd, exec, store: h.store, workItem: h.primary.reference.owner, lifecycleStorage };
  return { ...h, head, options };
}

it("persists the exact stored meta version the checkpoint observed", async () => {
  const h = await compositionFixture();
  await h.seedCandidate(h.primary.reference.owner, candidateFixture());
  const dependencies = createIntegrationCheckpointDependencies(h.options);
  const lifecycle = await dependencies.readLifecycle("example");
  expect(lifecycle).toMatchObject({ complete: true, storageVersion: "whole-state-v1" });
  const result = await dependencies.createHandle({ workUnit: "example", approvedHead: h.head,
    candidateTailDiff: { fromRevision: h.head, throughRevision: h.head, reference: `${h.head}..${h.head}` },
    requirementSummary: { conclusion: "satisfied", requirements: [] },
    statusSummary: { lifecycle, changeRequest: { repository: "owner/repo", pullRequest: 42,
      baseRef: "main", headRef: "topic/opaque", headSha: h.head, state: "open" }, requiredChecks: "green" },
    settlementPlan: composeCanonicalSettlementPlan([]), mergeMethod: { schemaVersion: 1,
      mode: "review-merge-method-resolve", repository: "owner/repo", stackPosition: "non-delivery", state: "validated",
      nextAction: "use-method", method: "merge", allowedMethods: ["merge"], policyFingerprint: canonicalDigest({ policy: 1 }) } });
  expect(result.status).toBe("created");
  if (result.status !== "created") throw new Error("Expected the checkpoint handle");
  const surfaces = createUserSurfaceResolver({ cwd: h.cwd, identity: SlugSchema.parse("test-user") });
  const saved = await readIntegrationCheckpointComposition(surfaces.workUnitRoot(SlugSchema.parse("example")), "example", result.handle);
  expect(saved?.lifecycleVersion).toBe(lifecycleSuccess(await h.store.read({ reference: h.primary.reference })).version);
});

it("merge observes the current stored meta version and lifecycle rather than the projection", async () => {
  const h = await compositionFixture();
  const dependencies = createIntegrationMergeDependencies({ ...h.options, workUnit: "example", changeRequestPort: {
    resolveRepository: async () => "owner/repo", readHeadRef: async () => ({ local: null, remote: h.head }),
    listByHead: async () => [{ number: 42, url: "https://github.com/owner/repo/pull/42", state: "OPEN",
      baseRefName: "main", headRefName: "topic/opaque", headRefOid: h.head }], searchByHeadSha: async () => [],
  } });
  expect(await dependencies.readStatus("example")).toMatchObject({ actualHead: h.head, lifecycleComplete: true,
    lifecycleVersion: lifecycleSuccess(await h.store.read({ reference: h.primary.reference })).version });
});

it("reports an Errand slug as malformed work-unit authority", async () => {
  const h = await fixture();
  const errand = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "repair",
    claimId: "1".repeat(32), intent: "Repair an issue", owner: "test-user", origin: "description", originEntry: null,
    branch: "chore/repair", state: "open", savedHead: null, changeRequest: null,
    createdAt: "2026-10-19T12:00:00Z", updatedAt: "2026-10-19T12:00:00Z" });
  if (errand.kind !== "errand") throw new Error("Expected an Errand");
  await h.seedErrand(errand);
  expect(await readLifecycleSummary(h.cwd, "repair", "manual", "whole-state-v1", h.fs, h.store)).toMatchObject({
    complete: false, artifactFacts: [{ code: "malformed-artifact", message: expect.stringContaining("resolves to an Errand") }],
  });
});

it("retains other store refusals with their repair instructions and succeeds after repair", async () => {
  const h = await fixture(), lookup = h.store.lookup.bind(h.store);
  h.store.lookup = async () => ({ status: "refused", refusal: { code: "namespace-corrupt", class: "terminal",
    namespace: "project-state", condition: "Metadata namespace is corrupt.", remedy: { text: "Repair the namespace, then retry." } } });
  await expect(readLifecycleSummary(h.cwd, "example", "manual", "whole-state-v1", h.fs, h.store))
    .rejects.toThrow("Metadata namespace is corrupt. Repair the namespace, then retry.");
  h.store.lookup = lookup;
  expect(await readLifecycleSummary(h.cwd, "example", "manual", "whole-state-v1", h.fs, h.store)).toHaveProperty("complete", true);
});

it("reports an unpositioned stored meta as an artifact fact and resumes after repair", async () => {
  const h = await fixture();
  const selected = lifecycleSuccess(await h.store.read({ reference: h.primary.reference }));
  const raw = [...h.store.state.records.values()].find(record => record.reference.kind === "work-item/meta");
  if (raw === undefined) throw new Error("Expected the stored meta");
  const original = raw.content;
  raw.content = original.replace("`Integrating`", "[none]");
  expect(await readLifecycleSummary(h.cwd, "example", "manual", "whole-state-v1", h.fs, h.store)).toMatchObject({
    complete: false, artifactFacts: [expect.objectContaining({ code: "malformed-artifact", message: expect.stringMatching(/state|placement/iu) })],
  });
  raw.content = selected.content;
  expect(await readLifecycleSummary(h.cwd, "example", "manual", "whole-state-v1", h.fs, h.store)).toHaveProperty("complete", true);
});
