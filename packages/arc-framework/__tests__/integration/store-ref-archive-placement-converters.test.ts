/** Pull placement completion preserves owned archive faults and successful historical fallback. */

import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { HistoryRefSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { renderStoreCommitMessage } from "../../src/lib/store/commit-provenance.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4"), archive = `refs/arc/archive/${quarter}`;

it.each([true, false])("holds a live item merge with its owned placement fault, then retries repair (end batch: %s)", async endBatch => {
  const h = await refSyncFixture();
  const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("placement-sync"),
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "placement-sync" } }),
    placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  if (!("uid" in made.reference.owner)) throw new Error("Expected a UID");
  const live = `refs/arc/work/${made.reference.owner.uid}`, path = `metadata-${made.reference.owner.uid}.json`;
  const entries = await capturedEntries(h.a, live), batch = randomUUID();
  const metadata = JSON.parse((await h.a.git(["show", `${live}:${path}`])).stdout);
  const completed = { ...metadata, batch, ...endBatch ? { endBatch: batch } : {}, primary: { ...metadata.primary, placement: { kind: "completed", quarter } } };
  const base = (await h.a.git(["rev-parse", live])).stdout.trim();
  const local = await plantRef(h.a.root, live, entries.map(entry => entry.path === path ? { path, content: JSON.stringify(completed) } : entry),
    { parents: [base], message: renderStoreCommitMessage({ verb: "archive", lifecycleAction: "archive" }, made.reference, batch) });
  const root = "01_placement-sync/";
  const damaged = await plantRef(h.a.root, archive, entries.map(entry => ({ ...entry, path: root + entry.path })), { message: "Misplaced local folder" });
  const remote = success(await h.b.store.read({ reference: made.reference }));
  success(await h.b.store.write({ action: "put", reference: remote.reference, expected: remote.version,
    content: `${remote.content}\nPublished edit.\n`, placement: { kind: "active" }, provenance: { verb: "save", lifecycleAction: "save" } }));
  success(await h.b.store.push());
  const held = success(await h.a.store.pull());
  expect(held.pulls.every(pull => pull.status !== "failed")).toBe(true);
  expect(held.pulls.flatMap(pull => pull.notices)).toContainEqual(expect.objectContaining({
    kind: "namespace-corrupt", ref: live, condition: expect.stringContaining("placement is active, not completed"),
    remedy: { text: expect.stringContaining("completed placement") },
  }));
  expect((await h.a.git(["rev-parse", live])).stdout.trim()).toBe(local.tip);
  const repaired = await plantRef(h.a.root, archive, entries.map(entry => entry.path === path
    ? { path: root + path, content: JSON.stringify(completed) } : { ...entry, path: root + entry.path }),
  { parents: [damaged.tip], message: "Repair completed placement" });
  const pending = success(await h.a.store.pull()).pulls.flatMap(pull => pull.notices);
  expect(pending.filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
  expect(pending).toContainEqual(expect.objectContaining({ kind: "end-pending", ref: live.replace("refs/arc/", "refs/arc/history/") }));
  expect((await h.a.git(["rev-parse", live])).stdout.trim()).toBe(local.tip);
  expect((await h.a.git(["show", `${live}:meta-placement-sync.md`])).stdout).toBe(remote.content.trimEnd());
  // This externally planted item is still live; remove its spurious archive and repair its live controls forward.
  await plantRef(h.a.root, archive, [], { parents: [repaired.tip], message: "Remove the live item's spurious folder" });
  await plantRef(h.a.root, live, entries, { parents: [local.tip], message: "Repair live placement controls" });
  const retried = success(await h.a.store.pull());
  expect(retried.pulls.flatMap(pull => pull.notices).filter(notice => notice.kind === "namespace-corrupt" || notice.kind === "end-pending")).toEqual([]);
  expect(success(await h.a.store.read({ reference: made.reference })).content).toContain("Published edit.");
  await expect(h.a.git(["merge-base", "--is-ancestor", local.tip, live])).resolves.toBeDefined();
});

