import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "merge.md", owner: { type: "person", name: "andrew" } });
const independent = RecordReferenceSchema.parse({ kind: "project-inbox/inbox", owner: { type: "project", name: "project" } });
const provenance = { verb: "edit", lifecycleAction: "save" };

describe.each(["default", "separate"] as const)("merge object admission in %s", layout => {
  it.each(["endpoint", "graph-tip", "graph-parent"] as const)("holds lost %s objects after fetch admission and resumes after restoration", async damage => {
    const h = await refSyncFixture(layout);
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "Original state.\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const home = expandStoredPath(reference), kept = (await h.b.git(["rev-parse", home.ref])).stdout.trim();
    let before = success(await h.a.store.read({ reference }));
    success(await h.a.store.write({ action: "put", reference, expected: before.version, content: "Intermediate state.\n", provenance }));
    const parent = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
    before = success(await h.a.store.read({ reference }));
    success(await h.a.store.write({ action: "put", reference, expected: before.version, content: "Published state.\n", provenance }));
    const tip = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
    success(await h.a.store.write({ action: "put", reference: independent, expected: null, content: "Independent state.\n", provenance }));
    success(await h.a.store.push());
    const oid = damage === "graph-parent" ? parent : tip;
    const object = join(h.b.gitDir ?? join(h.b.root, ".git"), "objects", oid.slice(0, 2), oid.slice(2));
    let saved: Buffer | undefined, admitted = false;
    const lose = async () => { saved = await readFile(object); await unlink(object); };
    const store = createRefStore({ ...h.b.ports, rawExec: async (args, options) => {
      const endpoints = args.includes("--batch") && new TextDecoder().decode(options?.input) === `${tip}\n${kept}\n`;
      if (endpoints && damage === "endpoint" && !saved) await lose();
      const result = await h.b.ports.rawExec(args, options);
      if (endpoints) admitted = true;
      return result;
    }, exec: async (command, args, options) => {
      const operands = damage === "graph-parent" ? [kept, tip] : [tip, kept];
      if (admitted && !saved && args.includes("merge-base") && args.at(-2) === operands[0] && args.at(-1) === operands[1]) await lose();
      return h.b.ports.exec(command, args, options);
    } });
    try {
      const pulled = success(await store.pull());
      expect(saved).toBeDefined();
      expect(pulled.pulls.flatMap(outcome => outcome.notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: home.ref,
        condition: `Objects required to read ${home.ref} are unavailable locally.`,
        remedy: { text: expect.stringContaining(`Restore or fetch the missing objects for ${home.ref}`) },
      }));
      expect((await h.b.git(["rev-parse", home.ref])).stdout.trim()).toBe(kept);
      expect(success(await store.read({ reference })).content).toBe("Original state.\n");
      expect(success(await store.read({ reference: independent })).content).toBe("Independent state.\n");
    } finally { if (saved) await writeFile(object, saved, { mode: 0o444 }); }
    const scope = h.b.gitDir ? [`--git-dir=${h.b.gitDir}`] : [];
    const restored = await h.b.ports.rawExec([...scope, "cat-file", "commit", oid]);
    const hashed = await h.b.ports.rawExec([...scope, "hash-object", "-t", "commit", "--stdin"], { input: restored.stdout });
    expect(new TextDecoder().decode(hashed.stdout).trim()).toBe(oid);
    expect(success(await store.pull()).pulls.flatMap(outcome => outcome.notices).filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
    expect(success(await store.read({ reference })).content).toBe("Published state.\n");
  });
});
