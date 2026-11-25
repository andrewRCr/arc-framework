/** Retained-history preflight preserves the archive fault that blocks its refresh. */

import { expect, it } from "vitest";
import { createRefStore } from "../../src/lib/store/index.js";
import { completedSyncFixture } from "../helpers/store/completed-sync.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";

it.each(["missing-tree", "missing-metadata", "misplaced"] as const)("holds retained history on %s archive evidence and retries its repair", async damage => {
  const h = await completedSyncFixture("default");
  const record = success(await h.b.store.read({ reference: h.reference }));
  if (record.placement?.kind !== "completed") throw new Error("Expected a completed item");
  success(await h.b.store.write({ action: "put", reference: record.reference, expected: record.version,
    content: `${record.content}\nPublished completed change.\n`, placement: { kind: "completed", quarter: record.placement.quarter },
    provenance: { verb: "save", lifecycleAction: "save" } }));
  success(await h.b.store.push());
  const history = (await h.a.git(["rev-parse", h.history])).stdout.trim();
  const parent = (await h.a.git(["rev-parse", h.archive])).stdout.trim();
  const entries = await capturedEntries(h.a, h.archive);
  const metadataPath = `${h.folder}${h.metadataPath}`;
  const metadata = JSON.parse((await h.a.git(["show", `${h.archive}:${metadataPath}`])).stdout);
  const broken = await plantRef(h.a.root, h.archive, damage === "misplaced" ? entries.map(entry => entry.path === metadataPath
    ? { path: metadataPath, content: JSON.stringify({ ...metadata, primary: { ...metadata.primary, placement: { kind: "active" } } }) } : entry) : entries,
  { parents: [parent], message: "Local archive evidence", gitDir: h.a.gitDir });
  const oid = damage === "missing-tree" ? broken.tree : (await h.a.git(["rev-parse", `${h.archive}:${metadataPath}`])).stdout.trim();
  const type = damage === "missing-tree" ? "tree" : "blob";
  const bytes = (await h.a.ports.rawExec(["cat-file", type, oid])).stdout;
  await h.a.git(["config", "fetch.unpackLimit", "100000"]);
  let removeAfterFetch = damage !== "misplaced";
  const store = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
    const result = await h.a.ports.exec(command, args, options);
    if (removeAfterFetch && args.includes("fetch") && options?.input?.includes("refs/arc/")) {
      removeAfterFetch = false;
      await removeLooseObject(h.a.root, oid);
    }
    return result;
  } });
  const held = success(await store.pull({ history: [h.history] }));
  expect(held.pulls.filter(pull => pull.status === "failed"), JSON.stringify(held)).toEqual([]);
  if (damage !== "misplaced") {
    expect(removeAfterFetch).toBe(false);
    await expect(h.a.git(["cat-file", "-e", oid])).rejects.toMatchObject({ exitCode: 1 });
  }
  expect(held.pulls.flatMap(pull => pull.notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: h.history,
    condition: expect.stringContaining(damage === "misplaced" ? "placement is active" : h.archive),
    remedy: { text: damage === "misplaced" ? expect.stringContaining("completed placement") : expect.stringMatching(/restore|fetch/iu) },
  }));
  expect((await h.a.git(["rev-parse", h.history])).stdout.trim()).toBe(history);
  if (damage === "misplaced") await plantRef(h.a.root, h.archive, entries, { parents: [broken.tip], message: "Repair archive placement" });
  else {
    const restored = await h.a.ports.rawExec(["hash-object", "-t", type, "-w", "--stdin"], { input: bytes });
    expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
  }
  expect(success(await store.pull({ history: [h.history] })).pulls.flatMap(pull => pull.notices).filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
  expect(success(await h.a.store.read({ reference: h.reference })).content).toContain("Published completed change.");
});
