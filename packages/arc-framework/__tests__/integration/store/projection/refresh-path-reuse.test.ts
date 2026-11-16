/** A new owner arriving at a canonical path vacated by an earlier generation. */
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { cohortDoc } from "../../../helpers/store/cohort-rule-input.js";
import { plantRefPrimary } from "../../../helpers/store/ref-primary-plant.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { runCohortRename } from "../../../../src/lib/store/cohort-rename.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { commitProjectionIndex, readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { withProjectionEntry } from "../../../../src/lib/store/projection/index-memory.js";
import { saveAs, SAVE_MODES } from "../../../helpers/store/projection/save-loss.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";

import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { captureWriteBackFile, prepareCapturedWriteBack } from "../../../../src/lib/store/projection/write-back.js";
import { prepareIndexedProjectionSubmission } from "../../../../src/lib/store/projection/submission.js";
import { checkProjectionRemoval } from "../../../../src/lib/store/projection/removal-check.js";
import { persistProjectionRemoval } from "../../../../src/lib/store/projection/removal-persist.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

async function reusedPathFixture(plantArrival = true) {
  const h = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  directories.push(h.f.root);
  const first = await seed(h.f, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" })), cohortDoc().content);
  await rm(join(h.projected.location.stateDir, "index"));
  await startProjection({ checkout: h.f.root, store: h.f.store });
  await endProjection({ checkout: h.f.root, store: h.f.store });
  const path = ".arc/backlog/planned/group/cohort-group.md";
  const old = await readFile(join(h.f.root, path), "utf8");
  expect(await runCohortRename(h.f.store, first, { operand: "group", targetSlug: "root" })).toMatchObject({ status: "renamed" });
  const arrived = cohortDoc().content.replace("Coordinate the work.", "A distinct arriving generation.");
  const receive = () => plantRefPrimary(h.f, { kind: "cohort/document" as const, name: "group",
    uid: "00000000-0000-4000-8000-000000000099", content: arrived });
  if (plantArrival) await receive();
  return { ...h, first, arrived, path, old, receive };
}

it("keeps a new generation retryable when it arrives at a renamed cohort's former path", async () => {
  const h = await reusedPathFixture();
  for (let command = 0; command < 2; command += 1) {
    expect(await startProjection({ checkout: h.f.root, store: h.f.store })).toMatchObject({ kind: "ready" });
    await endProjection({ checkout: h.f.root, store: h.f.store });
  }
  expect(parseStampedFile(await readFile(join(h.f.root, ".arc/backlog/planned/root/cohort-root.md"), "utf8")).content).toContain("root");
  expect(parseStampedFile(await readFile(join(h.f.root, h.path), "utf8")).content).toBe(h.arrived);
});

it("checks a journaled installed arrival without publishing its ownership confirmation", async () => {
  const h = await reusedPathFixture();
  const command = { checkout: h.f.root, store: h.f.store };
  await startProjection(command);
  await endProjection(command);
  await startProjection(command);
  const indexPath = join(h.projected.location.stateDir, "index");
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  expect(disk).toMatchObject({ kind: "index", index: { entries: { [h.path]: { withheld: true,
    handoff: { reference: { owner: { uid: "00000000-0000-4000-8000-000000000099" } } },
  } } } });
  const header = await readFile(indexPath), bytes = await readFile(join(h.f.root, h.path));
  const version = success(await h.f.store.version());
  expect(await checkProjectionRemoval(h.f.root, { store: h.f.store, identity: SlugSchema.parse("andrew") })).toEqual({ kind: "passes" });
  expect(await readFile(indexPath)).toEqual(header);
  expect(await readFile(join(h.f.root, h.path))).toEqual(bytes);
  expect(success(await h.f.store.version())).toBe(version);
  await endProjection(command);
});

it("persists an installed ownership arrival under its own lease before dropping the command binding", async () => {
  const h = await reusedPathFixture(), command = { checkout: h.f.root, store: h.f.store };
  await startProjection(command);
  await endProjection(command);
  await startProjection(command);
  expect(await readProjectionIndex(h.projected.location, true, { groups: "all" })).toMatchObject({ kind: "index", index: {
    entries: { [h.path]: { withheld: true, handoff: expect.any(Object) } },
  } });
  expect(await persistProjectionRemoval(h.f.root, { store: h.f.store, identity: SlugSchema.parse("andrew") })).toEqual({ kind: "persisted" });
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("No persisted ownership index");
  expect(disk.index.entries[h.path]).toMatchObject({ reference: { owner: { uid: "00000000-0000-4000-8000-000000000099" } }, withheld: false });
  expect(disk.index.entries[h.path]).not.toHaveProperty("handoff");
  expect(parseStampedFile(await readFile(join(h.f.root, h.path), "utf8")).content).toBe(h.arrived);
  expect(projectionProcessState().roots.has(h.f.root)).toBe(false);
  await endProjection(command);
}, 30_000);

it("holds ambiguous handoff bytes during persistence and proceeds after their explicit deletion", async () => {
  const h = await reusedPathFixture(), command = { checkout: h.f.root, store: h.f.store };
  await startProjection(command);
  await endProjection(command);
  await startProjection(command);
  const late = h.old.replace("Coordinate the work.", "A late leaving save must stay recoverable.");
  await writeFile(join(h.f.root, h.path), late);
  const version = success(await h.f.store.version());
  expect(await persistProjectionRemoval(h.f.root, { store: h.f.store, identity: SlugSchema.parse("andrew") }))
    .toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining("delete the withheld file") } });
  expect(await readFile(join(h.f.root, h.path), "utf8")).toBe(late);
  expect(success(await h.f.store.version())).toBe(version);
  await rm(join(h.f.root, h.path));
  expect(await persistProjectionRemoval(h.f.root, { store: h.f.store, identity: SlugSchema.parse("andrew") })).toEqual({ kind: "persisted" });
  expect(success(await h.f.store.version())).toBe(version);
  await endProjection(command);
}, 30_000);

