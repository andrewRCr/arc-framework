import { writeBackProjectionFiles } from "../../../../src/lib/store/projection/engine-files.js";
/** Every archive staging follows the target checkout's own opened entry. */
import { mkdtemp, chmod, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { configureEngineCheckout, createEngineFixture } from "../../../helpers/store/projection/engine-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { success, update } from "../../../helpers/store/suite-tools.js";
import { TASK_RULE_CONTENT } from "../../../helpers/store/task-rule-input.js";
import { TASK_LIST_REGISTRATION } from "../../../../src/lib/store/kinds/task-list/registration.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { recordReferences, sameReference } from "../../../../src/lib/store/identity.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { projectionEditResult } from "../../../../src/lib/store/projection/edit.js";
import { restoreSyncProjection } from "../../../../src/lib/store/projection/sync-materialization.js";

import { bindSpawnMaterialization, materializeSpawnedProjection } from "../../../../src/lib/store/projection/spawn-materialization.js";
import { openArchivedProjectionFile } from "../../../helpers/store/projection/open-file.js";
import { withFanOut } from "../../../../src/lib/store/projection/with-fan-out.js";
import { createProjectionFanOutDependencies } from "../../../../src/lib/store/projection/fan-out-binding.js";
import { writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { readWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { createRecordRenderer } from "../../../../src/lib/store/projection/record-render.js";
import { installProjectionHandoff } from "../../../../src/lib/store/projection/ownership-install.js";
import { projectionEntryForRecord } from "../../../../src/lib/store/projection/materialization-file.js";
import { stageRecordFile } from "../../../../src/lib/store/projection/staging.js";
import { projectionLayMode } from "../../../../src/lib/store/projection/lay-mode.js";
import { guardReplacement } from "../../../../src/lib/store/projection/replace-guard.js";
import { createWriteBackPort } from "../../../../src/lib/store/projection/write-back.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

async function archive(kind: "work-item/companion" | "work-item/task-list" = "work-item/companion") {
  const h = await createEngineFixture(directories, { kind, registryOverrides: { "work-item/task-list": { parser: TASK_LIST_REGISTRATION.parser } },
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
    content: kind === "work-item/task-list" ? TASK_RULE_CONTENT.replaceAll("`[ ]`", "`[x]`") + "\nStored note.\n"
      : "Opening.\nStored note.\nClosing.\n" });
  await rm(join(h.checkout, h.path));
  await rm(join(h.location.stateDir, "index"));
  const input = { store: h.store, checkout: h.checkout };
  expect(await startProjection(input)).toMatchObject({ kind: "ready" });
  await endProjection(input);
  const index = await h.disk();
  const path = Object.entries(index.entries).find(([, entry]) => entry.kind === "record" && sameReference(entry.reference, h.record.reference))?.[0];
  if (path === undefined || !path.startsWith(".arc/completed/")) throw new Error("The archive was not materialized");
  return { ...h, path, input, file: () => readFile(join(h.checkout, path), "utf8"),
    open: () => projectionEditResult(h.store, h.checkout, join(h.checkout, path)) };
}
async function writable(checkout: string, path: string): Promise<boolean> {
  return ((await stat(join(checkout, path))).mode & 0o200) !== 0;
}

it("lays a fresh materialization and a no-index rebuild read-only without changing protection", async () => {
  const h = await archive();
  for (const [path, entry] of Object.entries((await h.disk()).entries)) {
    if (!path.startsWith(".arc/completed/")) continue;
    expect(await writable(h.checkout, path)).toBe(false);
    expect(entry).toMatchObject({ kind: "record", protected: false });
    await chmod(join(h.checkout, path), 0o644);
  }
  await rm(join(h.location.stateDir, "index"));
  await startProjection(h.input);
  await endProjection(h.input);
  expect(await writable(h.checkout, h.path)).toBe(false);
});

it.each([false, true])("refreshes an archive by its opened=%s state and keeps unchanged modes in place", async opened => {
  const h = await archive();
  if (opened) expect(await h.open()).toMatchObject({ status: "ok" });
  else await chmod(join(h.checkout, h.path), 0o444);
  const current = success(await h.store.read({ reference: h.record.reference }));
  success(await h.store.write(update(h, current, current.content + "A new stored footer.\n")));
  await startProjection(h.input);
  await endProjection(h.input);
  expect(await writable(h.checkout, h.path)).toBe(opened);
  expect(await h.file()).toContain("A new stored footer.");
  const before = await stat(join(h.checkout, h.path), { bigint: true });
  await startProjection(h.input);
  await endProjection(h.input);
  const after = await stat(join(h.checkout, h.path), { bigint: true });
  expect({ ino: after.ino, mtimeNs: after.mtimeNs }).toEqual({ ino: before.ino, mtimeNs: before.mtimeNs });
  expect(await writable(h.checkout, h.path)).toBe(opened);
});

it.each([false, true])("restores a deleted archive through sync by its opened=%s state", async opened => {
  const h = await archive();
  if (opened) expect(await h.open()).toMatchObject({ status: "ok" });
  await rm(join(h.checkout, h.path));
  await restoreSyncProjection(h.store, h.checkout, {});
  expect(await writable(h.checkout, h.path)).toBe(opened);
  expect(await h.file()).toContain("Stored note.");
});

it("lays a save landing read-only and clears its opened mark", async () => {
  const h = await archive();
  expect(await h.open()).toMatchObject({ status: "ok" });
  await writeFile(join(h.checkout, h.path), (await h.file()) + "An archived correction.\n");
  await startProjection({ ...h.input, mode: "save" });
  await endProjection(h.input);
  expect(success(await h.store.read({ reference: h.record.reference })).content).toContain("An archived correction.");
  expect(await writable(h.checkout, h.path)).toBe(false);
  expect((await h.disk()).entries[h.path]).toMatchObject({ protected: false });
  expect((await h.disk()).entries[h.path]).not.toHaveProperty("opened");
});

async function sibling(h: Awaited<ReturnType<typeof archive>>) {
  await h.exec("git", ["commit", "--allow-empty", "-m", "Seed code"], { cwd: h.checkout });
  const parent = await mkdtemp(join(tmpdir(), "arc-archive-mode-")); directories.push(parent);
  const checkout = join(parent, "linked");
  await h.exec("git", ["worktree", "add", "--detach", checkout], { cwd: h.checkout });
  await configureEngineCheckout(checkout);
  const marker = await readWorktreeMarker(h.checkout);
  if (marker.kind !== "present") throw new Error("Missing source claim");
  await writeWorktreeMarker(checkout, marker.marker);
  return checkout;
}

it("materializes a spawned checkout with its own closed archive", async () => {
  const h = await archive();
  expect(await h.open()).toMatchObject({ status: "ok" });
  const checkout = await sibling(h);
  await startProjection(h.input);
  bindSpawnMaterialization(h.input);
  await materializeSpawnedProjection(checkout);
  await endProjection(h.input);
  expect(await readFile(join(checkout, h.path), "utf8")).toContain("Stored note.");
  expect(await writable(checkout, h.path)).toBe(false);
  expect(await writable(h.checkout, h.path)).toBe(true);
});

it.each([false, true])("fans a save into a sibling using its own opened=%s state", async opened => {
  const h = await archive();
  const checkout = await sibling(h);
  const target = { store: h.store, checkout };
  await startProjection(target); await endProjection(target);
  if (opened) await openArchivedProjectionFile(target, h.path);
  await openArchivedProjectionFile(h.input, h.path);
  await writeFile(join(h.checkout, h.path), (await h.file()) + "Saved across worktrees.\n");
  const store = withFanOut(h.store, createProjectionFanOutDependencies(h.checkout));
  await startProjection({ store, checkout: h.checkout, mode: "save" });
  await endProjection({ store, checkout: h.checkout });
  expect(await h.file()).toContain("Saved across worktrees.");
  expect(await readFile(join(checkout, h.path), "utf8")).toContain("Saved across worktrees.");
  expect(await writable(h.checkout, h.path)).toBe(false);
  expect(await writable(checkout, h.path)).toBe(opened);
});

it.each([
  { opened: false, saveLanding: false }, { opened: true, saveLanding: false }, { opened: true, saveLanding: true },
])("restages a guard take-in by the target's mode: %j", async ({ opened, saveLanding }) => {
  const h = await archive();
  if (opened) await openArchivedProjectionFile(h.input, h.path);
  await startProjection(h.input);
  const root = projectionProcessState().roots.get(h.checkout);
  if (root === undefined) throw new Error("No projection root");
  const entry = (await h.disk()).entries[h.path];
  if (entry?.kind !== "record") throw new Error("No archive entry");
  await withProjectionLock(h.location, async session => {
    root.checkpoint = session.step;
    const renderer = createRecordRenderer(root.context);
    const staged = success(await stageRecordFile({ ...root.context, checkout: h.checkout, path: h.path,
      record: success(await h.store.read({ reference: h.record.reference })), replacing: entry.base.blob,
      renderer, layMode: projectionLayMode(h.path, entry) }));
    await chmod(join(h.checkout, h.path), 0o644);
    await writeFile(join(h.checkout, h.path), (await h.file()) + "Taken in at the guard.\n");
    const guarded = await guardReplacement({ ...root.context, checkout: h.checkout, path: h.path, entry, staged,
      renderer, reference: null, saveLanding, takeIn: createWriteBackPort(root.context) });
    if (guarded.kind !== "replace" || guarded.staged === null) throw new Error("Guard did not restage");
    expect(await readFile(join(h.checkout, guarded.staged.location), "utf8")).toContain("Taken in at the guard.");
    expect(await writable(h.checkout, guarded.staged.location)).toBe(opened && !saveLanding);
    expect(success(await h.store.read({ reference: h.record.reference })).content).toContain("Taken in at the guard.");
    root.checkpoint = null;
  });
});

it.each([false, true])("draws an archived checkout clash using opened=%s", async opened => {
  const h = await archive("work-item/task-list");
  if (opened) await openArchivedProjectionFile(h.input, h.path);
  else await chmod(join(h.checkout, h.path), 0o644);
  const record = success(await h.store.read({ reference: h.record.reference }));
  success(await h.store.write(update(h, record, record.content.replace("Stored note.", "Remote correction."))));
  await writeFile(join(h.checkout, h.path), (await h.file()).replace("Stored note.", "Local correction."));
  await startProjection(h.input);
  if (!opened) {
    const root = projectionProcessState().roots.get(h.checkout);
    if (root === undefined) throw new Error("No clash root");
    await withProjectionLock(h.location, async session => {
      root.checkpoint = session.step;
      try { await writeBackProjectionFiles(root, await h.disk(), [h.path]); }
      finally { root.checkpoint = null; }
    });
  }
  await endProjection(h.input);
  const bytes = await h.file();
  expect(bytes).toContain("Remote correction.");
  expect(bytes).toContain("Local correction.");
  expect(bytes).toContain("<<<<<<<");
  expect(await writable(h.checkout, h.path)).toBe(opened);
});

it.each([false, true])("installs a reused path using arriving opened=%s, independently of the leaving record", async opened => {
  const h = await archive();
  await startProjection(h.input);
  const root = projectionProcessState().roots.get(h.checkout);
  if (root === undefined) throw new Error("No projection root");
  const written = success(await h.store.write({ action: "put", expected: null,
    reference: recordReferences["work-item/companion"](h.record.reference.owner, "arrival.md"),
    content: "Arriving archive bytes.\n", provenance: { verb: "seed", lifecycleAction: "seed" } }));
  const record = success(await h.store.read({ reference: written.reference }));
  const index = await h.disk(), leaving = index.entries[h.path];
  if (leaving?.kind !== "record") throw new Error("No leaving entry");
  await rm(join(h.checkout, h.path));
  await withProjectionLock(h.location, async session => {
    root.checkpoint = session.step;
    const arriving = { ...projectionEntryForRecord(record, h.path, "sha1"), ...(opened ? { opened: true as const } : {}) };
    const result = await installProjectionHandoff({ root, index: { ...index, entries: { ...index.entries,
      [h.path]: { ...leaving, ...(!opened ? { opened: true as const } : {}) } } }, path: h.path, record, arriving,
      renderer: createRecordRenderer(root.context) });
    expect(result.entries[h.path]).toMatchObject({ handoff: { reference: record.reference } });
    expect(await readFile(join(h.checkout, h.path), "utf8")).toContain("Arriving archive bytes.");
    expect(await writable(h.checkout, h.path)).toBe(opened);
    root.checkpoint = null;
  });
});
