/** Archive readers use completed placement and repository-qualified lookup rather than numbered folders. */
import { expect, it } from "vitest";
import { analyzeOrphanBranchesSnapshot } from "../../../../src/lib/session-init/orphan-branch-sweep.js";
import { readStoreCompletedEvidence } from "../../../../src/lib/store/lifecycle-completed.js";
import { createLifecycleHarness } from "../../../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { serializeTransientIdentityRecord, TransientIdentityRecordSchema } from "../../../../src/lib/errand/identity-record.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
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
  const result = await analyzeOrphanBranchesSnapshot({ store: h.store, identity: "alice", projectId: async () => "project", branches: ["topic/unrelated-spelling"], baseBranch: "main",
    remoteSyncEnabled: true, snapshot: { kind: "available", scope: "all-heads", tips: { main: base } }, objectAvailability: { kind: "complete", commits: { [base]: true } }, history: { kind: "complete" },
    exec: async (_command, args) => { expect(args[0]).toBe("cherry"); return { stdout: "" }; } });
  expect(result.orphans[0]).toMatchObject({ shippedWorkUnit: "shipped", actions: [{ argv: ["arc", "teardown", "shipped"] }] });
});
