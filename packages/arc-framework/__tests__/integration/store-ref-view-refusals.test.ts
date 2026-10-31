/** Checked and saved reads preserve the difference between empty and unavailable captured trees. */
import { describe, expect, it } from "vitest";
import type { StoreRecord, StoreResult } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";

describe.each(["default", "separate"] as const)("captured read refusals in %s", layout => {
  it.each(["empty", "unavailable"] as const)("classifies an %s tree in saved and checked reads", async mode => {
    let armed = false;
    const checked: StoreResult<StoreRecord>[] = [];
    const f = await createRefFixture({ "personal/document": { check: async ({ before, after }) => {
      if (armed) checked.push(await before.read({ reference: record.reference }), await after.read({ reference: record.reference }));
      return [];
    } } }, layout);
    const record = await seed(f, f.reference("work-item/meta"));
    const control = await seed(f, f.reference("personal/document"));
    const home = expandStoredPath(record.reference, { registry: f.ports.registry });
    const args = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const tip = (await f.ports.exec("git", [...args, "rev-parse", home.ref])).stdout.trim();
    if (mode === "empty") await plantRef(f.root, home.ref, [], { parents: [tip], gitDir: f.gitDir });
    const saved = success(await f.store.version());
    const tree = (await f.ports.exec("git", [...args, "rev-parse", `${home.ref}^{tree}`])).stdout.trim();
    const bytes = (await f.ports.rawExec([...args, "cat-file", "tree", tree])).stdout;
    if (mode === "unavailable") await removeLooseObject(f.root, tree, f.gitDir);
    expect(await f.store.read({ reference: record.reference, asOf: saved })).toMatchObject({ status: "refused", refusal: {
      code: mode === "empty" ? "not-found" : "state-unresolvable",
    } });
    armed = true;
    success(await f.store.write(update(f, control)));
    expect(checked).toHaveLength(2);
    for (const result of checked) {
      expect(result).toMatchObject({ status: "refused", refusal: { code: mode === "empty" ? "not-found" : "namespace-corrupt" } });
      if (mode === "unavailable" && result.status === "refused") {
        expect(result.refusal.condition).toMatch(/unavailable/iu);
        expect(result.refusal.remedy.text).toMatch(/restore|fetch/iu);
      }
    }
    if (mode === "unavailable") {
      await f.ports.rawExec([...args, "hash-object", "-w", "-t", "tree", "--stdin"], { input: bytes });
      expect(success(await f.store.read({ reference: record.reference, asOf: saved }))).toEqual(record);
    }
  });
});
