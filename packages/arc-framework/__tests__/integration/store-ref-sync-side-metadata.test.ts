import { describe, expect, it } from "vitest";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";

const provenance = { verb: "edit", lifecycleAction: "save" };
const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "merge.md", owner: { type: "person", name: "andrew" } });

async function divergentMetadata(layout: "default" | "separate", damaged: "base" | "local" | "incoming", fault: "unparseable" | "absent" | "missing" | "record" = "unparseable") {
  const h = await refSyncFixture(layout);
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "Base record.\n", provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const home = expandStoredPath(reference), seed = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
  const entries = await capturedEntries(h.a, home.ref);
  const metadata = (await h.a.git(["show", `${home.ref}:${home.metadataPath}`])).stdout;
  const sideEntries = (side: "base" | "local" | "incoming") => entries.filter(entry => !(fault === "absent" && side === damaged && entry.path === home.metadataPath))
    .map(entry => entry.path === home.metadataPath && side === damaged && fault !== "record"
    ? { path: entry.path, content: fault === "missing" ? `${metadata}\n ` : "{ invalid metadata\n" }
    : entry.path === home.path ? { path: entry.path, content: side === damaged && fault === "record" ? new Uint8Array([0xc3, 0x28]) : `${side} record.\n` } : entry);
  const base = await plantRef(h.a.root, "refs/fixture/merge-base", sideEntries("base"), { parents: [seed], gitDir: h.a.gitDir });
  const local = await plantRef(h.a.root, "refs/fixture/merge-local", sideEntries("local"), { parents: [base.tip], gitDir: h.a.gitDir });
  const incoming = await plantRef(h.a.root, home.ref, sideEntries("incoming"), { parents: [base.tip], gitDir: h.a.gitDir });
  await h.a.git(["push", h.remoteName, "refs/fixture/merge-local:refs/fixture/merge-local", `${home.ref}:${home.ref}`]);
  await h.b.git(["fetch", "--no-tags", "--refmap=", h.origin, `refs/fixture/merge-local:${home.ref}`]);
  return { ...h, home, entries, base, local, incoming };
}

describe.each(["default", "separate"] as const)("sync side metadata in %s", layout => {
  it("holds unparseable merge-base metadata with the historical repair", async () => {
    const h = await divergentMetadata(layout, "base");
    const pulled = success(await h.b.store.pull());
    expect(pulled.pulls.flatMap(outcome => outcome.notices)).toContainEqual(expect.objectContaining({
      kind: "namespace-corrupt", ref: h.home.ref,
      remedy: { text: expect.stringContaining("a forward repair cannot change an ancestor") },
    }));
    expect((await h.b.git(["rev-parse", h.home.ref])).stdout.trim()).toBe(h.local.tip);
    expect(success(await h.b.store.read({ reference })).content).toBe("local record.\n");
  });

  it.each(["local", "incoming"] as const)("holds unparseable %s metadata with a forward repair", async side => {
    const h = await divergentMetadata(layout, side);
    const pulled = success(await h.b.store.pull());
    expect(pulled.pulls.flatMap(outcome => outcome.notices)).toContainEqual(expect.objectContaining({
      kind: "namespace-corrupt", ref: h.home.ref,
      remedy: { text: expect.stringContaining(`Repair ${h.home.ref} forward:`) },
    }));
    expect((await h.b.git(["rev-parse", h.home.ref])).stdout.trim()).toBe(h.local.tip);
  });

  it("holds an undecodable merge-base record with the historical repair", async () => {
    const h = await divergentMetadata(layout, "base", "record");
    const pulled = success(await h.b.store.pull());
    expect(pulled.pulls.flatMap(outcome => outcome.notices)).toContainEqual(expect.objectContaining({
      kind: "namespace-corrupt", ref: h.home.ref, condition: expect.stringContaining("cannot be decoded"),
      remedy: { text: expect.stringContaining("a forward repair cannot change an ancestor") },
    }));
    expect((await h.b.git(["rev-parse", h.home.ref])).stdout.trim()).toBe(h.local.tip);
    expect(success(await h.b.store.read({ reference })).content).toBe("local record.\n");
  });

  it.each(["local", "incoming"] as const)("holds an undecodable %s record with a source-state forward repair", async side => {
    const h = await divergentMetadata(layout, side, "record");
    const pulled = success(await h.b.store.pull());
    expect(pulled.pulls.flatMap(outcome => outcome.notices)).toContainEqual(expect.objectContaining({
      kind: "namespace-corrupt", ref: h.home.ref, condition: expect.stringContaining("cannot be decoded"),
      remedy: { text: expect.stringContaining(`Repair the malformed record on ${h.home.ref} forward in its source state`) },
    }));
    expect((await h.b.git(["rev-parse", h.home.ref])).stdout.trim()).toBe(h.local.tip);
  });

  it("holds a record-bearing merge base with no metadata entry using the historical repair", async () => {
    const h = await divergentMetadata(layout, "base", "absent");
    const pulled = success(await h.b.store.pull());
    expect(pulled.pulls.flatMap(outcome => outcome.notices)).toContainEqual(expect.objectContaining({
      kind: "namespace-corrupt", ref: h.home.ref, condition: expect.stringContaining("holds records but has no metadata entry"),
      remedy: { text: expect.stringContaining("a forward repair cannot change an ancestor") },
    }));
    expect((await h.b.git(["rev-parse", h.home.ref])).stdout.trim()).toBe(h.local.tip);
  });

  it("holds a lost merge-base metadata blob for restoration and resumes the same pull", async () => {
    const h = await divergentMetadata(layout, "base", "missing"), oid = h.base.blobs.get(h.home.metadataPath);
    if (!oid) throw new Error("Expected a distinct merge-base metadata blob");
    const object = join(h.b.gitDir ?? join(h.b.root, ".git"), "objects", oid.slice(0, 2), oid.slice(2));
    let saved: Buffer | undefined;
    const store = createRefStore({ ...h.b.ports, exec: async (command, args, options) => {
      const result = await h.b.ports.exec(command, args, options);
      if (!saved && args.includes("fetch")) { saved = await readFile(object); await unlink(object); }
      return result;
    } });
    try {
      const pulled = success(await store.pull());
      expect(pulled.pulls.flatMap(outcome => outcome.notices)).toContainEqual(expect.objectContaining({
        kind: "namespace-corrupt", ref: h.home.ref, condition: expect.stringContaining("unavailable locally"),
        remedy: { text: expect.stringContaining(`Restore or fetch the missing objects for ${h.home.ref}`) },
      }));
      expect((await h.b.git(["rev-parse", h.home.ref])).stdout.trim()).toBe(h.local.tip);
    } finally { if (saved) await writeFile(object, saved, { mode: 0o444 }); }
    const scope = h.b.gitDir ? [`--git-dir=${h.b.gitDir}`] : [];
    const restored = await h.b.ports.rawExec([...scope, "cat-file", "blob", oid]);
    const hashed = await h.b.ports.rawExec([...scope, "hash-object", "--stdin"], { input: restored.stdout });
    expect(new TextDecoder().decode(hashed.stdout).trim()).toBe(oid);
    const retried = success(await store.pull());
    expect(retried.pulls.flatMap(outcome => outcome.notices).filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
    expect(success(await store.read({ reference })).content).toBe("incoming record.\n");
  });
});
