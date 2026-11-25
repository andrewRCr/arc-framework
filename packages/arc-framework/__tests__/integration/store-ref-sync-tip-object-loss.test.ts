import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";

const provenance = { verb: "edit", lifecycleAction: "save" };

describe.each(["default", "separate"] as const)("sync tip object loss in %s", layout => {
  it("holds a missing incoming tree, applies independent state, and resumes after exact restoration", async () => {
    const h = await refSyncFixture(layout);
    const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "tip.md", owner: { type: "person", name: "andrew" } });
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "Original tip.\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const original = success(await h.a.store.read({ reference }));
    const home = expandStoredPath(reference), kept = (await h.b.git(["rev-parse", home.ref])).stdout.trim();
    success(await h.a.store.write({ action: "put", reference, expected: original.version, content: "Incoming tip.\n", provenance }));
    const tree = (await h.a.git(["rev-parse", `${home.ref}^{tree}`])).stdout.trim();
    expect(tree).not.toBe((await h.b.git(["rev-parse", `${home.ref}^{tree}`])).stdout.trim());
    const independent = RecordReferenceSchema.parse({ kind: "project-inbox/inbox", owner: { type: "project", name: "project" } });
    const content = "# Atomic Inbox\n\n## Inbox\n\nIndependent publication.\n";
    success(await h.a.store.write({ action: "put", reference: independent, expected: null, content, provenance }));
    success(await h.a.store.push());
    await h.b.git(["config", "fetch.unpackLimit", "100000"]);
    const object = join(h.b.gitDir ?? join(h.b.root, ".git"), "objects", tree.slice(0, 2), tree.slice(2));
    let saved: Buffer | undefined;
    const store = createRefStore({ ...h.b.ports, exec: async (command, args, options) => {
      const result = await h.b.ports.exec(command, args, options);
      // Transport succeeds with the publisher healthy; the receiver loses its fetched tree before admission.
      if (!saved && args.includes("fetch")) { saved = await readFile(object); await unlink(object); }
      return result;
    } });
    try {
      const pulled = success(await store.pull());
      expect(pulled.pulls.flatMap(outcome => outcome.notices)).toContainEqual(expect.objectContaining({
        kind: "namespace-corrupt", ref: home.ref, condition: expect.stringMatching(/unavailable locally/u),
        remedy: { text: expect.stringContaining(`Restore or fetch the missing objects for ${home.ref}`) },
      }));
      expect((await h.b.git(["rev-parse", home.ref])).stdout.trim()).toBe(kept);
      expect(success(await store.read({ reference })).content).toBe("Original tip.\n");
      expect(success(await store.read({ reference: independent })).content).toBe(content);
    } finally { if (saved) await writeFile(object, saved, { mode: 0o444 }); }
    const scope = h.b.gitDir ? [`--git-dir=${h.b.gitDir}`] : [];
    const restored = await h.b.ports.rawExec([...scope, "cat-file", "tree", tree]);
    const hashed = await h.b.ports.rawExec([...scope, "hash-object", "-t", "tree", "--stdin"], { input: restored.stdout });
    expect(new TextDecoder().decode(hashed.stdout).trim()).toBe(tree);
    const retried = success(await store.pull());
    expect(retried.pulls.flatMap(outcome => outcome.notices).filter(notice => "ref" in notice && notice.ref === home.ref)).toEqual([]);
    expect(success(await store.read({ reference })).content).toBe("Incoming tip.\n");
  });

  it("excludes a lost metadata blob, publishes independent state, and retries after exact restoration", async () => {
    const h = await refSyncFixture(layout);
    const created = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("blob-tip"),
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "blob-tip" } }),
      placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "start" } }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const original = success(await h.a.store.read({ reference: created.reference }));
    const home = expandStoredPath(original.reference), published = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
    success(await h.a.store.write({ action: "put", reference: original.reference, expected: original.version,
      content: `${original.content}\nPending edit.\n`, placement: { kind: "active" }, provenance }));
    const pending = success(await h.a.store.read({ reference: original.reference }));
    const parent = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
    const metadata = (await h.a.git(["show", `${home.ref}:${home.metadataPath}`])).stdout;
    const planted = await plantRef(h.a.root, home.ref, (await capturedEntries(h.a, home.ref)).map(entry => entry.path === home.metadataPath
      ? { path: entry.path, content: `${metadata}\n ` } : entry), { parents: [parent], gitDir: h.a.gitDir });
    const missing = planted.blobs.get(home.metadataPath);
    if (!missing) throw new Error("Expected a distinct tip metadata blob");
    expect(missing).not.toBe((await h.a.git(["rev-parse", `${published}:${home.metadataPath}`])).stdout.trim());
    const independent = RecordReferenceSchema.parse({ kind: "personal/document", key: "independent.md", owner: { type: "person", name: "andrew" } });
    success(await h.a.store.write({ action: "put", reference: independent, expected: null, content: "Independent publication.\n", provenance }));
    const object = join(h.a.gitDir ?? join(h.a.root, ".git"), "objects", missing.slice(0, 2), missing.slice(2));
    let saved: Buffer | undefined;
    const store = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
      const result = await h.a.ports.exec(command, args, options);
      if (!saved && args.includes("fetch")) { saved = await readFile(object); await unlink(object); }
      return result;
    } });
    try {
      const pushed = success(await store.push());
      expect(pushed.publishes.find(({ families }) => families.includes("work-item"))).toMatchObject({ status: "failed",
        failure: { code: "refused", class: "terminal", condition: expect.stringContaining(home.ref),
          remedy: { text: expect.stringContaining(`Restore or fetch the missing objects for ${home.ref}`) } } });
      expect(pushed.publishes.find(({ families }) => families.includes("personal"))?.status).toBe("pushed");
      expect((await h.remote("git", ["rev-parse", home.ref])).stdout.trim()).toBe(published);
      expect((await h.a.git(["rev-parse", home.ref])).stdout.trim()).toBe(planted.tip);
      const other = expandStoredPath(independent);
      expect((await h.remote("git", ["show", `${other.ref}:${other.path}`])).stdout.trimEnd()).toBe("Independent publication.");
    } finally { if (saved) await writeFile(object, saved, { mode: 0o444 }); }
    const scope = h.a.gitDir ? [`--git-dir=${h.a.gitDir}`] : [];
    const restored = await h.a.ports.rawExec([...scope, "cat-file", "blob", missing]);
    const hashed = await h.a.ports.rawExec([...scope, "hash-object", "--stdin"], { input: restored.stdout });
    expect(new TextDecoder().decode(hashed.stdout).trim()).toBe(missing);
    const retried = success(await store.push());
    expect(retried.publishes.every(({ status }) => status !== "failed")).toBe(true);
    expect((await h.remote("git", ["rev-parse", home.ref])).stdout.trim()).toBe(planted.tip);
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: pending.reference })).content).toBe(pending.content);
  });
});
