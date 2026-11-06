import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, HistoryRefSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("history fast-forward object loss in %s", layout => {
  it.each([{ damage: "metadata", empty: false }, { damage: "tree", empty: false }, { damage: "metadata", empty: true }] as const)(
    "holds a lost tip $damage before refreshing its archive, then retries (record-free=$empty)", async ({ damage, empty }) => {
    const h = await refSyncFixture(layout), content = makeMetaFixture("history-loss");
    const made = success(await h.a.store.write({ action: "put", expected: null, content,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "history-loss" } }),
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    const home = expandStoredPath(made.reference, { history: true }), history = HistoryRefSchema.parse(home.ref);
    success(await h.a.store.push()); success(await h.b.store.pull({ history: [history] }));
    const kept = (await h.a.git(["rev-parse", history])).stdout.trim();
    const metadata = (await h.b.git(["show", `${history}:${home.metadataPath}`])).stdout;
    const nextContent = `${content}\nIncoming retained edit.\n`;
    const incomingMetadata = empty ? JSON.stringify({ formatVersion: 1, slug: made.reference.owner.name, formats: {} }) : metadata;
    const incoming = await plantRef(h.b.root, history, (await capturedEntries(h.b, history)).filter(entry => !empty || entry.path !== home.path)
      .map(entry => entry.path === home.metadataPath
        ? { path: entry.path, content: `${incomingMetadata}\n ` } : entry.path === home.path ? { path: entry.path, content: nextContent } : entry),
    { parents: [kept], gitDir: h.b.gitDir });
    await h.b.git(["push", h.remoteName, `${history}:${history}`]);
    const oid = damage === "tree" ? incoming.tree : incoming.blobs.get(home.metadataPath);
    if (!oid) throw new Error("Expected a distinct incoming metadata object");
    const object = join(h.a.gitDir ?? join(h.a.root, ".git"), "objects", oid.slice(0, 2), oid.slice(2));
    let saved: Buffer | undefined, admitted = false;
    const store = createRefStore({ ...h.a.ports, rawExec: async (args, options) => {
      const result = await h.a.ports.rawExec(args, options);
      if (args.includes("--batch") && new TextDecoder().decode(options?.input) === `${incoming.tip}\n${kept}\n`) admitted = true;
      return result;
    }, exec: async (command, args, options) => {
      const result = await h.a.ports.exec(command, args, options);
      // The endpoint batch and forward ancestry check are complete; the paired history tree is next.
      if (admitted && !saved && args.includes("merge-base") && args.at(-2) === kept && args.at(-1) === incoming.tip) {
        saved = await readFile(object); await unlink(object);
      }
      return result;
    } });
    try {
      const pulled = success(await store.pull({ history: [history] }));
      expect(saved).toBeDefined();
      expect(pulled.pulls.flatMap(outcome => outcome.notices)).toContainEqual(expect.objectContaining({
        kind: "namespace-corrupt", ref: history, condition: `Objects required to read ${history} are unavailable locally.`,
        remedy: { text: expect.stringContaining(`Restore or fetch the missing objects for ${history}`) },
      }));
      expect((await h.a.git(["rev-parse", history])).stdout.trim()).toBe(kept);
      expect(success(await store.read({ reference: made.reference })).content).toBe(content);
    } finally { if (saved) await writeFile(object, saved, { mode: 0o444 }); }
    const scope = h.a.gitDir ? [`--git-dir=${h.a.gitDir}`] : [], type = damage === "tree" ? "tree" : "blob";
    const restored = await h.a.ports.rawExec([...scope, "cat-file", type, oid]);
    const hashed = await h.a.ports.rawExec([...scope, "hash-object", "-t", type, "--stdin"], { input: restored.stdout });
    expect(new TextDecoder().decode(hashed.stdout).trim()).toBe(oid);
    expect(success(await store.pull({ history: [history] })).pulls.flatMap(outcome => outcome.notices)
      .filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
    if (empty) expect(await store.read({ reference: made.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    else expect(success(await store.read({ reference: made.reference })).content).toBe(nextContent);
  });
});
