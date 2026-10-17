import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { runStoreRename } from "../../src/lib/work-unit/verbs/rename-store.js";

async function archivedFixture(layout: "default" | "separate") {
  const h = await refSyncFixture(layout), quarter = ArchiveQuarterSchema.parse("2026-q4");
  const made = success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "before" }, kind: "work-item/meta" }),
    content: makeMetaFixture("before", { state: "Shipped", currentWorkflow: null }), placement: { kind: "completed", quarter },
    provenance: { verb: "archive", lifecycleAction: "archive" } }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  if (!("uid" in made.reference.owner) || !made.reference.owner.uid) throw new Error("The primary requires a UID");
  const history = `refs/arc/history/work/${made.reference.owner.uid}`;
  expect((await h.b.git(["for-each-ref", "--format=%(refname)", history])).stdout).toBe("");
  return { ...h, reference: made.reference, history, quarter,
    ctx: { store: h.b.store, cwd: h.b.root, exec: h.b.exec, baseBranch: "main" } };
}

describe.each(["default", "separate"] as const)("archived rename recovery in the %s layout", (layout) => {
  it("pulls missing history by name and renames the archived folder without changing its number", async () => {
    const h = await archivedFixture(layout), before = success(await h.b.store.read({ reference: h.reference }));
    expect(await runStoreRename(h.ctx, { sourceSlug: "before", targetSlug: "after" })).toMatchObject({ status: "renamed", shape: "archived" });
    const after = success(await h.b.store.read({ reference: h.reference }));
    expect(after.reference.owner).toEqual({ ...h.reference.owner, name: "after" });
    expect(after.placement).toEqual(before.placement);
    expect((await h.b.git(["ls-tree", "--name-only", `refs/arc/archive/${h.quarter}`])).stdout).toBe("01_after");
    expect((await h.b.git(["ls-tree", "--name-only", h.history])).stdout).toContain("meta-after.md");
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout).toBe("");
  });

  it("keeps the original history refusal and all state unchanged when the remote cannot be reached", async () => {
    const h = await archivedFixture(layout);
    await h.b.git(["remote", "set-url", h.remoteName, join(h.b.root, "missing-state-remote")]);
    const before = success(await h.b.store.version());
    expect(await runStoreRename(h.ctx, { sourceSlug: "before", targetSlug: "after" })).toMatchObject({ status: "rejected",
      refusal: { code: "state-unresolvable", historyRefs: [h.history], remedy: { text: expect.any(String) } } });
    expect(success(await h.b.store.version())).toBe(before);
    expect(success(await h.b.store.read({ reference: h.reference })).reference.owner.name).toBe("before");
  });

  it("returns the retry's refusal when the remote lost its history and succeeds after the ref is restored", async () => {
    const h = await archivedFixture(layout);
    const historyTip = (await h.remote("git", ["rev-parse", h.history])).stdout.trim();
    await h.remote("git", ["update-ref", "-d", h.history]);
    const before = success(await h.b.store.version());
    expect(await runStoreRename(h.ctx, { sourceSlug: "before", targetSlug: "after" })).toMatchObject({ status: "rejected",
      refusal: { code: "state-unresolvable", historyRefs: [h.history], remedy: { text: expect.any(String) } } });
    expect(success(await h.b.store.version())).toBe(before);
    await h.remote("git", ["update-ref", h.history, historyTip]);
    expect(await runStoreRename(h.ctx, { sourceSlug: "before", targetSlug: "after" })).toMatchObject({ status: "renamed", shape: "archived" });
    expect(success(await h.b.store.read({ reference: h.reference })).reference.owner.name).toBe("after");
  });
});
