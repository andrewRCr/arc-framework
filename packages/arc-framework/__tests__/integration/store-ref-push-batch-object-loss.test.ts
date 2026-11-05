import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

const provenance = { verb: "edit", lifecycleAction: "save" };

describe.each(["default", "separate"] as const)("unpublished batch object loss in %s", layout => {
  it("retains pending refs when batch ancestry is missing and publishes independent state after restoration", async () => {
    const h = await refSyncFixture(layout);
    const owner = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("batch-loss"),
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "batch-loss" } }),
      placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "start" } }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const home = expandStoredPath(owner.reference), published = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
    await plantRef(h.a.root, home.ref, (await capturedEntries(h.a, home.ref)).map(entry => entry.path === home.metadataPath
      ? { path: entry.path, content: "{ invalid metadata\n" } : entry), { parents: [published], gitDir: h.a.gitDir });
    const independent = RecordReferenceSchema.parse({ kind: "personal/document", key: "independent.md", owner: { type: "person", name: "andrew" } });
    success(await h.a.store.write({ action: "put", reference: independent, expected: null, content: "First pending edit.\n", provenance }));
    const other = expandStoredPath(independent), missing = (await h.a.git(["rev-parse", other.ref])).stdout.trim();
    const before = success(await h.a.store.read({ reference: independent }));
    success(await h.a.store.write({ action: "put", reference: independent, expected: before.version, content: "Latest pending edit.\n", provenance }));
    const tip = (await h.a.git(["rev-parse", other.ref])).stdout.trim();
    expect(tip).not.toBe(missing);
    const object = join(h.a.gitDir ?? join(h.a.root, ".git"), "objects", missing.slice(0, 2), missing.slice(2));
    let saved: Buffer | undefined;
    const store = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
      // Lose the interior commit only when Git starts discovering this pending ref's batch membership.
      if (!saved && args.includes("--format=%H %P%n%B%x00") && args.includes(tip)) {
        saved = await readFile(object); await unlink(object);
      }
      return h.a.ports.exec(command, args, options);
    } });
    try {
      const pushed = success(await store.push());
      expect(pushed.publishes.find(({ families }) => families.includes("personal"))).toMatchObject({ status: "failed",
        failure: { code: "refused", class: "terminal", condition: `Objects required to read ${other.ref} are unavailable locally.`,
          remedy: { text: expect.stringContaining(`Restore or fetch the missing objects for ${other.ref}`) } } });
      expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", other.ref])).stdout).toBe("");
      expect((await h.remote("git", ["rev-parse", home.ref])).stdout.trim()).toBe(published);
      expect((await h.a.git(["rev-parse", other.ref])).stdout.trim()).toBe(tip);
    } finally { if (saved) await writeFile(object, saved, { mode: 0o444 }); }
    const scope = h.a.gitDir ? [`--git-dir=${h.a.gitDir}`] : [];
    const restored = await h.a.ports.rawExec([...scope, "cat-file", "commit", missing]);
    const hashed = await h.a.ports.rawExec([...scope, "hash-object", "-t", "commit", "--stdin"], { input: restored.stdout });
    expect(new TextDecoder().decode(hashed.stdout).trim()).toBe(missing);
    const retried = success(await store.push());
    expect(retried.publishes.find(({ families }) => families.includes("personal"))?.status).toBe("pushed");
    expect((await h.remote("git", ["rev-parse", other.ref])).stdout.trim()).toBe(tip);
    expect((await h.remote("git", ["rev-parse", home.ref])).stdout.trim()).toBe(published);
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: independent })).content).toBe("Latest pending edit.\n");
  });
});