it.each(SAVE_MODES)("holds a late %s save across command end and resumes after deletion", async mode => {
  const h = await reusedPathFixture();
  const command = { checkout: h.f.root, store: h.f.store };
  // The first command removes the departing generation; its end settles the last old aside copy.
  await startProjection(command);
  await endProjection(command);
  await startProjection(command);
  const journal = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  expect(journal).toMatchObject({ kind: "index", index: { entries: { [h.path]: { withheld: true,
    handoff: { reference: { owner: { uid: "00000000-0000-4000-8000-000000000099" } } },
  } } } });
  const late = h.old.replace("Coordinate the work.", "A late leaving save must stay recoverable.");
  await saveAs(mode, join(h.f.root, h.path), late);
  await endProjection(command);
  await startProjection(command);
  await endProjection(command);
  expect(await readFile(join(h.f.root, h.path), "utf8")).toBe(late);
  const held = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  expect(held).toMatchObject({ kind: "index", index: { entries: { [h.path]: { withheld: true,
    handoff: { reference: { owner: { uid: "00000000-0000-4000-8000-000000000099" } } },
  } } } });
  expect(await h.f.store.read({ reference: h.first.reference })).toMatchObject({ status: "ok",
    result: { content: expect.not.stringContaining("A late leaving save") } });
  const arrival = recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group",
    uid: "00000000-0000-4000-8000-000000000099" }));
  expect(await h.f.store.read({ reference: arrival })).toMatchObject({ status: "ok", result: { content: h.arrived } });
  await rm(join(h.f.root, h.path));
  await startProjection(command);
  await endProjection(command);
  expect(parseStampedFile(await readFile(join(h.f.root, h.path), "utf8")).content).toBe(h.arrived);
});

async function startedIndex(h: Awaited<ReturnType<typeof reusedPathFixture>>) {
  await startProjection({ checkout: h.f.root, store: h.f.store });
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing started index");
  return disk.index;
}

it("journals an arrival at a reused path and recovers it across the starts that follow", async () => {
  const h = await reusedPathFixture();
  const before = await readProjectionIndex(h.projected.location, true);
  if (before.kind !== "index") throw new Error("Missing original anchor");
  const first = await startedIndex(h);
  expect(first.state).toBe(before.index.state);
  await endProjection({ checkout: h.f.root, store: h.f.store });
  const second = await startedIndex(h);
  expect(second.entries[h.path]).toMatchObject({ withheld: true, handoff: { reference: { owner: {
    uid: "00000000-0000-4000-8000-000000000099",
  } } } });
  await endProjection({ checkout: h.f.root, store: h.f.store });
  const recovered = await startedIndex(h);
  expect(recovered.entries[h.path]).toMatchObject({ reference: { owner: { uid: "00000000-0000-4000-8000-000000000099" } },
    withheld: false, pending: false });
  expect(recovered.state).toBe(success(await h.f.store.version()));
  expect(parseStampedFile(await readFile(join(h.f.root, h.path), "utf8")).content).toBe(h.arrived);
  await endProjection({ checkout: h.f.root, store: h.f.store });
});

