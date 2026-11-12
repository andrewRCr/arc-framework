import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";

describe.each(["default", "separate"] as const)("project restrictions on saved changes in %s", layout => {
  it.each(["name", "uid"] as const)("refuses another project %s and permits the actual project on retry", async field => {
    const f = await createRefFixture({}, layout);
    await seed(f, f.reference("project-registry/identity"));
    const record = await seed(f, f.reference("project-registry/counter")), from = await f.settle();
    success(await f.store.write(update(f, record)));
    const to = await f.settle();
    const foreign = RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner,
      ...field === "name" ? { name: "another-project" } : { uid: "ffffffff-ffff-4fff-8fff-ffffffffffff" } } });
    expect(await f.store.changes({ from, to, references: [foreign] })).toMatchObject({ status: "refused", refusal: { code: "identity-mismatch" } });
    expect(success(await f.store.changes({ from, to, references: [record.reference] }))).toEqual([
      expect.objectContaining({ reference: record.reference, content: f.content(record.reference, "changed") }),
    ]);
  });

  it("reads a personal-only interval beside an unrelated malformed project identity", async () => {
    const f = await createRefFixture({}, layout);
    await seed(f, f.reference("project-registry/identity"));
    const personal = await seed(f, f.reference("personal/document"), "Before personal edit.\n"), from = await f.settle();
    success(await f.store.write(update(f, personal, "After personal edit.\n")));
    const ref = "refs/arc/project/registry";
    const before = (await f.ports.exec("git", [...f.gitDir ? [`--git-dir=${f.gitDir}`] : [], "rev-parse", ref], { cwd: f.root })).stdout.trim();
    const entries = await capturedEntries(f, ref);
    await plantRef(f.root, ref, entries.map(entry => entry.path === "identity.json" ? { path: entry.path, content: "{ invalid\n" } : entry),
      { parents: [before], gitDir: f.gitDir });
    const to = await f.settle();
    expect(await f.store.changes({ from, to })).toMatchObject({ status: "refused" });
    expect(await f.store.changes({ from, to, references: [personal.reference] })).toMatchObject({ status: "ok", result: [
      expect.objectContaining({ reference: personal.reference, content: "After personal edit.\n" }),
    ] });
  });
});
