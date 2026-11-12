import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";

describe.each(["default", "separate"] as const)("stray lifecycle refs in %s", layout => {
  it("contains a damaged quarter without interpreting or changing out-of-grammar live/history refs", async () => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("stray-neighbor"),
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "stray-neighbor" } }),
      placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "start" } }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const home = expandStoredPath(made.reference), current = success(await h.a.store.read({ reference: made.reference }));
    const strayRefs = ["work", "cohort"].flatMap(family => ["", "history/"].flatMap(history => [
      `refs/arc/${history}${family}/AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA`,
      `refs/arc/${history}${family}/unknown`,
    ]));
    const held = (await h.b.git(["rev-parse", home.ref])).stdout.trim();
    for (const ref of strayRefs) await h.b.git(["update-ref", ref, held]);
    const strayBefore = (await h.b.git(["for-each-ref", "--format=%(refname) %(objectname)", ...strayRefs])).stdout;
    const other = RecordReferenceSchema.parse({ kind: "personal/document", key: "independent.md", owner: { type: "person", name: "andrew" } });
    success(await h.a.store.batch({ writes: [
      { action: "put", reference: current.reference, expected: current.version, content: current.content,
        placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } },
      { action: "put", reference: other, expected: null, content: "Independent archive batch.\n" },
    ], provenance: { verb: "archive", lifecycleAction: "archive" } }));
    const archive = "refs/arc/archive/2026-q4", history = home.ref.replace("refs/arc/", "refs/arc/history/");
    const good = (await h.a.git(["rev-parse", archive])).stdout.trim();
    const rows = (await h.a.git(["ls-tree", "-r", "--format=%(objectname) %(path)", archive])).stdout.trim().split("\n");
    const entries = rows.map(row => ({ oid: row.slice(0, 40), path: row.slice(41), mode: "100644" as const }));
    const broken = await plantRef(h.a.root, archive, entries.map(entry => entry.path.endsWith(`/${home.metadataPath}`)
      ? { path: entry.path, content: "{ invalid metadata\n" } : entry), { gitDir: h.a.gitDir, parents: [good] });
    await h.a.git(["push", "--atomic", h.remoteName, `${archive}:${archive}`, `${history}:${history}`, `:${home.ref}`,
      "refs/arc/user/andrew/personal:refs/arc/user/andrew/personal"]);
    const notices = success(await h.b.store.pull()).pulls.flatMap(row => row.notices);
    expect(notices).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: archive }));
    expect(notices.some(row => "ref" in row && strayRefs.includes(row.ref))).toBe(false);
    expect(success(await h.b.store.read({ reference: other })).content).toBe("Independent archive batch.\n");
    expect((await h.b.git(["for-each-ref", "--format=%(refname) %(objectname)", ...strayRefs])).stdout).toBe(strayBefore);
    const repaired = await plantRef(h.a.root, archive, entries, { gitDir: h.a.gitDir, parents: [broken.tip] });
    await h.a.git(["push", h.remoteName, `${archive}:${archive}`]);
    expect(success(await h.b.store.pull()).pulls.flatMap(row => row.notices)).toEqual([]);
    expect((await h.remote("git", ["rev-parse", archive])).stdout.trim()).toBe(repaired.tip);
    expect(success(await h.b.store.read({ reference: made.reference })).placement?.kind).toBe("completed");
    expect((await h.b.git(["for-each-ref", "--format=%(refname) %(objectname)", ...strayRefs])).stdout).toBe(strayBefore);
  });
});