it("retries a pending departure when a later primary arrival occupies its old plan key", async () => {
  const h = await reusedPathFixture(false);
  const command = { checkout: h.f.root, store: h.f.store };
  const leaving = success(await h.f.store.read({ reference: h.first.reference }));
  const rendered = renderStampedFile({ content: leaving.content, stamp: gitBlobId(leaving.content, "sha1") });
  const late = rendered.replace("Coordinate the work.", "A valid late correction.");
  const refused = createRefusingStore(h.f.store);
  refused.refuse("batch", StoreRefusalSchema.parse({ code: "lock-held", class: "recoverable", lock: "cohort",
    condition: "The leaving edit is temporarily locked.", remedy: { text: "Release the lock and retry." } }));
  let stopped = false;
  const native = createProjectionEnginePorts(h.f.root);
  await startProjection({ ...command, store: refused.store, ports: () => ({ ...native,
    writer: async () => ({ ...await native.writer(), processInstance: "blocked-departure-writer" }), hooks: {
    afterRecheck: async path => {
      if (path !== h.path || stopped) return;
      stopped = true;
      await writeFile(join(h.f.root, path), late);
    },
  } }) });
  await endProjection({ ...command, store: refused.store });
  expect(stopped).toBe(true);
  const held = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (held.kind !== "index") throw new Error("Missing pending departure");
  const entry = held.index.entries[h.path];
  if (entry?.kind !== "record" || entry.copies.length === 0) throw new Error("Missing refused late copy");
  for (const copy of entry.copies) {
    expect(await readFile(join(h.f.root, copy.name), "utf8")).toBe(late);
    await rm(join(h.f.root, copy.name));
  }
  expect(await h.f.store.read({ reference: h.first.reference })).toMatchObject({ status: "ok", result: { content: leaving.content } });
  await writeFile(join(h.f.root, h.path), rendered);
  await h.receive();
  const version = success(await h.f.store.version());
  for (let retry = 0; retry < 3; retry += 1) {
    await startProjection(command);
    await endProjection(command);
  }
  expect(parseStampedFile(await readFile(join(h.f.root, h.path), "utf8")).content).toBe(h.arrived);
  expect(success(await h.f.store.version())).toBe(version);
});

it("keeps the captured old basis while canonical naming is rechecked at atomic admission", async () => {
  const h = await reusedPathFixture();
  const root = projectionProcessState().roots.get(h.f.root);
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (root === undefined || disk.kind !== "index") throw new Error("Missing captured root");
  const entry = disk.index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("Missing leaving basis");
  const authored = h.old.replace("Coordinate the work.", "Authored before a second rename.");
  await writeFile(join(h.f.root, h.path), authored);
  const request = { checkout: h.f.root, path: h.path, copy: null, entry,
    base: { kind: "stamp" as const, stamp: entry.base.blob } };
  const captured = await captureWriteBackFile(root.context, request);
  if (captured.kind !== "read") throw new Error("Authored input did not settle");
  const prepare = async () => {
    const content = await prepareCapturedWriteBack(root.context, request, captured);
    if (content.kind !== "ready") throw new Error("Captured edit refused");
    expect(content.selectedBase).toMatchObject({ kind: "stored", version: entry.base.version });
    expect(request.entry.reference).toEqual(h.first.reference);
    return success(await prepareIndexedProjectionSubmission(root.context, request, content));
  };
  const stale = await prepare();
  expect(stale.plan.mutation.reference.owner).toMatchObject({ uid: h.first.reference.owner.type === "cohort"
    ? h.first.reference.owner.uid : "missing", name: "root" });
  const current = success(await h.f.store.read({ reference: h.first.reference }));
  expect(await runCohortRename(h.f.store, current, { operand: "root", targetSlug: "other" })).toMatchObject({ status: "renamed" });
  expect(await h.f.store.batch(stale.batch)).toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
  expect(success(await h.f.store.read({ reference: h.first.reference })).reference.owner.name).toBe("other");
  const fresh = await prepare();
  expect(fresh.plan.mutation.reference.owner.name).toBe("other");
  expect(await h.f.store.batch(fresh.batch)).toMatchObject({ status: "ok" });
  const updated = success(await h.f.store.read({ reference: h.first.reference }));
  expect(updated.reference.owner.name).toBe("other");
  expect(updated.content).toContain("Authored before a second rename.");
  const arriving = entry.reference.owner.type === "cohort" ? recordReferences["cohort/document"](OwnerIdentitySchema.parse({
    type: "cohort", name: "group", uid: "00000000-0000-4000-8000-000000000099",
  })) : entry.reference;
  expect(success(await h.f.store.read({ reference: arriving })).content).toBe(h.arrived);
});

