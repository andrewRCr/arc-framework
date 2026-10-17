import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4"), provenance = { verb: "archive", lifecycleAction: "archive" };

async function archivedFixture(layout: "default" | "separate", lineage: boolean) {
  const h = await refSyncFixture(layout);
  const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("own-move"),
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "own-move" } }),
    placement: { kind: "active" }, provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const transition = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: made.reference.owner });
  const lineageContent = JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2,
    origin: { name: made.reference.owner.name, uid: "uid" in made.reference.owner ? made.reference.owner.uid : undefined },
    kind: "abandon", successors: [], incoming: [] }));
  if (lineage) success(await h.a.store.write({ action: "put", reference: transition, expected: null, content: lineageContent, provenance }));
  const before = success(await h.a.store.read({ reference: made.reference }));
  success(await h.a.store.write({ action: "put", reference: before.reference, expected: before.version,
    content: before.content, placement: { kind: "completed", quarter }, provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const reopen = async (side: typeof h.a) => {
    const closed = success(await side.store.read({ reference: made.reference }));
    success(await side.store.write({ action: "put", reference: closed.reference, expected: closed.version,
      content: closed.content, placement: { kind: "active" }, provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
  };
  if (!("uid" in made.reference.owner)) throw new Error("The item needs a UID");
  const live = `refs/arc/work/${made.reference.owner.uid}`, history = live.replace("refs/arc/", "refs/arc/history/");
  return { ...h, reference: made.reference, transition, lineageContent, reopen, live, history };
}

describe.each(["default", "separate"] as const)("own unpublished lifecycle in the %s layout", (layout) => {
  it.each([false, true])("does not revive an undone unpublished archive when another machine's later end reopens (lineage: %s)", async (lineage) => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("undone"),
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "undone" } }),
      placement: { kind: "active" }, provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const place = async (side: typeof h.a, kind: "active" | "completed") => {
      const current = success(await side.store.read({ reference: made.reference }));
      success(await side.store.write({ action: "put", reference: current.reference, expected: current.version,
        content: current.content, placement: kind === "active" ? { kind } : { kind, quarter }, provenance }));
    };
    await place(h.a, "completed"); await place(h.a, "active");
    await place(h.b, "completed"); success(await h.b.store.push()); success(await h.a.store.pull());
    if (lineage) {
      success(await h.b.store.write({ action: "put", expected: null,
        reference: RecordReferenceSchema.parse({ kind: "lineage/transition", owner: made.reference.owner }),
        content: JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: made.reference.owner.name,
          uid: "uid" in made.reference.owner ? made.reference.owner.uid : undefined }, kind: "abandon", successors: [], incoming: [] })), provenance }));
      success(await h.b.store.push()); success(await h.a.store.pull());
    }
    await place(h.b, "active"); success(await h.b.store.push()); success(await h.a.store.pull());
    expect(success(await h.a.store.read({ reference: made.reference })).placement).toEqual({ kind: "active" });
    success(await h.a.store.push());
    if (!("uid" in made.reference.owner)) throw new Error("The item needs a UID");
    const live = `refs/arc/work/${made.reference.owner.uid}`, history = live.replace("refs/arc/", "refs/arc/history/");
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", live])).stdout).toBe(live);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", history])).stdout).toBe("");
  });
  it.each(["archive", "abandon"] as const)("keeps its own unpublished %s after a reopen against a published reopen", async (end) => {
    const h = await archivedFixture(layout, false);
    await h.reopen(h.a); await h.reopen(h.b);
    const current = success(await h.a.store.read({ reference: h.reference }));
    if (end === "archive") success(await h.a.store.write({ action: "put", reference: current.reference,
      expected: current.version, content: current.content, placement: { kind: "completed", quarter }, provenance }));
    else success(await h.a.store.batch({ writes: [
      { action: "put", reference: h.transition, expected: null, content: h.lineageContent },
      { action: "remove", reference: current.reference, expected: current.version },
    ], provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
    success(await h.b.store.push());
    const publishedLive = (await h.remote("git", ["rev-parse", h.live])).stdout;
    expect(success(await h.a.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", h.live])).stdout).toBe("");
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", h.history])).stdout).toBe(h.history);
    const publishedEnd = (await h.remote("git", ["rev-parse", h.history])).stdout;
    await h.a.git(["merge-base", "--is-ancestor", publishedLive, publishedEnd]);
    if (end === "archive") expect(success(await h.a.store.read({ reference: h.reference })).placement?.kind).toBe("completed");
    else expect(await h.a.store.read({ reference: h.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });
  it("keeps its own unpublished reopen against lineage beside the older archive", async () => {
    const h = await archivedFixture(layout, true);
    await h.reopen(h.a);
    success(await h.a.store.push());
    expect(success(await h.a.store.read({ reference: h.reference })).placement).toEqual({ kind: "active" });
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", h.live])).stdout).toBe(h.live);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", h.history])).stdout).toBe("");
  });

  it.each([
    { sibling: false, reopenMode: "own" }, { sibling: true, reopenMode: "own" },
    { sibling: false, reopenMode: "remote" }, { sibling: true, reopenMode: "remote" },
  ])("applies a later abandon after a $reopenMode reopen with a sibling fetch $sibling", async ({ sibling, reopenMode }) => {
    const h = await archivedFixture(layout, false);
    if (reopenMode === "own") { await h.reopen(h.a); await h.reopen(h.b); }
    else { await h.reopen(h.b); success(await h.b.store.push()); success(await h.a.store.pull()); }
    const current = success(await h.b.store.read({ reference: h.reference }));
    success(await h.b.store.batch({ writes: [
      { action: "put", reference: h.transition, expected: null, content: h.lineageContent },
      { action: "remove", reference: current.reference, expected: current.version },
    ], provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
    success(await h.b.store.push());
    if (sibling) await h.a.git(["fetch", "--no-tags", h.remoteName,
      `${h.history}:refs/arc-remotes/${h.remoteName}/${h.history.slice("refs/arc/".length)}`]);
    const outcome = success(await h.a.store.push());
    expect(outcome.publishes.every(({ status }) => status !== "failed")).toBe(true);
    expect(await h.a.store.read({ reference: h.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", h.live])).stdout).toBe("");
    expect((await h.a.git(["for-each-ref", "--format=%(refname)", h.live])).stdout).toBe("");
    if (reopenMode === "own") {
      expect((await h.a.git(["ls-tree", "-r", "--name-only", h.history])).stdout).toContain("conflicts/");
      const before = (await h.b.git(["rev-parse", h.history])).stdout;
      const guarded = createRefStore({ ...h.b.ports, exec: async (command, args, options) => args.includes("fetch")
        && args.some((arg) => arg.startsWith(`${h.history}*:`))
        ? h.b.ports.exec("git", ["fetch", `${h.origin}/missing-origin`], options) : h.b.ports.exec(command, args, options) });
      const pull = success(await guarded.pull());
      expect(pull.pulls.every(({ status }) => status !== "failed")).toBe(true);
      expect(pull.pulls.flatMap(({ notices }) => notices).some(({ kind }) => kind === "end-pending")).toBe(false);
      expect((await h.b.git(["rev-parse", h.history])).stdout).toBe(before);
    }
  });
});
