/** Archive readers use completed placement and repository-qualified lookup rather than numbered folders. */
import { expect, it } from "vitest";
import { analyzeOrphanBranchesSnapshot } from "../../../../src/lib/session-init/orphan-branch-sweep.js";
import { readStoreCompletedEvidence } from "../../../../src/lib/store/lifecycle-completed.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { serializeTransientIdentityRecord, TransientIdentityRecordSchema } from "../../../../src/lib/errand/identity-record.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../../../src/lib/kernel/index.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { resolveCompletedCandidateWorkUnits } from "../../../../src/handlers/candidate-mutation-owner.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaTitle } from "../../../../src/lib/store/kinds/meta/writers.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed } from "../../../helpers/store/suite-tools.js";
import { parseMetaRecord } from "../../../../src/lib/active/meta-reader.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import type { Store } from "../../../../src/lib/store/contract.js";

it("reports the latest archive's metadata regardless of insertion order", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("shared", { state: "Shipped", currentWorkflow: null, prUrl: "https://github.com/org/repo/pull/42" },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  await h.seedMeta("shared", { state: "Shipped", currentWorkflow: null, prUrl: "https://github.com/org/repo/pull/43" },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q3") });
  const evidence = await readStoreCompletedEvidence(h.store);
  expect(evidence.status).toBe("available");
  if (evidence.status === "unavailable") throw new Error("Expected completed evidence");
  expect(evidence.records.get("shared")?.prNumber).toBe(42);
});

it.each([false, true])("withholds completed and Candidate authority from a live holder's name (former: %s)", async former => {
  const h = createLifecycleHarness();
  await h.seedMeta("shared", { state: "Shipped", currentWorkflow: null }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const live = await h.seedMeta("shared");
  if (former) lifecycleSuccess(await h.store.write({ ...recordPut(live, { content: writeMetaTitle(live.content, SlugSchema.parse("renamed")) }),
    reference: { ...live.reference, owner: OwnerIdentitySchema.parse({ ...live.reference.owner, name: "renamed" }) },
    provenance: { verb: "rename", lifecycleAction: "rename" } }));
  expect(await readStoreCompletedEvidence(h.store)).toEqual({ status: "available", records: new Map() });
  expect(await resolveCompletedCandidateWorkUnits("/memory", h.store)).toEqual([]);
});

it("omits a withheld live name while preserving the completed listing's available status", async () => {
  const f = createReferenceFixture(), reference = f.reference("work-item/meta");
  const fields = parseMetaRecord(makeMetaFixture(reference.owner.name, { state: "Shipped" }));
  await seed(f, reference, JSON.stringify(fields), { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  await seed(f, reference, JSON.stringify({ ...fields, state: "Unknown" }), { kind: "active" });
  expect(await readStoreCompletedEvidence(f.store)).toEqual({ status: "available", records: new Map() });
});

it.each(["refused", "unreadable"] as const)("retains an unavailable live listing even with no completed records: %s", async failure => {
  const h = createLifecycleHarness(), store = Object.create(h.store) as Store;
  store.list = async input => {
    if (!input.filter?.locations?.includes("active")) return h.store.list(input);
    return failure === "refused"
      ? { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "work-item",
        condition: "Live inventory unavailable.", remedy: { text: "Repair the live inventory." } } }
      : { status: "ok", result: { status: "unreadable", condition: "Live inventory unavailable.", remedy: { text: "Repair the live inventory." } } };
  };
  expect(await readStoreCompletedEvidence(store)).toEqual({ status: "unavailable", reason: "archive-tree-read-failed" });
});
it("finds the completed work unit and its metadata through placement alone", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("shipped", { state: "Shipped", currentWorkflow: null, completed: "2026-10-15T00:00:00Z", prUrl: "https://github.com/org/repo/pull/42" },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  await h.seedMeta("active");
  const evidence = await readStoreCompletedEvidence(h.store);
  expect(evidence.status).toBe("available");
  if (evidence.status === "unavailable") throw new Error("Expected completed inventory");
  expect([...evidence.records.values()]).toEqual([{ slug: "shipped", completedAt: "2026-10-15T00:00:00Z", prUrl: "https://github.com/org/repo/pull/42", prNumber: 42 }]);
});

it("identifies an orphan's completed work unit through its qualified link", async () => {
  const h = createLifecycleHarness(), base = "a".repeat(40);
  await h.seedMeta("shipped", { state: "Shipped", currentWorkflow: null }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
    { branches: [{ repository: "project", ref: "topic/unrelated-spelling", linkedAs: "created", excluded: [] }] });
  h.store.environment.identity = "alice";
  const owner = OwnerIdentitySchema.parse({ type: "person", name: "alice" });
  await h.seed(recordReferences["claims/groom"](owner, "groom-unrelated"), serializeTransientIdentityRecord(TransientIdentityRecordSchema.parse({
    version: 3, kind: "groom", slug: "groom-unrelated", claimId: "b".repeat(32),
    createdAt: "2026-10-15T00:00:00Z", updatedAt: "2026-10-15T00:00:00Z", anchorStub: "unrelated", members: ["unrelated"],
    openedBaseHead: base, protection: "full", branch: "chore/groom-unrelated", state: "open", changeRequest: null,
  })));
  const { exec } = scriptGitExec([
    { match: { prefix: ["cherry"] }, responses: [{ stdout: "" }] },
    { match: { prefix: ["rev-list", "--min-parents=2"] }, responses: [{ stdout: "" }] },
  ]);
  const result = await analyzeOrphanBranchesSnapshot({ store: h.store, identity: "alice", projectId: async () => "project", branches: ["topic/unrelated-spelling"], baseBranch: "main",
    remoteSyncEnabled: true, snapshot: { kind: "available", scope: "all-heads", tips: { main: base } }, objectAvailability: { kind: "complete", commits: { [base]: true } }, history: { kind: "complete" },
    exec });
  expect(result.orphans[0]).toMatchObject({ shippedWorkUnit: "shipped", actions: [{ argv: ["arc", "teardown", "shipped"] }] });
});
