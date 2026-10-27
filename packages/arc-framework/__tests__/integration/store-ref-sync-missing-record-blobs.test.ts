/** An acquired tree entry requires its actual blob before sync can interpret record presence. */
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { plantRef } from "../helpers/store/ref-plant.js";

describe.each(["default", "separate"] as const)("sync record acquisition in %s", layout => {
  it.each(["base", "local", "incoming"] as const)("holds a missing %s blob and resumes after restoration", async damage => {
    const h = await refSyncFixture(layout), provenance = { verb: "edit", lifecycleAction: "save" };
    const owner = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "record-blobs" } }),
      content: makeMetaFixture("record-blobs"), placement: { kind: "active" },
      provenance: { verb: "start", lifecycleAction: "activate" } }));
    const first = RecordReferenceSchema.parse({ kind: "work-item/companion", key: "first", owner: owner.reference.owner });
    const second = RecordReferenceSchema.parse({ kind: "work-item/companion", key: "second", owner: owner.reference.owner });
    success(await h.a.store.write({ action: "put", expected: null, reference: first, content: "one\nmiddle\nthree\n", provenance }));
    success(await h.a.store.write({ action: "put", expected: null, reference: second, content: "Original second.\n", provenance }));
    success(await h.a.store.push());
    success(await h.b.store.pull());
    const home = expandStoredPath(first), base = (await h.b.git(["rev-parse", `${home.ref}:${home.path}`])).stdout.trim();
    const localTarget = damage === "incoming" ? second : first;
    const localValue = success(await h.b.store.read({ reference: localTarget }));
    success(await h.b.store.write({ action: "put", reference: localTarget, expected: localValue.version,
      content: damage === "incoming" ? "Local second.\n" : "ONE\nmiddle\nthree\n", provenance }));
    const incomingTarget = damage === "incoming" ? first : second;
    const incomingValue = success(await h.a.store.read({ reference: incomingTarget }));
    success(await h.a.store.write({ action: "put", reference: incomingTarget, expected: incomingValue.version,
      content: damage === "incoming" ? "one\nmiddle\nTHREE\n" : "Incoming second.\n", provenance }));
    const removed = damage === "base" ? base
      : (await h[damage === "local" ? "b" : "a"].git(["rev-parse", `${home.ref}:${home.path}`])).stdout.trim();
    const independent = RecordReferenceSchema.parse({ kind: "personal/document", key: "independent.md", owner: { type: "person", name: "andrew" } });
    success(await h.a.store.write({ action: "put", reference: independent, expected: null, content: "Independent publication.\n", provenance }));
    success(await h.a.store.push());
    const localTip = (await h.b.git(["rev-parse", home.ref])).stdout.trim();
    const object = join(h.b.root, ".git", ...layout === "separate" ? ["arc", "store"] : [], "objects", removed.slice(0, 2), removed.slice(2));
    let saved: Buffer | undefined;
    const store = createRefStore({ ...h.b.ports, exec: async (command, args, options) => {
      const result = await h.b.ports.exec(command, args, options);
      if (!saved && args.includes("fetch")) { saved = await readFile(object); await unlink(object); }
      return result;
    } });
    try {
      const pulled = success(await store.pull());
      expect(pulled.pulls.flatMap(outcome => outcome.notices)).toContainEqual(expect.objectContaining({
        kind: "namespace-corrupt", ref: home.ref, condition: expect.stringContaining(home.path),
        remedy: expect.objectContaining({ text: expect.stringMatching(/restore|fetch/iu) }),
      }));
      expect((await h.b.git(["rev-parse", home.ref])).stdout.trim()).toBe(localTip);
      expect(success(await store.read({ reference: independent })).content).toBe("Independent publication.\n");
      expect(success(await store.read({ reference: second })).content).toBe(damage === "incoming" ? "Local second.\n" : "Original second.\n");
    } finally { if (saved) await writeFile(object, saved, { mode: 0o444 }); }
    const retried = success(await store.pull());
    expect(retried.pulls.flatMap(outcome => outcome.notices).filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
    expect(success(await store.read({ reference: first })).content).toBe(damage === "incoming" ? "one\nmiddle\nTHREE\n" : "ONE\nmiddle\nthree\n");
    expect(success(await store.read({ reference: second })).content).toBe(damage === "incoming" ? "Local second.\n" : "Incoming second.\n");
    success(await store.push());
    success(await h.a.store.pull());
    expect(success(await h.a.store.read({ reference: first })).content).toBe(damage === "incoming" ? "one\nmiddle\nTHREE\n" : "ONE\nmiddle\nthree\n");
  }, 60_000);

  it("holds a regular record entry naming a commit and resumes after a forward tree repair", async () => {
    const h = await refSyncFixture(layout), provenance = { verb: "edit", lifecycleAction: "save" };
    const owner = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "record-type" } }),
      content: makeMetaFixture("record-type"), placement: { kind: "active" },
      provenance: { verb: "start", lifecycleAction: "activate" } }));
    const reference = RecordReferenceSchema.parse({ kind: "work-item/companion", key: "kept", owner: owner.reference.owner });
    const sibling = RecordReferenceSchema.parse({ ...reference, key: "sibling" });
    success(await h.a.store.write({ action: "put", expected: null, reference, content: "Base content.\n", provenance }));
    success(await h.a.store.push());
    success(await h.b.store.pull());
    const before = success(await h.b.store.read({ reference }));
    success(await h.b.store.write({ action: "put", expected: before.version, reference, content: "Local content.\n", provenance }));
    success(await h.a.store.write({ action: "put", expected: null, reference: sibling, content: "Incoming sibling.\n", provenance }));
    success(await h.a.store.push());
    const home = expandStoredPath(reference), original = (await h.b.git(["rev-parse", home.ref])).stdout.trim();
    const rows = (await h.b.git(["ls-tree", "-z", original])).stdout.split("\0").filter(Boolean).map(row => {
      const match = /^(\d+) \w+ ([0-9a-f]+)\t(.+)$/u.exec(row);
      if (match?.[1] !== "100644" || !match[2] || !match[3]) throw new Error("Expected a regular-file root tree row");
      return { mode: "100644" as const, oid: match[2], path: match[3] };
    });
    const input = Buffer.concat(rows.flatMap(entry => [Buffer.from(`${entry.mode} ${entry.path}\0`),
      Buffer.from(entry.path === home.path ? original : entry.oid, "hex")]));
    const scope = h.b.gitDir ? [`--git-dir=${h.b.gitDir}`] : [];
    const tree = new TextDecoder().decode((await h.b.ports.rawExec([...scope, "hash-object", "-w", "-t", "tree", "--stdin"], { input })).stdout).trim();
    const damaged = (await h.b.git(["-c", "user.name=Fixture Writer", "-c", "user.email=fixture@example.test",
      "commit-tree", tree, "-p", original, "-m", "Plant wrong record object type"])).stdout.trim();
    await h.b.git(["update-ref", home.ref, damaged, original]);
    const pulled = success(await h.b.store.pull());
    expect(pulled.pulls.flatMap(outcome => outcome.notices)).toContainEqual(expect.objectContaining({
      kind: "namespace-corrupt", ref: home.ref, condition: expect.stringContaining(home.path),
    }));
    expect((await h.b.git(["rev-parse", home.ref])).stdout.trim()).toBe(damaged);
    await plantRef(h.b.root, home.ref, rows, { parents: [damaged], gitDir: h.b.gitDir });
    const retried = success(await h.b.store.pull());
    expect(retried.pulls.flatMap(outcome => outcome.notices).filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
    expect(success(await h.b.store.read({ reference })).content).toBe("Local content.\n");
    expect(success(await h.b.store.read({ reference: sibling })).content).toBe("Incoming sibling.\n");
  }, 60_000);
});