it("reports two live units claiming an unbound checkout's slug, with a rename remedy, when a rebuild cannot tell its own", async () => {
  const h = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  directories.push(h.f.root);
  await writeWorktreeMarker(h.f.root, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "alpha" },
    spawningIdentity: "andrew", createdAt: new Date(0).toISOString() });
  await plantRefPrimary(h.f, { kind: "work-item/meta", name: "alpha", uid: "00000000-0000-4000-8000-0000000000aa",
    content: makeMetaFixture("alpha", { owner: "bob", state: "Active", workClass: "Light", priority: "P2", currentWorkflow: "process-task-loop" }) });
  await rm(join(h.projected.location.stateDir, "index"));
  const command = { checkout: h.f.root, store: h.f.store };
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  const clash = projectionProcessState().diagnostics.find(each => each.mark.reason.startsWith("ambiguous-claim:"));
  await endProjection(command);
  expect(clash?.mark.reason).toContain("`alpha`");
  expect(clash?.mark.remedy.text).toContain("arc rename 00000000-0000-4000-8000-0000000000aa <new-slug>");
});

async function unbindAlpha(root: string): Promise<void> {
  await writeWorktreeMarker(root, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "alpha" },
    spawningIdentity: "andrew", createdAt: new Date(0).toISOString() });
}

function claimClashReported(): boolean {
  return projectionProcessState().diagnostics.some(each => each.mark.reason.startsWith("ambiguous-claim:"));
}

it.each(["bound", "unbound"] as const)("never lays another live unit that shares a %s checkout's slug at the checkout's own path", async marker => {
  const h = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  directories.push(h.f.root);
  if (marker === "unbound") await unbindAlpha(h.f.root);
  const command = { checkout: h.f.root, store: h.f.store }, [path] = Object.keys(h.projected.index.entries);
  if (path === undefined) throw new Error("Missing own metadata path");
  await rm(join(h.projected.location.stateDir, "index"));
  await startProjection(command);
  await endProjection(command);
  const own = await readFile(join(h.f.root, path), "utf8");
  const other = await plantRefPrimary(h.f, { kind: "work-item/meta", name: "alpha", uid: "00000000-0000-4000-8000-0000000000aa",
    content: makeMetaFixture("alpha", { owner: "bob", state: "Active", workClass: "Light", priority: "P2", currentWorkflow: "process-task-loop" }) });
  for (let round = 0; round < 2; round += 1) {
    expect(await startProjection(command)).toMatchObject({ kind: "ready" });
    expect(claimClashReported()).toBe(marker === "unbound");
    // A UID-bound claim reads its own unit exactly, so the other live unit never makes that read refuse.
    if (marker === "bound") expect(projectionProcessState().diagnostics).toEqual([]);
    await endProjection(command);
    expect(await readFile(join(h.f.root, path), "utf8")).toBe(own);
  }
  if (marker === "bound") {
    const bound = await readProjectionIndex(h.projected.location, true);
    expect(bound).toMatchObject({ kind: "index", index: { state: success(await h.f.store.version()) } });
  }
  if (marker === "unbound") {
    const planted = success(await h.f.store.read({ reference: other }));
    success(await h.f.store.write({ action: "remove", reference: other, expected: planted.version, provenance: { verb: "merge", lifecycleAction: "remove" } }));
    expect(await startProjection(command)).toMatchObject({ kind: "ready" });
    expect(claimClashReported()).toBe(false);
    await endProjection(command);
    expect(await readFile(join(h.f.root, path), "utf8")).toBe(own);
  }
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (marker === "unbound") expect(disk).toMatchObject({ kind: "index", index: { state: success(await h.f.store.version()) } });
  const owner = h.primary.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("The own primary lacks a UID");
  expect(disk.kind === "index" ? disk.index.entries[path] : "unread").toMatchObject({ reference: { owner: { uid: owner.uid } } });
});

