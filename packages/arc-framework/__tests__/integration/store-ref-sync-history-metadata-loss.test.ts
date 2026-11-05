/** A pull holds historical label decoding on lost metadata and resumes after exact object restoration. */
import { describe, expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("historical label metadata loss in %s", layout => {
  it("holds an edit/removal merge for object restoration, then completes the same pull", async () => {
    const h = await refSyncFixture(layout), provenance = { verb: "save", lifecycleAction: "save" };
    const primary = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "labelled" } }),
      content: makeMetaFixture("labelled", { owner: "andrew" }), placement: { kind: "active" },
      provenance: { verb: "start", lifecycleAction: "activate" } }));
    const reference = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: primary.reference.owner, key: "selected" });
    success(await h.a.store.write({ action: "put", expected: null, reference, content: "original\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const home = expandStoredPath(reference), parent = (await h.b.git(["rev-parse", home.ref])).stdout.trim();
    const removed = (await capturedEntries(h.b, home.ref)).filter(entry => entry.path !== home.path);
    const remoteScope = h.b.gitDir ? [`--git-dir=${h.b.gitDir}`] : [];
    const metadata = (await h.b.ports.rawExec([...remoteScope, "cat-file", "blob", `${parent}:${home.metadataPath}`])).stdout;
    const historicalBytes = Buffer.concat([metadata, Buffer.from("\n")]);
    const ancestor = await plantRef(h.b.root, home.ref, removed.map(entry => entry.path === home.metadataPath
      ? { path: entry.path, content: historicalBytes } : entry), { parents: [parent], gitDir: h.b.gitDir });
    const latest = await plantRef(h.b.root, home.ref, removed, { parents: [ancestor.tip], gitDir: h.b.gitDir });
    await h.b.git(["push", h.remoteName, `${latest.tip}:${home.ref}`]);
    const local = success(await h.a.store.read({ reference }));
    success(await h.a.store.write({ action: "put", reference, expected: local.version, content: "local edit\n", provenance }));
    const tip = (await h.a.git(["rev-parse", home.ref])).stdout.trim(), oid = ancestor.blobs.get(home.metadataPath);
    if (!oid) throw new Error("Expected distinct historical metadata");
    let lost = false;
    const store = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
      const result = await h.a.ports.exec(command, args, options);
      if (!lost && args.includes("fetch")) { await removeLooseObject(h.a.root, oid, h.a.gitDir); lost = true; }
      return result;
    } });
    const pulled = success(await store.pull());
    expect(pulled.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({
      kind: "namespace-corrupt", ref: home.ref, condition: expect.stringContaining("unavailable locally"),
      remedy: { text: expect.stringMatching(/restore|fetch/iu) },
    }));
    expect((await h.a.git(["rev-parse", home.ref])).stdout.trim()).toBe(tip);
    expect(success(await h.a.store.read({ reference })).content).toBe("local edit\n");
    const localScope = h.a.gitDir ? [`--git-dir=${h.a.gitDir}`] : [];
    await expect(h.a.ports.exec("git", [...localScope, "cat-file", "-e", oid])).rejects.toThrow();
    const restored = await h.a.ports.rawExec([...localScope, "hash-object", "-w", "--stdin"], { input: historicalBytes });
    expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
    const continued = success(await store.pull());
    expect(continued.pulls.flatMap(({ notices }) => notices).filter(({ kind }) => kind === "namespace-corrupt")).toEqual([]);
    expect((await h.a.git(["rev-parse", home.ref])).stdout.trim()).not.toBe(tip);
    expect(await h.a.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  }, 60_000);
});
