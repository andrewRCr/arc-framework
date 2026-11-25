/** Missing fetched commits hold their own namespace while independent state lands and restoration admits retry. */
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "graph.md", owner: { type: "person", name: "andrew" } });
const independent = RecordReferenceSchema.parse({ kind: "project-inbox/inbox", owner: { type: "project", name: "project" } });
const provenance = { verb: "edit", lifecycleAction: "save" };

describe.each(["default", "separate"] as const)("missing sync graph in %s", layout => {
  it.each([
    { damage: "tip", timing: "fetch" }, { damage: "parent", timing: "fetch" },
    { damage: "tip", timing: "graph" }, { damage: "parent", timing: "graph" },
  ])("holds an unavailable $damage at $timing and applies independent state before repaired retry", async ({ damage, timing }) => {
    const h = await refSyncFixture(layout);
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "Original state.\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const home = expandStoredPath(reference), initial = success(await h.a.store.read({ reference }));
    success(await h.a.store.write({ action: "put", reference, expected: initial.version, content: "Intermediate state.\n", provenance }));
    const parent = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
    const intermediate = success(await h.a.store.read({ reference }));
    success(await h.a.store.write({ action: "put", reference, expected: intermediate.version, content: "Published state.\n", provenance }));
    const tip = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
    success(await h.a.store.write({ action: "put", reference: independent, expected: null, content: "Independent state.\n", provenance }));
    success(await h.a.store.push());
    const removed = damage === "tip" ? tip : parent;
    const object = join(h.b.root, ".git", ...layout === "separate" ? ["arc", "store"] : [], "objects", removed.slice(0, 2), removed.slice(2));
    let saved: Buffer | undefined;
    const store = createRefStore({ ...h.b.ports, exec: async (command, args, options) => {
      if (!saved && timing === "graph" && args.includes("merge-base")) { saved = await readFile(object); await unlink(object); }
      const result = await h.b.ports.exec(command, args, options);
      if (!saved && timing === "fetch" && args.includes("fetch")) { saved = await readFile(object); await unlink(object); }
      return result;
    } });
    try {
      const result = success(await store.pull());
      expect(saved).toBeDefined();
      expect(result.pulls.flatMap(outcome => outcome.notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: home.ref,
        remedy: { text: expect.stringMatching(/restore|fetch/iu) } }));
      expect(success(await store.read({ reference })).content).toBe("Original state.\n");
      expect(success(await store.read({ reference: independent })).content).toBe("Independent state.\n");
    } finally { if (saved) await writeFile(object, saved, { mode: 0o444 }); }
    expect(success(await store.pull()).pulls.every(outcome => outcome.status !== "failed")).toBe(true);
    expect(success(await store.read({ reference })).content).toBe("Published state.\n");
    expect(success(await store.read({ reference: independent })).content).toBe("Independent state.\n");
  });
});
