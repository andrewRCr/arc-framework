/** Historical archive placement retains missing-tree facts until readable alternate witnesses are exhausted. */
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, HistoryRefSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { renderStoreCommitMessage } from "../../src/lib/store/commit-provenance.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4"), archive = `refs/arc/archive/${quarter}`;
const cases = (["default", "separate"] as const).flatMap(layout =>
  (["root", "nested"] as const).map(damage => ({ layout, damage })));

async function retainedPlacement(layout: "default" | "separate", alternate: boolean) {
  const h = await refSyncFixture(layout), scope = h.a.gitDir ? [`--git-dir=${h.a.gitDir}`] : [];
  const reference = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha", uid: randomUUID() } });
  if (!("uid" in reference.owner)) throw new Error("Expected a UID");
  const history = HistoryRefSchema.parse(`refs/arc/history/work/${reference.owner.uid}`), path = `metadata-${reference.owner.uid}.json`;
  const batch = randomUUID(), nextBatch = randomUUID();
  const metadata = { formatVersion: 1, slug: "alpha", formats: {}, batch, endBatch: batch,
    primary: { role: "work-item/meta", placement: { kind: "completed", quarter } } };
  const message = renderStoreCommitMessage({ verb: "archive", lifecycleAction: "archive" }, reference, batch);
  const plant = (ref: string, entries: Parameters<typeof plantRef>[2], parents: string[] = [], subject = message) =>
    plantRef(h.a.root, ref, entries, { parents, message: subject, gitDir: h.a.gitDir });
  const active = await plant(history, [{ path, content: JSON.stringify({ ...metadata,
    primary: { ...metadata.primary, placement: { kind: "active" } } }) }, { path: "meta-alpha.md", content: makeMetaFixture("alpha") }]);
  const endedEntries = [{ path, content: JSON.stringify(metadata) }, { path: "meta-alpha.md", content: makeMetaFixture("alpha") },
    { path: "extra-alpha.md", content: "Original companion\n" }];
  const ended = await plant(history, endedEntries, [active.tip]);
  const retained = [{ path, content: JSON.stringify({ formatVersion: 1, slug: "alpha", formats: {}, endBatch: batch }) },
    { path: "extra-alpha.md", content: "Original companion\n" }];
  const base = await plant(history, retained, [ended.tip], "Retain companion");
  const witnessEntries = (indent: number) => endedEntries.map(entry => entry.path === path
    ? { path: `01_alpha/${path}`, content: JSON.stringify(metadata, null, indent) } : { ...entry, path: `01_alpha/${entry.path}` });
  const witness = await plant(archive, witnessEntries(2));
  const nested = (await h.a.git(["rev-parse", `${witness.tip}:01_alpha`])).stdout.trim();
  expect(nested).not.toBe(ended.tree);
  const other = alternate ? await plant("refs/fixture/alternate-placement", witnessEntries(4)) : undefined;
  const later = endedEntries.map(entry => entry.path === path
    ? { path: `02_alpha/${path}`, content: JSON.stringify({ ...metadata, batch: nextBatch, endBatch: nextBatch }) }
    : { ...entry, path: `02_alpha/${entry.path}` });
  await plant(archive, later, [witness.tip, ...other ? [other.tip] : []], "Later valid end");
  await h.a.git(["push", h.remoteName, `${archive}:${archive}`, `${history}:${history}`]);
  await h.b.git(["fetch", "--no-tags", "--refmap=", h.origin, `${archive}:${archive}`, `${history}:${history}`]);
  const provenance = (verb: string) => renderStoreCommitMessage({ verb, lifecycleAction: "save" }, reference, randomUUID());
  const local = await plant(history, retained, [base.tip], provenance("Local retained state"));
  await plantRef(h.b.root, history, retained, { parents: [base.tip], message: provenance("Incoming retained state"), gitDir: h.b.gitDir });
  await h.b.git(["push", h.remoteName, `${history}:${history}`]);
  await h.a.git(["config", "fetch.unpackLimit", "100000"]);
  return { ...h, scope, history, local, witness, nested };
}

it.each(cases)("holds a missing historical $damage tree and retries exact restoration ($layout)", async ({ layout, damage }) => {
  const h = await retainedPlacement(layout, false), oid = damage === "root" ? h.witness.tree : h.nested;
  const bytes = (await h.a.ports.rawExec([...h.scope, "cat-file", "tree", oid])).stdout;
  let removed = false;
  const store = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
    const result = await h.a.ports.exec(command, args, options);
    if (!removed && args.includes("fetch") && options?.input?.includes("refs/arc/")) {
      removed = true;
      await removeLooseObject(h.a.root, oid, h.a.gitDir);
    }
    return result;
  } });
  const held = success(await store.pull({ history: [h.history] }));
  expect(removed).toBe(true);
  await expect(h.a.git(["cat-file", "-e", oid])).rejects.toMatchObject({ exitCode: 1 });
  expect(held.pulls.filter(pull => pull.status === "failed")).toEqual([]);
  expect(held.pulls.flatMap(pull => pull.notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: h.history,
    condition: expect.stringContaining(archive), remedy: { text: expect.stringMatching(/restore|fetch/iu) } }));
  expect((await h.a.git(["rev-parse", h.history])).stdout.trim()).toBe(h.local.tip);
  const restored = await h.a.ports.rawExec([...h.scope, "hash-object", "-t", "tree", "-w", "--stdin"], { input: bytes });
  expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
  expect(success(await store.pull({ history: [h.history] })).pulls.flatMap(pull => pull.notices)
    .filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
  expect((await h.a.git(["rev-parse", h.history])).stdout.trim()).not.toBe(h.local.tip);
  expect((await h.a.git(["show", `${h.history}:extra-alpha.md`])).stdout).toBe("Original companion");
}, 60_000);

it.each(["default", "separate"] as const)("uses a readable alternate placement despite another missing historical tree (%s)", async layout => {
  const h = await retainedPlacement(layout, true), oid = h.witness.tree;
  let removed = false;
  const store = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
    const result = await h.a.ports.exec(command, args, options);
    if (!removed && args.includes("fetch") && options?.input?.includes("refs/arc/")) {
      removed = true;
      await removeLooseObject(h.a.root, oid, h.a.gitDir);
    }
    return result;
  } });
  const pulled = success(await store.pull({ history: [h.history] }));
  expect(removed).toBe(true);
  expect(pulled.pulls.filter(pull => pull.status === "failed")).toEqual([]);
  expect(pulled.pulls.flatMap(pull => pull.notices).filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
  expect((await h.a.git(["rev-parse", h.history])).stdout.trim()).not.toBe(h.local.tip);
  expect((await h.a.git(["show", `${h.history}:extra-alpha.md`])).stdout).toBe("Original companion");
}, 60_000);
