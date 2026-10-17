import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { createRefSyncCheckout, refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ConflictRecordSchema, createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";

const provenance = { verb: "save", lifecycleAction: "save" };

async function lateFixture(layout: "default" | "separate") {
  const h = await refSyncFixture(layout);
  const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("late-write"),
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "late-write" } }),
    placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  if (!("uid" in made.reference.owner)) throw new Error("The item needs a UID");
  const live = `refs/arc/work/${made.reference.owner.uid}`, history = live.replace("refs/arc/", "refs/arc/history/");
  const transition = RecordReferenceSchema.parse({ owner: made.reference.owner, kind: "lineage/transition" });
  const lineage = JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2,
    origin: { name: made.reference.owner.name, uid: made.reference.owner.uid }, kind: "abandon", successors: [], incoming: [] }));
  return { ...h, reference: made.reference, live, history, transition, lineage };
}

describe.each(["default", "separate"] as const)("late writes in the %s layout", (layout) => {
  it.each([false, true])("keeps abandonment current and reports the late conflict (local end: %s)", async (localEnd) => {
    const h = await lateFixture(layout);
    const writer = localEnd ? h.b : h.a, ender = localEnd ? h.a : h.b;
    const before = success(await writer.store.read({ reference: h.reference }));
    const late = `${before.content}\nUnpublished late write.\n`;
    const companion = RecordReferenceSchema.parse({ owner: h.reference.owner, kind: "work-item/companion", key: "late-only" });
    success(await writer.store.batch({ writes: [
      { action: "put", reference: before.reference, expected: before.version, content: late, placement: { kind: "active" } },
      { action: "put", reference: companion, expected: null, content: "Created only by the late writer.\n" },
    ], provenance }));
    const ending = success(await ender.store.read({ reference: h.reference }));
    success(await ender.store.batch({ writes: [
      { action: "put", reference: h.transition, expected: null, content: h.lineage },
      { action: "remove", reference: ending.reference, expected: ending.version },
    ], provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
    success(await h.b.store.push());
    const published = (await h.remote("git", ["rev-parse", localEnd ? h.live : h.history])).stdout;
    const pulled = success(await h.a.store.pull());
    expect(await h.a.store.read({ reference: h.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const paths = (await h.a.git(["ls-tree", "-r", "--name-only", h.history])).stdout.split("\n");
    const conflictPaths = paths.filter((path) => path.startsWith("conflicts/"));
    expect(conflictPaths).toHaveLength(1);
    const key = conflictPaths[0]!.slice("conflicts/".length, -".json".length);
    const conflict = ConflictRecordSchema.parse(JSON.parse((await h.a.git(["show", `${h.history}:${conflictPaths[0]}`])).stdout));
    expect(conflict).toMatchObject({ record: h.reference, current: { value: null }, incoming: { value: { content: late } } });
    expect(pulled.pulls.flatMap(({ notices }) => notices)).toContainEqual({ kind: "ended-with-conflicts", item: h.reference.owner,
      conflicts: [RecordReferenceSchema.parse({ owner: h.reference.owner, kind: "work-item/conflict-record", key })] });
    expect((await h.a.git(["show", `${h.history}:late-only-late-write.md`])).stdout).toBe("Created only by the late writer.");
    expect(JSON.parse(success(await h.a.store.read({ reference: h.transition })).content)).toEqual(JSON.parse(h.lineage));
    const merged = (await h.a.git(["rev-parse", h.history])).stdout;
    await h.a.git(["merge-base", "--is-ancestor", published, merged]);
    expect((await h.a.git(["for-each-ref", "--format=%(refname)", h.live])).stdout).toBe("");
    const pushed = success(await h.a.store.push());
    expect(pushed.publishes.every(({ status }) => status !== "failed")).toBe(true);
    expect((await h.remote("git", ["rev-parse", h.history])).stdout).toBe(merged);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", h.live])).stdout).toBe("");
  });
  it.each(["before push", "restored live"] as const)("keeps an archive beside a late write arriving %s", async (arrival) => {
    const h = await lateFixture(layout), quarter = ArchiveQuarterSchema.parse("2026-q4");
    const before = success(await h.a.store.read({ reference: h.reference }));
    const late = `${before.content}\nLate live write.\n`;
    success(await h.a.store.write({ action: "put", reference: before.reference, expected: before.version,
      content: late, placement: { kind: "active" }, provenance }));
    const oldLive = (await h.a.git(["rev-parse", h.live])).stdout;
    const ending = success(await h.b.store.read({ reference: h.reference }));
    const ended = `${ending.content}\nAccepted archive content.\n`;
    const end = async () => {
      success(await h.b.store.write({ action: "put", reference: ending.reference, expected: ending.version,
        content: ended, placement: { kind: "completed", quarter }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
      success(await h.b.store.push());
    };
    let armed = true;
    const writer = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
      if (armed && args.includes("push")) { armed = false; await end(); }
      return h.a.ports.exec(command, args, options);
    } });
    if (arrival === "before push") {
      const result = success(await writer.push());
      expect(result.publishes.every(({ status }) => status !== "failed")).toBe(true);
    } else {
      await end(); await h.a.git(["push", h.remoteName, `${oldLive}:${h.live}`]);
      success(await h.b.store.pull()); success(await h.b.store.push()); success(await h.a.store.pull());
    }
    const record = success(await h.a.store.read({ reference: h.reference }));
    expect(record.content).toBe(ended);
    expect(record.placement?.kind).toBe("completed");
    expect(record.conflicts).toHaveLength(1);
    const conflict = ConflictRecordSchema.parse(JSON.parse(success(await h.a.store.read({ reference: record.conflicts[0]! })).content));
    expect(conflict).toMatchObject({ current: { value: { content: ended } }, incoming: { value: { content: late } } });
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", h.live])).stdout).toBe("");
  });

  it.each([false, true])("merges an unpublished completed write through a remote reopen and new end: %s", async (endAgain) => {
    const h = await lateFixture(layout), quarter = ArchiveQuarterSchema.parse("2026-q4");
    const base = success(await h.a.store.read({ reference: h.reference }));
    success(await h.a.store.write({ action: "put", reference: base.reference, expected: base.version, content: base.content,
      placement: { kind: "completed", quarter }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const closed = success(await h.a.store.read({ reference: h.reference })), late = `${closed.content}\nUnpublished completed write.\n`;
    success(await h.a.store.write({ action: "put", reference: closed.reference, expected: closed.version, content: late,
      placement: { kind: "completed", quarter }, provenance }));
    const remote = success(await h.b.store.read({ reference: h.reference })), accepted = `${remote.content}\nPublished reopening write.\n`;
    success(await h.b.store.write({ action: "put", reference: remote.reference, expected: remote.version, content: accepted,
      placement: { kind: "active" }, provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
    if (endAgain) {
      const active = success(await h.b.store.read({ reference: h.reference }));
      success(await h.b.store.write({ action: "put", reference: active.reference, expected: active.version, content: active.content,
        placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2027-q1") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    }
    success(await h.b.store.push()); success(await h.a.store.pull());
    const merged = success(await h.a.store.read({ reference: h.reference }));
    expect(merged.content).toBe(accepted);
    expect(merged.placement?.kind).toBe(endAgain ? "completed" : "active");
    expect(merged.conflicts).toHaveLength(1);
    expect((await h.a.git(["ls-tree", "--name-only", `refs/arc/archive/${quarter}`])).stdout).toBe("");
    const conflict = ConflictRecordSchema.parse(JSON.parse(success(await h.a.store.read({ reference: merged.conflicts[0]! })).content));
    expect(conflict).toMatchObject({ current: { value: { content: accepted } }, incoming: { value: { content: late } } });
    success(await h.a.store.push());
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", endAgain ? h.live : h.history])).stdout).toBe("");
  });

  it.each(["restore", "restore batch", "remove"] as const)("refuses a companion put after a split retirement, then permits %s", async (repair) => {
    const h = await lateFixture(layout);
    const companion = RecordReferenceSchema.parse({ owner: h.reference.owner, kind: "work-item/companion", key: "survivor" });
    success(await h.a.store.write({ action: "put", reference: companion, expected: null, content: "Surviving companion.\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const primary = success(await h.a.store.read({ reference: h.reference }));
    success(await h.a.store.write({ action: "remove", reference: primary.reference, expected: primary.version,
      provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
    success(await h.b.store.write({ action: "put", reference: h.transition, expected: null, content: h.lineage,
      provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
    success(await h.a.store.push()); success(await h.b.store.push()); success(await h.a.store.pull());
    expect((await h.a.git(["for-each-ref", "--format=%(refname)", h.live])).stdout).toBe(h.live);
    const before = success(await h.a.store.read({ reference: companion }));
    const refs = (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
    expect(await h.a.store.write({ action: "put", reference: companion, expected: before.version, content: "A blocked edit.\n", provenance }))
      .toMatchObject({ status: "refused", refusal: { code: "record-malformed", reference: h.transition,
        remedy: { text: expect.stringMatching(/restore/iu) } } });
    expect((await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(refs);
    if (repair === "remove") {
      success(await h.a.store.write({ action: "remove", reference: companion, expected: before.version, provenance }));
      expect((await h.a.git(["for-each-ref", "--format=%(refname)", h.live])).stdout).toBe("");
      expect((await h.a.git(["ls-tree", "-r", h.history])).stdout).toBe("");
    } else {
      success(await h.a.store.batch({ writes: [
        { action: "put", reference: primary.reference, expected: null, content: primary.content, placement: { kind: "active" } },
        ...repair === "restore batch" ? [{ action: "put" as const, reference: companion, expected: before.version, content: "A repaired edit.\n" }] : [],
      ], provenance: { verb: "start", lifecycleAction: "activate" } }));
      expect(success(await h.a.store.read({ reference: h.reference })).content).toBe(primary.content);
      expect(success(await h.a.store.read({ reference: companion })).content).toBe(repair === "restore batch" ? "A repaired edit.\n" : before.content);
      expect((await h.a.git(["for-each-ref", "--format=%(refname)", h.history])).stdout).toBe("");
    }
  });

  it("reports retained conflicts when applying an already-merged abandonment by fast-forward", async () => {
    const h = await lateFixture(layout), root = join(h.a.root, "third-clone");
    await h.a.exec("git", ["clone", "--no-hardlinks", h.origin, root]);
    for (const [key, value] of [["arc.identity", "andrew"], ["user.name", "Third clone"], ["user.email", "third@example.com"],
      ...layout === "default" ? [["remote.origin.arc-state", "push"]] : []]) {
      await h.a.exec("git", ["-C", root, "config", key!, value!]);
    }
    const third = await createRefSyncCheckout(root, layout, h.origin);
    success(await third.store.pull());
    const current = success(await h.a.store.read({ reference: h.reference }));
    success(await h.a.store.write({ action: "put", reference: current.reference, expected: current.version,
      content: `${current.content}\nA late write.\n`, placement: { kind: "active" }, provenance }));
    const ending = success(await h.b.store.read({ reference: h.reference }));
    success(await h.b.store.batch({ writes: [
      { action: "put", reference: h.transition, expected: null, content: h.lineage },
      { action: "remove", reference: ending.reference, expected: ending.version },
    ], provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
    success(await h.b.store.push()); success(await h.a.store.push());
    const result = success(await third.store.pull());
    expect(await third.store.read({ reference: h.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const notice = result.pulls.flatMap(({ notices }) => notices).find(({ kind }) => kind === "ended-with-conflicts");
    expect(notice).toMatchObject({ kind: "ended-with-conflicts", item: h.reference.owner, conflicts: [expect.objectContaining({ kind: "work-item/conflict-record" })] });
    expect((await third.git(["rev-parse", h.history])).stdout).toBe((await h.remote("git", ["rev-parse", h.history])).stdout);
  });

});
