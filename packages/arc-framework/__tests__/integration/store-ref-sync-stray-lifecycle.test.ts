/** Ordinary synchronization ignores loose Git refs outside the lifecycle grammar. */
import { expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";

it.each(["default", "separate"] as const)("pulls and pushes normally beside an invalid history ref holding a blob in %s", async layout => {
  const h = await refSyncFixture(layout);
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "scratch/ordinary.md" });
  const stray = "refs/arc/history/work/ABCDEFAB-1234-4234-8234-123456789ABC";
  for (const side of [h.a, h.b]) {
    const hash = await side.ports.rawExec([...side.gitDir ? [`--git-dir=${side.gitDir}`] : [], "hash-object", "-w", "--stdin"],
      { cwd: side.root, input: Buffer.from("A blob that cannot supply a lifecycle log.\n"), objectAccess: "local-only" });
    await side.git(["update-ref", stray, Buffer.from(hash.stdout).toString("utf8").trim()]);
  }
  success(await h.a.store.write({ action: "put", expected: null, reference, content: "Ordinary data.\n",
    provenance: { verb: "edit", lifecycleAction: "save" } }));
  expect(success(await h.a.store.push()).publishes.every(row => row.status !== "failed")).toBe(true);
  expect(success(await h.b.store.pull()).pulls.every(row => row.status !== "failed")).toBe(true);
  expect(success(await h.b.store.read({ reference })).content).toBe("Ordinary data.\n");
  success(await h.b.store.write({ action: "put", expected: success(await h.b.store.read({ reference })).version, reference, content: "Revised data.\n", provenance: { verb: "edit", lifecycleAction: "save" } }));
  expect(success(await h.b.store.push()).publishes.every(row => row.status !== "failed")).toBe(true);
  expect(success(await h.a.store.pull()).pulls.every(row => row.status !== "failed")).toBe(true);
  expect(success(await h.a.store.read({ reference })).content).toBe("Revised data.\n");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", stray])).stdout).toBe("");
  for (const side of [h.a, h.b]) expect((await side.git(["cat-file", "-t", stray])).stdout.trim()).toBe("blob");
});
