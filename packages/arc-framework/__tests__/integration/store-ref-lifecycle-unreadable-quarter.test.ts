/** A quarter whose tree cannot be read holds every lifecycle decision rather than reading its folders as absent. */
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("an unreadable quarter tree in %s", layout => {
  it("holds an unpublished end beside a published edit until the tree is restored", async () => {
    const h = await refSyncFixture(layout), quarter = ArchiveQuarterSchema.parse("2027-q1"), archive = `refs/arc/archive/${quarter}`;
    const { reference } = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "ending-item" } }),
      content: makeMetaFixture("ending-item"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const local = success(await h.a.store.read({ reference }));
    success(await h.a.store.write({ action: "put", reference, expected: local.version, content: local.content,
      placement: { kind: "completed", quarter }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    const remote = success(await h.b.store.read({ reference }));
    success(await h.b.store.write({ action: "put", reference, expected: remote.version, content: `${remote.content}\nPublished edit.\n`,
      placement: { kind: "active" }, provenance: { verb: "edit", lifecycleAction: "save" } }));
    success(await h.b.store.push());
    const live = expandStoredPath(reference).ref, history = live.replace("refs/arc/", "refs/arc/history/");
    const tree = (await h.a.git(["rev-parse", `${archive}^{tree}`])).stdout.trim();
    const object = join(h.a.root, ".git", ...layout === "separate" ? ["arc", "store"] : [], "objects", tree.slice(0, 2), tree.slice(2));
    const saved = await readFile(object), ended = (await h.a.git(["rev-parse", history])).stdout.trim();
    await unlink(object);
    try {
      const notices = success(await h.a.store.pull()).pulls.flatMap(outcome => outcome.notices);
      expect(notices).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: archive }));
      expect((await h.a.git(["for-each-ref", "--format=%(refname)", live])).stdout).toBe("");
      expect((await h.a.git(["rev-parse", history])).stdout.trim()).toBe(ended);
    } finally { await writeFile(object, saved, { mode: 0o444 }); }
    const repaired = success(await h.a.store.pull()).pulls.flatMap(outcome => outcome.notices);
    expect(repaired.filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
    expect(success(await h.a.store.read({ reference })).placement).toMatchObject({ kind: "completed", quarter });
  }, 30_000);
});

describe.each(["default", "separate"] as const)("an unreadable incoming quarter tree in %s", layout => {
  it("holds a competing unpublished end until the published quarter's tree is restored", async () => {
    const h = await refSyncFixture(layout), own = ArchiveQuarterSchema.parse("2027-q1"), published = ArchiveQuarterSchema.parse("2026-q4");
    const { reference } = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "twice-ending-item" } }),
      content: makeMetaFixture("twice-ending-item"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    for (const [side, quarter] of [[h.a, own], [h.b, published]] as const) {
      const current = success(await side.store.read({ reference }));
      success(await side.store.write({ action: "put", reference, expected: current.version, content: current.content,
        placement: { kind: "completed", quarter }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    }
    success(await h.b.store.push());
    const archive = `refs/arc/archive/${published}`, tree = (await h.b.git(["rev-parse", `${archive}^{tree}`])).stdout.trim();
    const object = join(h.a.root, ".git", ...layout === "separate" ? ["arc", "store"] : [], "objects", tree.slice(0, 2), tree.slice(2));
    const history = expandStoredPath(reference).ref.replace("refs/arc/", "refs/arc/history/");
    const ended = (await h.a.git(["rev-parse", history])).stdout.trim();
    let saved: Buffer | undefined;
    const store = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
      const result = await h.a.ports.exec(command, args, options);
      if (!saved && args.includes("fetch")) { saved = await readFile(object); await unlink(object); }
      return result;
    } });
    try {
      const notices = success(await store.pull()).pulls.flatMap(outcome => outcome.notices);
      expect(notices).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: archive }));
      expect(notices.filter(notice => notice.kind === "end-withdrawn" || notice.kind === "ended-twice")).toEqual([]);
      expect((await h.a.git(["rev-parse", history])).stdout.trim()).toBe(ended);
    } finally { if (saved) await writeFile(object, saved, { mode: 0o444 }); }
    const repaired = success(await store.pull()).pulls.flatMap(outcome => outcome.notices);
    expect(repaired).toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: reference.owner }));
    expect(success(await store.read({ reference })).placement).toMatchObject({ kind: "completed", quarter: published });
  }, 30_000);
});
