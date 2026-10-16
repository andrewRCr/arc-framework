/** Exact terminal snapshots govern ref-set cleanup and retained checkout coordinates. */
import { describe, expect, it } from "vitest";
import { createRetirementHarness as fixture, retirementLink as link } from "../../../helpers/store/retirement-harness.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { writeLineageRecord, parseLineageRecord } from "../../../../src/lib/store/kinds/lineage/index.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { runTeardown } from "../../../../src/lib/work-unit/verbs/teardown.js";
describe("store retirement ref sets", () => {
  it("discards a created branch locally and remotely on abandonment lineage", async () => {
    const h = await fixture(); expect(await runTeardown(h.ctx, { name: "demo", base: "main" })).toMatchObject({ status: "torn-down", branchDeleted: true, remoteBranchDeleted: true });
    expect([...h.refs.keys()]).not.toContain("refs/heads/feat/demo"); expect([...h.refs.keys()]).not.toContain("refs/remotes/origin/feat/demo"); expect([...h.refs.keys()]).not.toContain("remote/feat/demo");
  });
  it.each(["archive", "decompose"] as const)("reaps a landed created branch after %s", async (end) => {
    const h = await fixture({ end }); expect(await runTeardown(h.ctx, { name: "demo", base: "main" })).toMatchObject({ status: "torn-down", branchDeleted: true, remoteBranchDeleted: true });
    expect(h.refs.has("refs/heads/feat/demo")).toBe(false);
  });
  it("keeps an unlanded remote while its upstream preserves the local archive branch", async () => {
    const h = await fixture({ end: "archive", unlanded: true }); expect(await runTeardown(h.ctx, { name: "demo", base: "main" })).toMatchObject({ status: "torn-down", branchDeleted: true, remoteBranchDeleted: false });
    expect(h.refs.has("remote/feat/demo")).toBe(true);
  });
  it.each([false, true])("reaps only a promoted Errand ref with no work beyond base and the retiring head, own work=%s", async (secondaryOwnWork) => {
    const h = await fixture({ branches: [link("chore/demo"), link()], secondaryOwnWork });
    expect(await runTeardown(h.ctx, { name: "demo", base: "main" })).toMatchObject({ status: "torn-down" });
    expect(h.refs.has("refs/heads/chore/demo")).toBe(secondaryOwnWork); expect(h.refs.has("refs/remotes/origin/chore/demo")).toBe(secondaryOwnWork);
    expect(h.refs.has("remote/chore/demo")).toBe(true);
  });
  it.each(["archive", "abandon"] as const)("keeps adopted branches and their checkout after %s", async (end) => {
    const h = await fixture({ end, branches: [link("feat/demo", "adopted")], held: true });
    const result = await runTeardown(h.ctx, { name: "demo", base: "main" });
    expect(result).toMatchObject({ status: "torn-down", branchDeleted: false, notices: expect.arrayContaining([expect.stringContaining("git switch"), expect.stringContaining("git branch -D feat/demo")]) });
    expect(h.refs.has("refs/heads/feat/demo")).toBe(true); expect(h.state().current).toBe("feat/demo");
  });
  it("returns a clean anchored holder to base before deleting its created branch", async () => {
    const h = await fixture({ held: true }); expect(await runTeardown(h.ctx, { name: "demo", base: "main" })).toMatchObject({ status: "torn-down", branchDeleted: true });
    expect(h.state().current).toBe("main");
  });
  it("keeps a dirty anchored checkout on its branch and reports the changed path", async () => {
    const h = await fixture({ held: true, dirty: true }); const result = await runTeardown(h.ctx, { name: "demo", base: "main" });
    expect(result).toMatchObject({ status: "torn-down", branchDeleted: false, notices: expect.arrayContaining([expect.stringContaining("personal.txt")]) });
    expect(h.state().current).toBe("feat/demo"); expect(h.refs.has("refs/heads/feat/demo")).toBe(true);
  });
  it("refuses legacy lineage lacking an explicit snapshot before deleting any ref", async () => {
    const h = await fixture({ noSnapshot: true }); expect(await runTeardown(h.ctx, { name: "demo", base: "main" })).toMatchObject({ status: "rejected", reason: expect.stringContaining("retiredBranches") });
    expect(h.state().mutations).toEqual([]);
  });
  it("retries successfully after an operator supplies the trusted exact missing terminal snapshot", async () => {
    const h = await fixture({ noSnapshot: true });
    expect(await runTeardown(h.ctx, { name: "demo", base: "main" })).toMatchObject({ status: "rejected", reason: expect.stringContaining("trusted pre-transition") });
    const terminal = lifecycleSuccess(await h.store.read({ reference: recordReferences["lineage/transition"](h.meta.reference.owner) }));
    const lineage = parseLineageRecord(terminal.content);
    if (lineage === null) throw Error("terminal fixture must decode");
    lifecycleSuccess(await h.store.write({ action: "put", reference: terminal.reference, expected: terminal.version,
      content: writeLineageRecord({ ...lineage, retiredBranches: [link()] }), provenance: { verb: "repair-lineage", lifecycleAction: "repair-lineage" } }));
    expect(await runTeardown(h.ctx, { name: "demo", base: "main" })).toMatchObject({ status: "torn-down", branchDeleted: true, remoteBranchDeleted: true });
    const repaired = lifecycleSuccess(await h.store.read({ reference: terminal.reference }));
    expect(await h.store.write({ action: "put", reference: repaired.reference, expected: repaired.version,
      content: writeLineageRecord({ ...lineage, retiredBranches: [] }), provenance: { verb: "repair-lineage", lifecycleAction: "repair-lineage" } })).toMatchObject({ status: "refused" });
  });
  it("refuses a live primary even when terminal lineage was seeded beside it", async () => {
    const h = await fixture({ ended: false });
    lifecycleSuccess(await h.store.write({ action: "put", reference: recordReferences["lineage/transition"](h.meta.reference.owner), expected: null,
      content: writeLineageRecord({ schemaVersion: 2, origin: { name: h.meta.reference.owner.name }, kind: "abandon", successors: [], incoming: [], retiredBranches: [link()] }), provenance: { verb: "seed-lifecycle", lifecycleAction: "create" } }));
    expect(await runTeardown(h.ctx, { name: "demo", base: "main" })).toMatchObject({ status: "rejected", reason: expect.stringContaining("has not ended") });
    expect(h.state().mutations).toEqual([]);
  });

  it("preserves typed ordinary teardown retry arguments after a transient remote cleanup failure", async () => {
    const h = await fixture(), original = h.ctx.exec;
    h.ctx.exec = (command, args, options) => args[0] === "push" ? Promise.reject(Error("injected remote failure")) : original(command, args, options);
    expect(await runTeardown(h.ctx, { name: "demo", base: "main" })).toMatchObject({ status: "rejected", remedy: { argv: ["arc", "teardown", "demo"] } });
    h.ctx.exec = original;
    expect(await runTeardown(h.ctx, { name: "demo", base: "main" })).toMatchObject({ status: "torn-down", branchDeleted: true });
  });

});