it("holds a same-slug unit's changed record out of the own folder once the checkout's claim loses its UID", async () => {
  const h = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  directories.push(h.f.root);
  const other = await plantRefPrimary(h.f, { kind: "work-item/meta", name: "alpha", uid: "00000000-0000-4000-8000-0000000000aa",
    content: makeMetaFixture("alpha", { owner: "andrew", state: "Active", workClass: "Light", priority: "P2", currentWorkflow: "process-task-loop" }) });
  const command = { checkout: h.f.root, store: h.f.store };
  await rm(join(h.projected.location.stateDir, "index"));
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  await endProjection(command);
  await unbindAlpha(h.f.root);
  await seed(h.f, recordReferences["work-item/notes"](other.owner), "Notes of the other live alpha.\n");
  for (let round = 0; round < 2; round += 1) {
    expect(await startProjection(command)).toMatchObject({ kind: "ready" });
    expect(claimClashReported()).toBe(true);
    await endProjection(command);
    await expect(readFile(join(h.f.root, ".arc/active/current/notes-alpha.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  }
});

it("keeps a journaled arrival's check unobservable while the ignore guard cannot be read, and passes once it reads", async () => {
  const h = await reusedPathFixture(), command = { checkout: h.f.root, store: h.f.store };
  await startProjection(command);
  await endProjection(command);
  await startProjection(command);
  // A changed ignore file stales the recorded proof, so the check reads the guard afresh.
  const excludes = join(h.projected.location.commonDir, "info/exclude");
  await writeFile(excludes, `${await readFile(excludes, "utf8")}\n# A changed ignore file.\n`);
  let denied = true;
  const ports = () => {
    const native = createProjectionEnginePorts(h.f.root);
    return { ...native, execInput: (args: string[], input: string, options?: Parameters<typeof native.execInput>[2]) =>
      denied && args.includes("check-ignore") ? Promise.reject(new Error("Ignore rules cannot be read")) : native.execInput(args, input, options) };
  };
  const context = { store: h.f.store, identity: SlugSchema.parse("andrew"), ports };
  expect(await checkProjectionRemoval(h.f.root, context)).toEqual({ kind: "unobservable",
    detail: `Cannot observe the projection at ${h.f.root}: Projection ignore guard failed: Ignore rules cannot be read. The projection writes into no root until the guard passes` });
  denied = false;
  expect(await checkProjectionRemoval(h.f.root, context)).toEqual({ kind: "passes" });
  await endProjection(command);
});

it("keeps a held handoff's ownership mark through a later start's refresh, never reporting the generic withheld mark", async () => {
  const h = await reusedPathFixture(), command = { checkout: h.f.root, store: h.f.store };
  await startProjection(command);
  await endProjection(command);
  await startProjection(command);
  await writeFile(join(h.f.root, h.path), h.old.replace("Coordinate the work.", "A late leaving save must stay recoverable."));
  await endProjection(command);
  await startProjection(command);
  const marks = projectionProcessState().diagnostics.filter(each => each.path === h.path).map(each => each.mark.reason);
  expect(await readProjectionIndex(h.projected.location, true, { groups: "all" })).toMatchObject({ kind: "index", index: { entries: {
    [h.path]: { withheld: true, refused: { reason: expect.stringContaining("Ownership handoff") } },
  } } });
  expect(marks).toContainEqual(expect.stringContaining("Ownership handoff"));
  expect(marks).not.toContainEqual(expect.stringContaining("no trustworthy basis"));
  await endProjection(command);
});

it("carries a moved record's changed mark onto a path another record is vacating", async () => {
  const h = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  directories.push(h.f.root);
  const command = { checkout: h.f.root, store: h.f.store };
  const leaving = await seed(h.f, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" })), cohortDoc().content);
  const moving = await seed(h.f, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "other" })),
    cohortDoc("other").content);
  await rm(join(h.projected.location.stateDir, "index"));
  await startProjection(command);
  await endProjection(command);
  const path = ".arc/backlog/planned/group/cohort-group.md", from = ".arc/backlog/planned/other/cohort-other.md";
  await withProjectionLock(h.projected.location, async session => {
    const read = await readProjectionIndex(h.projected.location, true, { groups: "all" });
    if (read.kind !== "index") throw new Error("Missing index");
    const entry = read.index.entries[from];
    if (entry?.kind !== "record") throw new Error("Missing moving entry");
    await commitProjectionIndex({ location: h.projected.location, checkout: h.f.root, checkpoint: session.step,
      index: withProjectionEntry(read.index, from, { ...entry, changed: true }) });
  });
  expect(await runCohortRename(h.f.store, leaving, { operand: "group", targetSlug: "root" })).toMatchObject({ status: "renamed" });
  const owner = moving.reference.owner, uid = owner.type === "person" ? undefined : owner.uid;
  if (uid === undefined) throw new Error("Missing moving UID");
  // A concurrent writer's rename of the moving cohort onto the vacated name arrives with the next pull.
  await plantRefPrimary(h.f, { kind: "cohort/document", name: "group", uid,
    content: cohortDoc().content.replace("Coordinate the work.", "The moving cohort under its new name.") });
  for (let round = 0; round < 3; round++) {
    await startProjection(command);
    await endProjection(command);
  }
  const index = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (index.kind !== "index") throw new Error("Missing index");
  const arrived = index.index.entries[path];
  expect(arrived).toMatchObject({ kind: "record", changed: true, reference: { owner: { uid } } });
  expect(arrived?.kind === "record" ? arrived.handoff : null).toBeUndefined();
}, 30_000);

it("confirms an unmarked arrival at a path whose leaving record carries a changed mark, and moves that mark with its record", async () => {
  const h = await reusedPathFixture(false), command = { checkout: h.f.root, store: h.f.store };
  await withProjectionLock(h.projected.location, async session => {
    const read = await readProjectionIndex(h.projected.location, true, { groups: "all" });
    if (read.kind !== "index") throw new Error("Missing index");
    const entry = read.index.entries[h.path];
    if (entry?.kind !== "record") throw new Error("Missing leaving entry");
    await commitProjectionIndex({ location: h.projected.location, checkout: h.f.root, checkpoint: session.step,
      index: withProjectionEntry(read.index, h.path, { ...entry, changed: true }) });
  });
  await h.receive();
  for (let round = 0; round < 3; round++) {
    await startProjection(command);
    await endProjection(command);
  }
  const index = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (index.kind !== "index") throw new Error("Missing index");
  const arrived = index.index.entries[h.path];
  expect(arrived).toMatchObject({ kind: "record", changed: false, reference: { owner: { uid: "00000000-0000-4000-8000-000000000099" } } });
  expect(arrived?.kind === "record" ? arrived.handoff : null).toBeUndefined();
  expect(index.index.entries[".arc/backlog/planned/root/cohort-root.md"]).toMatchObject({ kind: "record", changed: true });
}, 30_000);

/** Run commands until the arrival at a reused path is installed and confirmed, then check it and the anchor. */
async function expectInstalled(h: Awaited<ReturnType<typeof reusedPathFixture>>) {
  const command = { checkout: h.f.root, store: h.f.store };
  for (let round = 0; round < 3; round++) {
    expect(await startProjection(command)).toMatchObject({ kind: "ready" });
    await endProjection(command);
  }
  const index = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  expect(index).toMatchObject({ kind: "index", index: { state: success(await h.f.store.version()), entries: { [h.path]: {
    reference: { owner: { uid: "00000000-0000-4000-8000-000000000099" } }, pending: false, withheld: false } } } });
}

it("holds an arrival at a reused path while a regular file occupies its folder, reported, and installs it once the file moves", async () => {
  const h = await reusedPathFixture(), command = { checkout: h.f.root, store: h.f.store };
  const folder = join(h.f.root, ".arc/backlog/planned/group");
  const anchor = await readProjectionIndex(h.projected.location, true);
  await rm(folder, { recursive: true });
  await writeFile(folder, "An editor's side file where a folder belongs.\n");
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  expect(projectionProcessState().diagnostics).toContainEqual({ path: h.path, copy: null,
    mark: { reason: expect.stringContaining("occupies a folder"), remedy: { text: expect.stringContaining("Move or delete") } } });
  await endProjection(command);
  expect(await readProjectionIndex(h.projected.location, true)).toMatchObject({ kind: "index", index: {
    state: anchor.kind === "index" ? anchor.index.state : "unread",
    entries: { [h.path]: { reference: h.first.reference, pending: true } } } });
  await rm(folder);
  await expectInstalled(h);
}, 30_000);
