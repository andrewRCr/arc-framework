/** Creation fields persist through the store and do not touch checkout artifact files. */
import { describe, expect, it } from "vitest";
import type { StoreRecord } from "../../../../src/lib/store/read.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { SlugSchema, ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { runStub } from "../../../../src/lib/work-unit/verbs/stub.js";
import type { ExecuteTransitionContext } from "../../../../src/lib/work-unit/lifecycle-executor.js";
import { parseMetaRecord } from "../../../../src/lib/active/meta-reader.js";

function context() {
  const h = createLifecycleHarness();
  const executor: ExecuteTransitionContext = {
    cwd: "/repo", store: h.store,
    indexFs: { readdir: async () => { throw Error("no checkout inventory"); }, readFile: async () => { throw Error("no checkout meta"); } },
    setPhase: async () => ({ phase: "Planning" }), relocateArtifacts: async () => ({ moved: [] }), reconcileBranch: async () => { throw Error("no branch"); },
    reconcileWorkUnitWorktree: async () => { throw Error("stub occupies no checkout"); },
    writeSoftFields: async () => {}, writeBranchField: async () => {}, writeCurrentWorkflowField: async () => {}, writeDesignField: async () => {},
  };
  return { ...h, ctx: { executor, fs: { mkdir: async () => { throw Error("no directories"); }, writeFile: async () => { throw Error("no files"); } } } };
}
describe("store stub", () => {
  it.each(["planned", "provisional"] as const)("creates a %s stub with explicit creation fields", async (commitment) => {
    const h = context();
    expect(await runStub(h.ctx, { name: "demo", commitment, priority: "P1", owner: "starter", cls: "Novel", origin: "#42", design: "draft-demo.md" })).toMatchObject({ status: "scaffolded" });
    const lookup = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("demo") }));
    const read = lifecycleSuccess(await h.store.read({ reference: lookup.reference }));
    expect(read.placement).toEqual({ kind: "backlog", commitment });
    expect(parseMetaRecord(read.content)).toMatchObject({ owner: "starter", priority: "P1", workClass: "Novel", design: ["draft-demo.md"], origin: "#42", branch: null });
    expect(read.links?.branches ?? []).toEqual([]);
  });
  it("retains the requires-planned boundary for a provisional cohort member", async () => {
    const h = context();
    expect(await runStub(h.ctx, { name: "demo", commitment: "provisional", priority: "P1", owner: "starter", cohort: "cohort" })).toMatchObject({ status: "rejected", reason: expect.stringContaining("requires") });
    expect(lifecycleSuccess(await h.store.list({ family: "work-item" })).status).toBe("absent");
  });
});

it("creates a fresh stub at absent position when a completed owner holds its current name", async () => {
  const h = context(), archived = await h.seedMeta("demo", { state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const result = await runStub(h.ctx, { name: "demo", commitment: "planned", priority: "P1", owner: "starter", cls: "Light" });
  expect(result).toMatchObject({ status: "scaffolded", outcome: { from: null } });
  const selected = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("demo") }));
  expect(selected.reference.owner).not.toEqual(archived.reference.owner);
  expect(lifecycleSuccess(await h.store.read({ reference: selected.reference })).placement).toEqual({ kind: "backlog", commitment: "planned" });
  expect(lifecycleSuccess(await h.store.read({ reference: archived.reference }))).toEqual(archived);
});

it.each(["live-unit", "live-cohort", "completed-errand", "completed-former"] as const)("refuses %s before any stub write with creation's remedy", async kind => {
  const h = context();
  let record: StoreRecord;
  if (kind === "live-cohort") record = await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "demo" })),
    "# Cohort: demo\n\n**Purpose:** Coordinate work.\n");
  else if (kind === "completed-errand") record = await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "demo" })),
    JSON.stringify({ version: 3, slug: "demo", claimId: "a".repeat(32), createdAt: "2026-10-24T00:00:00Z", updatedAt: "2026-10-24T00:00:00Z",
      owner: "test-user", kind: "errand", purpose: "errand", intent: "Useful work", branch: "chore/demo", origin: "description",
      originEntry: null, state: "open", savedHead: null, changeRequest: null }), { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  else record = await h.seedMeta("demo", kind === "completed-former" ? { state: "Shipped", currentWorkflow: null } : {},
    kind === "completed-former" ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } : { kind: "active" });
  if (kind === "completed-former") {
    lifecycleSuccess(await h.store.write({ ...recordPut(record), action: "put", content: record.content.replaceAll("demo", "current"), reference: { ...record.reference, owner: { ...record.reference.owner, name: SlugSchema.parse("current") } },
      provenance: { verb: "rename", lifecycleAction: "rename" } }));
    record = lifecycleSuccess(await h.store.read({ reference: record.reference }));
  }
  const before = lifecycleSuccess(await h.store.version());
  const result = await runStub(h.ctx, { name: "demo", commitment: "planned", priority: "P1", owner: "starter", cls: "Light" });
  expect(result).toMatchObject({ status: "rejected", reason: expect.stringMatching(/choose another name/iu) });
  if (result.status !== "rejected") throw new Error("Expected no creation");
  expect(result.reason).toContain(record.reference.owner.name);
  if (record.reference.owner.type === "person" || record.reference.owner.uid === undefined) throw new Error("Expected holder UUID");
  expect(result.reason).toContain(record.reference.owner.uid);
  expect(/wait/iu.test(result.reason)).toBe(kind.startsWith("live"));
  expect(result.reason).not.toMatch(/rename/iu);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

it("prints the slug-edge write refusal's remedy and leaves both generations unchanged", async () => {
  const h = context(), archived = await h.seedMeta("demo", { state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const dependent = await h.seedMeta("dependent", { dependsOn: ["demo"] });
  const before = lifecycleSuccess(await h.store.version());
  const result = await runStub(h.ctx, { name: "demo", commitment: "planned", priority: "P1", owner: "starter", cls: "Light" });
  expect(result).toMatchObject({ status: "rejected", reason: expect.stringContaining("Depends On edges in `dependent`") });
  if (result.status !== "rejected") throw new Error("Expected the live dependent to hold creation");
  expect(result.reason).toContain("arc wu reconcile --apply");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: archived.reference }))).toEqual(archived);
  expect(lifecycleSuccess(await h.store.read({ reference: dependent.reference }))).toEqual(dependent);
});
