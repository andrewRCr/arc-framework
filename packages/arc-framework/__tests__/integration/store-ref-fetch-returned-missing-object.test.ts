import { expect, it } from "vitest";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
const provenance = { verb: "edit", lifecycleAction: "save" };
const independent = RecordReferenceSchema.parse({ kind: "project-inbox/inbox", owner: { type: "project", name: "project" } });
it.each((["default", "separate"] as const).flatMap(layout => [false, true].map(damaged => ({ layout, damaged }))))("returned commit damaged=$damaged in $layout", async ({ layout, damaged }) => {
  const h = await refSyncFixture(layout);
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "return.md", owner: { type: "person", name: "andrew" } });
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "First\n", provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const ref = "refs/arc/user/andrew/personal";
  await h.remote("git", ["update-ref", "-d", ref]); success(await h.b.store.pull());
  const current = success(await h.a.store.read({ reference }));
  success(await h.a.store.write({ action: "put", reference, expected: current.version, content: "Second\n", provenance }));
  success(await h.a.store.write({ action: "put", reference: independent, expected: null, content: "Independent\n", provenance }));
  success(await h.a.store.push());
  const tip = (await h.a.git(["rev-parse", ref])).stdout.trim();
  const object = join(h.b.gitDir ?? join(h.b.root, ".git"), "objects", tip.slice(0,2), tip.slice(2));
  let bytes: Buffer | undefined;
  const store = createRefStore({ ...h.b.ports, exec: async (command, args, options) => {
    const result = await h.b.ports.exec(command, args, options);
    if (damaged && !bytes && args.includes("fetch")) { bytes = await readFile(object); await unlink(object); }
    return result;
  } });
  try {
    const result = success(await store.pull());
    if (damaged) expect(result.pulls.flatMap(row => row.notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref }));
    expect(success(await store.read({ reference: independent })).content).toBe("Independent\n");
    expect(success(await store.read({ reference })).content).toBe(damaged ? "First\n" : "Second\n");
  } finally { if (bytes) await writeFile(object, bytes); }
  success(await store.pull());
  expect(success(await store.read({ reference })).content).toBe("Second\n");
  expect(success(await store.read({ reference: independent })).content).toBe("Independent\n");
}, 90000);
