import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "label.md", owner: { type: "person", name: "andrew" } });
const provenance = { verb: "edit", lifecycleAction: "save" };

describe.each(["default", "separate"] as const)("label object loss in %s", layout => {
  it.each(["commit", "tree"] as const)("holds a lost historical %s and resumes after exact restoration", async damage => {
    const h = await refSyncFixture(layout);
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "base\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const home = expandStoredPath(reference), base = success(await h.b.store.read({ reference }));
    success(await h.b.store.write({ action: "put", reference, expected: base.version, content: "middle\n", provenance }));
    const middle = (await h.b.git(["rev-parse", home.ref])).stdout.trim();
    const earlier = success(await h.b.store.read({ reference }));
    success(await h.b.store.write({ action: "put", reference, expected: earlier.version, content: "local\n", provenance }));
    const kept = (await h.b.git(["rev-parse", home.ref])).stdout.trim();
    const oid = damage === "commit" ? middle : (await h.b.git(["rev-parse", `${middle}^{tree}`])).stdout.trim();
    const remote = success(await h.a.store.read({ reference }));
    success(await h.a.store.write({ action: "put", reference, expected: remote.version, content: "incoming\n", provenance }));
    success(await h.a.store.push());
    const object = join(h.b.gitDir ?? join(h.b.root, ".git"), "objects", oid.slice(0, 2), oid.slice(2));
    let saved: Buffer | undefined;
    const store = createRefStore({ ...h.b.ports, exec: async (command, args, options) => {
      const walk = args.includes("rev-list") && args.includes("--full-history") && args.includes(kept);
      if (walk && damage === "commit" && !saved) { saved = await readFile(object); await unlink(object); }
      const result = await h.b.ports.exec(command, args, options);
      if (walk && damage === "tree" && !saved) { saved = await readFile(object); await unlink(object); }
      return result;
    } });
    try {
      const pulled = success(await store.pull());
      expect(saved).toBeDefined();
      expect(pulled.pulls.flatMap(outcome => outcome.notices)).toContainEqual(expect.objectContaining({
        kind: "namespace-corrupt", ref: home.ref, condition: `Objects required to read ${home.ref} are unavailable locally.`,
        remedy: { text: expect.stringContaining(`Restore or fetch the missing objects for ${home.ref}`) },
      }));
      expect((await h.b.git(["rev-parse", home.ref])).stdout.trim()).toBe(kept);
      expect(success(await store.read({ reference })).content).toBe("local\n");
    } finally { if (saved) await writeFile(object, saved, { mode: 0o444 }); }
    const scope = h.b.gitDir ? [`--git-dir=${h.b.gitDir}`] : [];
    const restored = await h.b.ports.rawExec([...scope, "cat-file", damage, oid]);
    const hashed = await h.b.ports.rawExec([...scope, "hash-object", "-t", damage, "--stdin"], { input: restored.stdout });
    expect(new TextDecoder().decode(hashed.stdout).trim()).toBe(oid);
    expect(success(await store.pull()).pulls.flatMap(outcome => outcome.notices).filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
    expect(success(await store.read({ reference })).content).toBe("incoming\n");
  });

  it("keeps a record-free label revision record-free when its metadata blob is lost", async () => {
    const h = await refSyncFixture(layout);
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "base\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const home = expandStoredPath(reference), base = success(await h.b.store.read({ reference }));
    success(await h.b.store.write({ action: "remove", reference, expected: base.version, provenance }));
    const middle = (await h.b.git(["rev-parse", home.ref])).stdout.trim();
    const oid = (await h.b.git(["rev-parse", `${middle}:${home.metadataPath}`])).stdout.trim();
    success(await h.b.store.write({ action: "put", reference, expected: null, content: "local\n", provenance }));
    expect(oid).not.toBe((await h.b.git(["rev-parse", `${home.ref}:${home.metadataPath}`])).stdout.trim());
    const remote = success(await h.a.store.read({ reference }));
    success(await h.a.store.write({ action: "put", reference, expected: remote.version, content: "incoming\n", provenance }));
    success(await h.a.store.push());
    const object = join(h.b.gitDir ?? join(h.b.root, ".git"), "objects", oid.slice(0, 2), oid.slice(2));
    let saved: Buffer | undefined;
    const store = createRefStore({ ...h.b.ports, exec: async (command, args, options) => {
      const result = await h.b.ports.exec(command, args, options);
      if (!saved && args.includes("fetch")) { saved = await readFile(object); await unlink(object); }
      return result;
    } });
    try {
      expect(success(await store.pull()).pulls.flatMap(outcome => outcome.notices).filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
      expect(success(await store.read({ reference })).content).toBe("incoming\n");
    } finally { if (saved) await writeFile(object, saved, { mode: 0o444 }); }
    const scope = h.b.gitDir ? [`--git-dir=${h.b.gitDir}`] : [];
    const restored = await h.b.ports.rawExec([...scope, "cat-file", "blob", oid]);
    const hashed = await h.b.ports.rawExec([...scope, "hash-object", "--stdin"], { input: restored.stdout });
    expect(new TextDecoder().decode(hashed.stdout).trim()).toBe(oid);
    expect(success(await store.push()).publishes.every(outcome => outcome.status !== "failed")).toBe(true);
    success(await h.a.store.pull());
    expect(success(await h.a.store.read({ reference })).content).toBe("incoming\n");
  });
});