it("holds retained companion reconciliation on a misplaced ancestor and retries restored placement evidence", async () => {
  const h = await refSyncFixture();
  const reference = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha", uid: randomUUID() } });
  if (!("uid" in reference.owner)) throw new Error("Expected a UID");
  const history = `refs/arc/history/work/${reference.owner.uid}`, path = `metadata-${reference.owner.uid}.json`;
  const batch = randomUUID(), nextBatch = randomUUID();
  const metadata = { formatVersion: 1, slug: "alpha", formats: {}, batch, endBatch: batch,
    primary: { role: "work-item/meta", placement: { kind: "completed", quarter } } };
  const message = renderStoreCommitMessage({ verb: "archive", lifecycleAction: "archive" }, reference, batch);
  const active = await plantRef(h.a.root, history, [{ path, content: JSON.stringify({ ...metadata,
    primary: { ...metadata.primary, placement: { kind: "active" } } }) }, { path: "meta-alpha.md", content: makeMetaFixture("alpha") }]);
  const endedEntries = [{ path, content: JSON.stringify(metadata) }, { path: "meta-alpha.md", content: makeMetaFixture("alpha") },
    { path: "extra-alpha.md", content: "Original companion\n" }];
  const ended = await plantRef(h.a.root, history, endedEntries, { parents: [active.tip], message });
  const retained = [{ path, content: JSON.stringify({ formatVersion: 1, slug: "alpha", formats: {}, endBatch: batch }) },
    { path: "extra-alpha.md", content: "Original companion\n" }];
  const base = await plantRef(h.a.root, history, retained, { parents: [ended.tip], message: "Retain companion" });
  const damaged = await plantRef(h.a.root, archive, endedEntries.map(entry => entry.path === path
    ? { path: `01_alpha/${path}`, content: JSON.stringify({ ...metadata, primary: { ...metadata.primary,
      placement: { kind: "completed", quarter: "2027-q1" } } }) } : { ...entry, path: `01_alpha/${entry.path}` }), { message });
  const later = endedEntries.map(entry => entry.path === path
    ? { path: `02_alpha/${path}`, content: JSON.stringify({ ...metadata, batch: nextBatch, endBatch: nextBatch }) }
    : { ...entry, path: `02_alpha/${entry.path}` });
  const current = await plantRef(h.a.root, archive, later, { parents: [damaged.tip], message: "Later valid end" });
  await h.a.git(["push", h.remoteName, `${archive}:${archive}`, `${history}:${history}`]);
  await h.b.git(["fetch", "--no-tags", "--refmap=", h.origin, `${archive}:${archive}`, `${history}:${history}`]);
  const provenance = (verb: string) => renderStoreCommitMessage({ verb, lifecycleAction: "save" }, reference, randomUUID());
  const local = await plantRef(h.a.root, history, retained, { parents: [base.tip], message: provenance("Local retained state") });
  await plantRef(h.b.root, history, retained, { parents: [base.tip], message: provenance("Incoming retained state") });
  await h.b.git(["push", h.remoteName, `${history}:${history}`]);
  const held = success(await h.a.store.pull({ history: [HistoryRefSchema.parse(history)] }));
  expect(held.pulls.every(pull => pull.status !== "failed")).toBe(true);
  expect(held.pulls.flatMap(pull => pull.notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: history,
    condition: expect.stringContaining("metadata records quarter 2027-q1"),
    remedy: { text: expect.stringContaining("cannot change an ancestor") },
  }));
  expect((await h.a.git(["rev-parse", history])).stdout.trim()).toBe(local.tip);
  const restored = await plantRef(h.a.root, "refs/fixture/restored-placement", endedEntries.map(entry => ({ ...entry, path: `01_alpha/${entry.path}` })), { message });
  await plantRef(h.a.root, archive, later, { parents: [current.tip, restored.tip], message: "Link restored earlier placement evidence" });
  expect(success(await h.a.store.pull({ history: [HistoryRefSchema.parse(history)] })).pulls
    .flatMap(pull => pull.notices).filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
  expect((await h.a.git(["show", `${history}:extra-alpha.md`])).stdout).toBe("Original companion");
  expect((await h.a.git(["rev-parse", history])).stdout.trim()).not.toBe(local.tip);
});
