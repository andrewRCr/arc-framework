/** Unattributed archive-root entries remain visible beside healthy owner folders. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4"), ref = `refs/arc/archive/${quarter}`;
const families = ["work-item", "cohort", "review"] as const;

describe.each(["default", "separate"] as const)("unattributed archive entries in %s", layout => {
  it.each(["blob", "symlink", "gitlink", "empty-tree"] as const)("preserves healthy folders and reports a root %s in every captured view", async shape => {
    const path = `orphan-${shape}`, key = `${ref}:${path}`;
    const diagnostic = { kind: "malformed", key, condition: expect.stringContaining(key) };
    let armed = false, checked = false;
    const f = await createRefFixture({ "personal/document": { check: async ({ before, after }) => {
      if (!armed) return [];
      for (const view of [before, after]) for (const family of families) {
        expect(success(await view.list({ family }))).toMatchObject({ status: "complete", missed: true,
          diagnostics: expect.arrayContaining([expect.objectContaining(diagnostic)]) });
      }
      checked = true;
      return [];
    } } }, layout);
    const trigger = await seed(f, f.reference("personal/document"));
    const records = [];
    for (const kind of ["work-item/meta", "cohort/document"] as const) {
      const record = await seed(f, f.reference(kind));
      success(await f.store.write({ ...update(f, record), placement: { kind: "completed", quarter } }));
      records.push(success(await f.store.read({ reference: record.reference })));
    }
    const peer = f.remote(true);
    if (!peer) throw new Error("Expected fixture peer");
    success(await f.store.push());
    success(await peer.pull());
    const scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const parent = (await f.ports.exec("git", [...scope, "rev-parse", ref])).stdout.trim();
    const entries = await capturedEntries(f, ref);
    const empty = await plantRef(f.root, "refs/arc/tmp/root-fixture", [], { gitDir: f.gitDir });
    const orphan: PlantTreeEntry = shape === "empty-tree" ? { path, oid: empty.tree, mode: "040000" }
      : shape === "gitlink" ? { path, oid: parent, mode: "160000" }
        : { path, content: "Unattributed retained entry\n", mode: shape === "symlink" ? "120000" : "100644" };
    const broken = await plantRef(f.root, ref, [...entries, orphan], { parents: [parent], gitDir: f.gitDir });
    const asOf = await f.settle();
    for (const family of families) {
      const listing = success(await f.store.list({ family }));
      expect(listing).toMatchObject({ status: "complete", missed: true,
        diagnostics: expect.arrayContaining([expect.objectContaining(diagnostic)]) });
      if (listing.status === "complete" && family !== "review") expect(listing.records).toHaveLength(1);
    }
    for (const record of records) for (const saved of [false, true]) {
      expect(await f.store.read({ reference: record.reference, ...saved ? { asOf } : {} }))
        .toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", condition: expect.stringContaining(key) } });
    }
    expect(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("definitely-absent") }))
      .toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", condition: expect.stringContaining(key) } });
    await f.ports.exec("git", [...scope, "push", layout === "separate" ? "backing" : "origin", `${broken.tip}:${ref}`]);
    expect(success(await peer.pull()).pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({
      kind: "namespace-corrupt", ref, condition: expect.stringContaining(key) }));
    for (const record of records) expect(success(await peer.read({ reference: record.reference })).content).toBe(record.content);
    armed = true;
    success(await f.store.write(update(f, trigger, "Prepared view inspected\n")));
    expect(checked).toBe(true);
    armed = false;
    const repaired = await plantRef(f.root, ref, entries, { parents: [broken.tip], gitDir: f.gitDir });
    for (const family of families) {
      expect(success(await f.store.list({ family }))).toMatchObject({ status: "complete", missed: false, diagnostics: [] });
      expect(success(await f.store.list({ family, asOf }))).toMatchObject({ status: "complete", missed: true,
        diagnostics: expect.arrayContaining([expect.objectContaining({ ...diagnostic,
          remedy: { text: expect.stringMatching(/historical|ancestor/iu) } })]) });
    }
    for (const record of records) expect(success(await f.store.read({ reference: record.reference })).content).toBe(record.content);
    await f.ports.exec("git", [...scope, "push", layout === "separate" ? "backing" : "origin", `${repaired.tip}:${ref}`]);
    expect(success(await peer.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
  });
});
