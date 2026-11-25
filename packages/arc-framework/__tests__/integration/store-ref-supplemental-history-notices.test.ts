/** Failed history acquisition retains conditions already established while reconciling a public pull. */
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { plantRef, removeLooseObject, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const provenance = { verb: "edit", lifecycleAction: "save" };

async function historyFailureFixture(layout: "default" | "separate") {
  const h = await refSyncFixture(layout);
  const create = async (name: string) => success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }),
    content: makeMetaFixture(name), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "start" } }));
  const damaged = await create("damaged"), ending = await create("ending");
  success(await h.a.store.push()); success(await h.b.store.pull());
  for (const [made, quarter] of [[damaged, "2026-q3"], [ending, "2026-q4"]] as const) {
    const record = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: record.reference, expected: record.version,
      content: record.content, placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse(quarter) },
      provenance: { verb: "archive", lifecycleAction: "archive" } }));
    success(await h.a.store.push());
  }
  const home = expandStoredPath(damaged.reference), archive = "refs/arc/archive/2026-q3";
  const prior = (await h.b.git(["rev-parse", home.ref])).stdout.trim();
  const archiveTip = (await h.a.git(["rev-parse", archive])).stdout.trim();
  const rows = (await h.a.git(["ls-tree", "-r", "--format=%(objectname) %(path)", archive])).stdout.split("\n").filter(Boolean);
  const original: PlantTreeEntry[] = rows.map(row => {
    const at = row.indexOf(" "); return { path: row.slice(at + 1), oid: row.slice(0, at), mode: "100644" };
  });
  const metadata = original.find(entry => entry.path.endsWith(`/${home.metadataPath}`));
  if (!metadata) throw new Error("The archived item has no producer metadata");
  const independent = RecordReferenceSchema.parse({ kind: "personal/document", key: "independent.md",
    owner: { type: "person", name: "andrew" } });
  success(await h.a.store.write({ action: "put", reference: independent, expected: null, content: "Independent update.\n", provenance }));
  success(await h.a.store.push());
  const broken = await plantRef(h.a.root, archive, original.map(entry => entry.path === metadata.path
    ? { path: entry.path, content: "{ invalid metadata\n" } : entry), { parents: [archiveTip], gitDir: h.a.gitDir });
  await h.a.git(["push", h.remoteName, `${archive}:${archive}`]);
  return { ...h, damaged, ending, home, archive, prior, original, broken, independent };
}

it.each((["default", "separate"] as const).flatMap(layout => [false, true].map(blockedHistory => ({ layout, blockedHistory }))))(
  "keeps $layout pull notices after supplemental failure (blocked history: $blockedHistory)", async ({ layout, blockedHistory }) => {
  const h = await historyFailureFixture(layout), offline = `${h.origin}-unavailable`;
  const history = expandStoredPath(h.ending.reference).ref.replace("refs/arc/", "refs/arc/history/");
  const suffix = history.slice("refs/arc/".length), tracking = `refs/arc-remotes/${h.remoteName}/${suffix}`;
  const keeper = `refs/arc/tmp/seen/${h.remoteName}/${suffix}`;
  let injected = false, admissions = 0;
  let missing: { path: string; bytes: Buffer } | undefined;
  const store = createRefStore({ ...h.b.ports, lock: async (...args) => {
    const release = await h.b.ports.lock(...args);
    try {
      if (args[0] === `refs/arc/tmp/seen/${h.remoteName}` && ++admissions === 2 && blockedHistory) {
        const previous = (await h.b.git(["rev-parse", expandStoredPath(h.ending.reference).ref])).stdout.trim();
        await h.b.git(["update-ref", keeper, previous]);
        const observed = await plantRef(h.b.root, tracking, [], { parents: [previous], gitDir: h.b.gitDir,
          message: "A newly observed history tip" });
        const path = join(h.b.gitDir ?? join(h.b.root, ".git"), "objects", observed.tip.slice(0, 2), observed.tip.slice(2));
        missing = { path, bytes: await readFile(path) };
        await removeLooseObject(h.b.root, observed.tip, h.b.gitDir);
      }
      return release;
    } catch (error) { await release(); throw error; }
  }, exec: async (command, args, options) => {
    if (!injected && args.includes("fetch") && options?.input?.startsWith("refs/arc/history/")) {
      injected = true;
      await rename(h.origin, offline);
    }
    return h.b.ports.exec(command, args, options);
  } });
  try {
    const pulled = success(await store.pull());
    expect(injected).toBe(true);
    expect(pulled.pulls).toContainEqual(expect.objectContaining({ remote: h.remoteName, status: "failed",
      failure: expect.objectContaining({ code: blockedHistory ? "refused" : "unreachable" }), notices: expect.arrayContaining([
        expect.objectContaining({ kind: "namespace-corrupt", ref: h.home.ref,
          remedy: { text: expect.stringContaining(h.archive) } }),
        expect.objectContaining({ kind: "namespace-corrupt", ref: h.archive,
          remedy: { text: expect.stringContaining(h.archive) } }),
      ]) }));
    if (blockedHistory) {
      expect(missing).toBeDefined();
      expect(pulled.pulls.flatMap(row => row.notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: history,
        remedy: { text: expect.stringContaining("Restore or fetch") } }));
    }
    expect(success(await store.read({ reference: h.independent })).content).toBe("Independent update.\n");
    expect((await h.b.git(["rev-parse", h.home.ref])).stdout.trim()).toBe(h.prior);
  } finally {
    if (missing) {
      await writeFile(missing.path, missing.bytes);
      await h.b.git(["update-ref", "-d", tracking]); await h.b.git(["update-ref", "-d", keeper]);
    }
    if (injected) await rename(offline, h.origin);
  }
  const retried = success(await store.pull());
  expect(retried.pulls.find(row => row.remote === h.remoteName)?.status).not.toBe("failed");
  expect(retried.pulls.flatMap(row => row.notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: h.home.ref }));
  expect(success(await store.read({ reference: h.ending.reference })).placement?.kind).toBe("completed");
  await plantRef(h.a.root, h.archive, h.original, { parents: [h.broken.tip], gitDir: h.a.gitDir });
  await h.a.git(["push", h.remoteName, `${h.archive}:${h.archive}`]);
  expect(success(await store.pull()).pulls.flatMap(row => row.notices)).toEqual([]);
  expect(success(await store.read({ reference: h.damaged.reference })).content).toBe(makeMetaFixture("damaged"));
}, 60_000);
