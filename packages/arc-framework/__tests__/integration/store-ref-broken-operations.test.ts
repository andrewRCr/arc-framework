import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";
import { makeGitExec } from "../helpers/integration.js";

describe("operations around a damaged item ref", () => {
  it.each(["metadata", "root", "tip"] as const)("contains %s damage and restores readable state", async (damage) => {
    const f = await createRefFixture(), git = makeGitExec(f.root);
    const record = await seed(f, f.reference("work-item/meta"));
    const other = await seed(f, f.reference("work-item/meta", "two"));
    const from = success(await f.store.version());
    if (record.reference.owner.type !== "work-item") throw new Error("Expected work-item owner");
    const ref = `refs/arc/work/${record.reference.owner.uid}`, path = `metadata-${record.reference.owner.uid}.json`;
    const parent = (await git("git", ["rev-parse", ref])).stdout;
    const metadata = (await git("git", ["show", `${parent}:${path}`])).stdout;
    const entries = [{ path: `meta-${record.reference.owner.name}.md`, content: record.content }];
    const broken = await plantRef(f.root, ref, damage === "metadata" ? entries : [...entries, { path, content: metadata }], { parents: [parent] });
    const oid = damage === "tip" ? broken.tip : broken.tree;
    const object = damage === "metadata" ? null : (await f.ports.rawExec(["cat-file", damage === "tip" ? "commit" : "tree", oid])).stdout;
    if (object) await removeLooseObject(f.root, oid);
    const damaged = success(await f.store.version());
    for (const result of [await f.store.read({ reference: record.reference }), await f.store.history({ reference: record.reference }),
      await f.store.write(update(f, record))]) {
      expect(result).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", namespace: ref,
        remedy: { text: expect.stringMatching(damage === "metadata" ? /forward.*metadata/iu : /restore|fetch/iu) } } });
    }
    expect(await f.store.changes({ from, to: damaged, references: [record.reference] })).toMatchObject({ status: "refused", refusal:
      damage === "tip" ? { code: "state-unresolvable", remedy: { text: expect.stringMatching(/restore|fetch/iu) } }
        : { code: "namespace-corrupt", namespace: ref } });
    success(await f.store.write(update(f, other)));
    expect(success(await f.store.read({ reference: other.reference })).content).toBe(f.content(other.reference, "changed"));
    if (object) {
      await f.ports.rawExec(["hash-object", "-w", "-t", damage === "tip" ? "commit" : "tree", "--stdin"], { input: object });
      expect((await git("git", ["rev-parse", ref])).stdout).toBe(broken.tip);
      expect(success(await f.store.history({ reference: record.reference })).length).toBeGreaterThan(0);
      success(await f.store.changes({ from, to: damaged, references: [record.reference] }));
    } else {
      await plantRef(f.root, ref, [...entries, { path, content: metadata }], { parents: [broken.tip] });
      expect(await f.store.read({ reference: record.reference, asOf: damaged })).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt" } });
      const repaired = success(await f.store.version());
      for (const result of [await f.store.history({ reference: record.reference }), await f.store.changes({ from, to: repaired, references: [record.reference] })]) {
        expect(result).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", namespace: ref,
          remedy: { text: expect.stringMatching(/historical|ancestor/iu) } } });
      }
      success(await f.store.write(update(f, record)));
      const after = success(await f.store.version());
      expect(success(await f.store.changes({ from: repaired, to: after, references: [record.reference] }))).toHaveLength(1);
    }
    expect(success(await f.store.read({ reference: record.reference })).reference).toEqual(record.reference);
    expect(success(await f.store.list({ family: "work-item" }))).toMatchObject({ status: "complete", missed: false });
    expect(success(await f.store.lookup({ kind: "slug", slug: record.reference.owner.name }))).toEqual({ reference: record.reference });
  });
});
