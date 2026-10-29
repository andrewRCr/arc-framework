/** Conflict labels require readable whole namespaces at every historical state they use. */
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConflictRecordSchema, createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("historical conflict labels in %s", layout => {
  it.each(["missing", "malformed"] as const)("holds an edit/removal merge after %s metadata was repaired forward", async damage => {
    const h = await refSyncFixture(layout), provenance = { verb: "save", lifecycleAction: "save" };
    const primary = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "labelled" } }),
      content: makeMetaFixture("labelled", { owner: "andrew" }), placement: { kind: "active" },
      provenance: { verb: "start", lifecycleAction: "activate" } }));
    const reference = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: primary.reference.owner, key: "selected" });
    success(await h.a.store.write({ action: "put", expected: null, reference, content: "original\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const home = expandStoredPath(reference), parent = (await h.b.git(["rev-parse", home.ref])).stdout.trim();
    const intact = await capturedEntries(h.b, home.ref);
    const removed = intact.filter(entry => entry.path !== home.path);
    const broken = await plantRef(h.b.root, home.ref, removed
      .filter(entry => damage !== "missing" || entry.path !== home.metadataPath)
      .map(entry => entry.path === home.metadataPath ? { path: entry.path, content: "not metadata" } : entry),
    { parents: [parent], gitDir: h.b.gitDir });
    const repaired = await plantRef(h.b.root, home.ref, removed, { parents: [broken.tip], gitDir: h.b.gitDir });
    await h.b.git(["push", h.remoteName, `${repaired.tip}:${home.ref}`]);
    const before = success(await h.a.store.read({ reference }));
    success(await h.a.store.write({ action: "put", reference, expected: before.version, content: "local edit\n", provenance }));
    const local = (await h.a.git(["rev-parse", home.ref])).stdout;
    for (let attempt = 0; attempt < 2; attempt++) {
      const pulled = success(await h.a.store.pull());
      expect(pulled.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: home.ref,
        remedy: { text: expect.stringMatching(/historical|ancestor/iu) } }));
      expect((await h.a.git(["rev-parse", home.ref])).stdout).toBe(local);
      expect(success(await h.a.store.read({ reference })).content).toBe("local edit\n");
    }
    // Restore the authentic lineage of states, then publish the same removal with a healthy ancestor.
    const restored = await plantRef(h.b.root, home.ref, removed, { parents: [parent], gitDir: h.b.gitDir });
    await h.b.git(["push", `--force-with-lease=${home.ref}:${repaired.tip}`, h.remoteName, `${restored.tip}:${home.ref}`]);
    // The explicit history restoration also restores the last healthy publication basis under an exact lease.
    const tracking = home.ref.replace("refs/arc/", `refs/arc-remotes/${h.remoteName}/`);
    await h.a.git(["update-ref", tracking, parent, repaired.tip]);
    const continued = success(await h.a.store.pull());
    expect(continued.pulls.flatMap(({ notices }) => notices).filter(({ kind }) => kind === "namespace-corrupt")).toEqual([]);
    expect(await h.a.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const listed = success(await h.a.store.list({ family: "work-item", kind: "work-item/conflict-record" }));
    const conflicts = "records" in listed ? listed.records : [];
    expect(conflicts).toHaveLength(1);
    const clash = ConflictRecordSchema.parse(JSON.parse(success(await h.a.store.read({ reference: conflicts[0]!.reference })).content));
    expect(clash).toMatchObject({ record: reference, current: { value: null }, incoming: { value: { content: "local edit\n" } } });
    expect((await h.a.git(["rev-parse", home.ref])).stdout).not.toBe(local);
    const pushed = success(await h.a.store.push());
    expect(pushed.publishes.filter(({ status }) => status === "failed"), JSON.stringify(pushed)).toEqual([]);
  }, 60_000);
});

describe.each(["default", "separate"] as const)("a conflict label over a missing intermediate tree in %s", layout => {
  it("holds the merge instead of failing the pull, and labels it once the tree is restored", async () => {
    const h = await refSyncFixture(layout), provenance = { verb: "save", lifecycleAction: "save" };
    const primary = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "walked" } }),
      content: makeMetaFixture("walked", { owner: "andrew" }), placement: { kind: "active" },
      provenance: { verb: "start", lifecycleAction: "activate" } }));
    const reference = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: primary.reference.owner, key: "selected" });
    success(await h.a.store.write({ action: "put", expected: null, reference, content: "original\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const home = expandStoredPath(reference), remote = success(await h.b.store.read({ reference }));
    success(await h.b.store.write({ action: "put", reference, expected: remote.version, content: "remote edit\n", provenance }));
    const intermediate = (await h.b.git(["rev-parse", `${home.ref}^{tree}`])).stdout.trim();
    success(await h.b.store.write({ action: "remove", reference, expected: success(await h.b.store.read({ reference })).version, provenance }));
    success(await h.b.store.push());
    const local = success(await h.a.store.read({ reference }));
    success(await h.a.store.write({ action: "put", reference, expected: local.version, content: "local edit\n", provenance }));
    const tip = (await h.a.git(["rev-parse", home.ref])).stdout;
    const object = join(h.a.root, ".git", ...layout === "separate" ? ["arc", "store"] : [], "objects", intermediate.slice(0, 2), intermediate.slice(2));
    let saved: Buffer | undefined;
    const store = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
      const result = await h.a.ports.exec(command, args, options);
      if (!saved && args.includes("fetch")) { saved = await readFile(object); await unlink(object); }
      return result;
    } });
    try {
      const pulled = success(await store.pull());
      expect(pulled.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: home.ref }));
      expect((await h.a.git(["rev-parse", home.ref])).stdout).toBe(tip);
    } finally { if (saved) await writeFile(object, saved, { mode: 0o444 }); }
    const continued = success(await store.pull());
    expect(continued.pulls.flatMap(({ notices }) => notices).filter(({ kind }) => kind === "namespace-corrupt")).toEqual([]);
    expect((await h.a.git(["rev-parse", home.ref])).stdout).not.toBe(tip);
  }, 60_000);
});
