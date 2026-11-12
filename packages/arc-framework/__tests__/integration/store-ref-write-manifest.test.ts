/** Lifecycle ends and history-only writes leave a fresh manifest anchor without changing registry records. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { retainedConflictFixture } from "../helpers/store/retained-conflicts.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { seed, success, update, mutationOf, testProvenance } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("write manifest anchors in %s", layout => {
  it.each(["missing", "empty"] as const)("keeps repeated ends usable with an initially %s registry", async initial => {
    const f = await createRefFixture({}, layout), args = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const registry = "refs/arc/project/registry";
    const first = await seed(f, f.reference("work-item/meta"));
    await f.ports.exec("git", [...args, "update-ref", "-d", registry]);
    if (initial === "empty") await plantRef(f.root, registry, [], { gitDir: f.gitDir });
    success(await f.store.write({ ...update(f, first), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    const tip = (await f.ports.exec("git", [...args, "for-each-ref", "--format=%(objectname)", registry])).stdout.trim();
    expect(tip).not.toBe("");
    const second = await seed(f, f.reference("work-item/meta", "two"));
    success(await f.store.write({ ...update(f, second), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    const next = (await f.ports.exec("git", [...args, "rev-parse", registry])).stdout.trim();
    expect(next).not.toBe(tip);
    expect((await f.ports.exec("git", [...args, "rev-parse", `${next}^{tree}`])).stdout)
      .toBe((await f.ports.exec("git", [...args, "rev-parse", `${tip}^{tree}`])).stdout);
    expect(await f.store.read({ reference: f.reference("project-registry/identity") }))
      .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    if (initial === "missing") {
      const identity = await seed(f, f.reference("project-registry/identity"));
      expect(success(await f.store.read({ reference: identity.reference }))).toEqual(identity);
    }
  });

  it("holds the registry lock through an end and admits its unchanged retry after release", async () => {
    const f = await createRefFixture({}, layout);
    const identity = await seed(f, f.reference("project-registry/identity"));
    const primary = await seed(f, f.reference("work-item/meta")), from = await f.settle();
    const write = { ...update(f, primary), placement: { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") } };
    await f.hold(identity.reference, true);
    expect(await f.store.write(write)).toMatchObject({ status: "refused", refusal: { code: "lock-held" } });
    expect(await f.settle()).toBe(from);
    await f.hold(identity.reference, false);
    success(await f.store.write(write));
    expect(await f.settle()).not.toBe(from);
  });

  it.each(["work-item/meta", "cohort/document"] as const)("moves the registry anchor when ending %s beside an unchanged registry", async kind => {
    const f = await createRefFixture({}, layout);
    const identity = await seed(f, f.reference("project-registry/identity"));
    const primary = await seed(f, f.reference(kind));
    const args = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const registry = "refs/arc/project/registry";
    const prior = (await f.ports.exec("git", [...args, "rev-parse", registry])).stdout.trim();
    const from = await f.settle();
    const landed = success(await f.store.batch({ writes: [mutationOf({ ...update(f, primary, primary.content),
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } })], provenance: testProvenance }));
    const tip = (await f.ports.exec("git", [...args, "rev-parse", registry])).stdout.trim();
    expect(tip).not.toBe(prior);
    expect((await f.ports.exec("git", [...args, "rev-parse", `${tip}^`])).stdout.trim()).toBe(prior);
    expect((await f.ports.exec("git", [...args, "rev-parse", `${tip}^{tree}`])).stdout)
      .toBe((await f.ports.exec("git", [...args, "rev-parse", `${prior}^{tree}`])).stdout);
    const message = (await f.ports.exec("git", [...args, "log", "-1", "--format=%B", registry])).stdout;
    expect(message).toContain(`Arc-Batch: ${landed.batchId}`);
    expect(message).toContain(`Arc-Owner: ${JSON.parse(identity.content).projectId}`);
    expect(await f.settle()).not.toBe(from);
    expect(success(await f.store.read({ reference: identity.reference }))).toEqual(identity);
  });

  it("moves the registry anchor for a standalone retained conflict discard", async () => {
    const h = await retainedConflictFixture(layout, "abandon");
    const reference = h.conflicts[0]!;
    const current = success(await h.a.store.history({ reference }))[0]!;
    if (!current.version) throw new Error("Expected a retained conflict version");
    const registry = "refs/arc/project/registry";
    const prior = (await h.a.git(["rev-parse", registry])).stdout.trim();
    const from = success(await h.a.store.version());
    const landed = success(await h.a.store.batch({ writes: [{ action: "remove", reference, expected: current.version,
      resolves: [reference] }], provenance: { verb: "resolve", lifecycleAction: "discard" } }));
    const to = success(await h.a.store.version());
    expect(to).not.toBe(from);
    const tip = (await h.a.git(["rev-parse", registry])).stdout.trim();
    expect(tip).not.toBe(prior);
    expect((await h.a.git(["rev-parse", `${tip}^{tree}`])).stdout)
      .toBe((await h.a.git(["rev-parse", `${prior}^{tree}`])).stdout);
    expect((await h.a.git(["log", "-1", "--format=%B", registry])).stdout).toContain(`Arc-Batch: ${landed.batchId}`);
    expect(success(await h.a.store.history({ reference }))[0]).toMatchObject({ version: null, content: null });
    expect(await h.a.store.read({ reference: h.primary })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  }, 60_000);
});
