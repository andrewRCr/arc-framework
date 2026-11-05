/** Compared name and lineage restrictions retain recoverable object loss before owner selection. */
import { describe, expect, it } from "vitest";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("change restriction object loss in %s", layout => {
  it.each(["name", "lineage"] as const)("restores the compared tip before resolving a %s restriction", async restriction => {
    const f = await createRefFixture({}, layout), record = await seed(f, f.reference("work-item/meta"));
    const from = await f.settle();
    success(await f.store.write(update(f, record)));
    const reference = RecordReferenceSchema.parse({ kind: restriction === "name" ? "work-item/meta" : "lineage/transition",
      owner: { type: "work-item", name: record.reference.owner.name } });
    const input = { from, to: await f.settle(), references: [reference] }, home = expandStoredPath(record.reference);
    const args = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const tip = (await f.ports.exec("git", [...args, "rev-parse", home.ref])).stdout.trim();
    const bytes = (await f.ports.rawExec([...args, "cat-file", "commit", tip])).stdout;
    await removeLooseObject(f.root, tip, f.gitDir);
    expect(await f.store.changes(input)).toMatchObject({ status: "refused", refusal: {
      code: "state-unresolvable", class: "recoverable", historyRefs: [], remedy: { text: expect.stringMatching(/restore|fetch/iu) },
    } });
    const restored = await f.ports.rawExec([...args, "hash-object", "-t", "commit", "-w", "--stdin"], { input: bytes });
    expect(Buffer.from(restored.stdout).toString().trim()).toBe(tip);
    const result = success(await f.store.changes(input));
    if (restriction === "name") expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ reference: record.reference })]));
    else expect(result).toEqual([]);
  });
});
