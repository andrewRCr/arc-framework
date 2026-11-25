import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRefStore, HistoryRefSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

async function terminalLineage(layout: "default" | "separate") {
  const h = await refSyncFixture(layout);
  success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } }),
    content: JSON.stringify({ projectId: randomUUID() }), provenance: { verb: "init", lifecycleAction: "init" } }));
  const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("terminal-read"),
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "terminal-read" } }),
    placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "start" } }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const owner = made.reference.owner;
  if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected a native work-item generation");
  const reference = RecordReferenceSchema.parse({ kind: "lineage/transition", owner });
  const content = JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: owner.name, uid: owner.uid },
    kind: "abandon", successors: [], incoming: [] }));
  const current = success(await h.a.store.read({ reference: made.reference }));
  success(await h.a.store.batch({ writes: [
    { action: "put", reference, expected: null, content },
    { action: "remove", reference: current.reference, expected: current.version },
  ], provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
  success(await h.a.store.push());
  const history = HistoryRefSchema.parse(`refs/arc/history/work/${owner.uid}`);
  success(await h.b.store.pull({ history: [history] }));
  return { ...h, reference, content: success(await h.a.store.read({ reference })).content, history, home: expandStoredPath(reference) };
}

describe.each(["default", "separate"] as const)("terminal lineage presence in %s", layout => {
  it("skips an absent lineage path and observes its forward restoration", async () => {
    const h = await terminalLineage(layout), parent = (await h.a.git(["rev-parse", h.home.ref])).stdout.trim();
    const entries = await capturedEntries(h.a, h.home.ref);
    const damaged = await plantRef(h.a.root, h.home.ref, entries.filter(entry => entry.path !== h.home.path),
      { parents: [parent], gitDir: h.a.gitDir });
    await h.a.git(["push", h.remoteName, `${h.home.ref}:${h.home.ref}`]);
    const pulled = success(await h.b.store.pull({ history: [h.history] }));
    expect(pulled.pulls.flatMap(outcome => outcome.notices).filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
    expect(await h.b.store.read({ reference: h.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    await plantRef(h.a.root, h.home.ref, entries, { parents: [damaged.tip], gitDir: h.a.gitDir });
    await h.a.git(["push", h.remoteName, `${h.home.ref}:${h.home.ref}`]);
    expect(success(await h.b.store.pull({ history: [h.history] })).pulls.flatMap(outcome => outcome.notices)
      .filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
    expect(success(await h.b.store.read({ reference: h.reference })).content).toBe(h.content);
  });

  it("holds a present lineage path whose blob is lost and resumes after exact restoration", async () => {
    const h = await terminalLineage(layout), kept = (await h.b.git(["rev-parse", h.home.ref])).stdout.trim();
    const oid = (await h.b.git(["rev-parse", `${h.home.ref}:${h.home.path}`])).stdout.trim();
    const object = join(h.b.gitDir ?? join(h.b.root, ".git"), "objects", oid.slice(0, 2), oid.slice(2));
    let saved: Buffer | undefined;
    const store = createRefStore({ ...h.b.ports, exec: async (command, args, options) => {
      const result = await h.b.ports.exec(command, args, options);
      if (!saved && args.includes("fetch")) { saved = await readFile(object); await unlink(object); }
      return result;
    } });
    try {
      const pulled = success(await store.pull({ history: [h.history] }));
      expect(pulled.pulls.flatMap(outcome => outcome.notices)).toContainEqual(expect.objectContaining({
        kind: "namespace-corrupt", ref: h.home.ref, condition: `Objects required to read ${h.home.ref} are unavailable locally.`,
        remedy: { text: expect.stringContaining(`Restore or fetch the missing objects for ${h.home.ref}`) },
      }));
      expect((await h.b.git(["rev-parse", h.home.ref])).stdout.trim()).toBe(kept);
      expect(await store.read({ reference: h.reference })).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable", class: "recoverable" } });
    } finally { if (saved) await writeFile(object, saved, { mode: 0o444 }); }
    const scope = h.b.gitDir ? [`--git-dir=${h.b.gitDir}`] : [];
    const restored = await h.b.ports.rawExec([...scope, "cat-file", "blob", oid]);
    const hashed = await h.b.ports.rawExec([...scope, "hash-object", "--stdin"], { input: restored.stdout });
    expect(new TextDecoder().decode(hashed.stdout).trim()).toBe(oid);
    expect(success(await store.pull({ history: [h.history] })).pulls.flatMap(outcome => outcome.notices)
      .filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
    expect(success(await store.read({ reference: h.reference })).content).toBe(h.content);
  });

  it("keeps a directory at a lineage coordinate unavailable until its entry is repaired", async () => {
    const h = await terminalLineage(layout), parent = (await h.a.git(["rev-parse", h.home.ref])).stdout.trim();
    const entries = await capturedEntries(h.a, h.home.ref);
    const damaged = await plantRef(h.a.root, h.home.ref, [...entries.filter(entry => entry.path !== h.home.path),
      { path: `${h.home.path}/child`, content: "This coordinate is a directory.\n" }], { parents: [parent], gitDir: h.a.gitDir });
    await h.a.git(["push", h.remoteName, `${h.home.ref}:${h.home.ref}`]);
    const pulled = success(await h.b.store.pull({ history: [h.history] }));
    expect(pulled.pulls.flatMap(outcome => outcome.notices)).toContainEqual(expect.objectContaining({
      kind: "namespace-corrupt", ref: h.home.ref, condition: `Objects required to read ${h.home.ref} are unavailable locally.`,
      remedy: { text: expect.stringContaining(`Restore or fetch the missing objects for ${h.home.ref}`) },
    }));
    await plantRef(h.a.root, h.home.ref, entries, { parents: [damaged.tip], gitDir: h.a.gitDir });
    await h.a.git(["push", h.remoteName, `${h.home.ref}:${h.home.ref}`]);
    expect(success(await h.b.store.pull({ history: [h.history] })).pulls.flatMap(outcome => outcome.notices)
      .filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
    expect(success(await h.b.store.read({ reference: h.reference })).content).toBe(h.content);
  });
});
