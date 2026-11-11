/** Native lease and index observations fence each visit without changing the landed operation. */
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createFanOutFixture } from "../../../helpers/store/projection/fan-out-fixture.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { createEngineFixture } from "../../../helpers/store/projection/engine-fixture.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { NATIVE_LEASE_PROCESS } from "../../../../src/lib/lease-process.js";
import { beginProjectionCommand, projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { withProjectionLock, PROJECTION_LOCK_FILE } from "../../../../src/lib/store/projection/lock.js";
import { commitProjectionIndex, readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import type { StateVersion } from "../../../../src/lib/store/identity.js";
import { acquireAdvisoryLock, releaseAdvisoryLockConfirmed, type AdvisoryLockHandle } from "../../../../src/lib/advisory-lock.js";
import { ADVISORY_LEASE_DURATION_MS } from "../../../../src/lib/renewable-lease.js";
import { withFanOut } from "../../../../src/lib/store/projection/with-fan-out.js";
import { createProjectionFanOutDependencies } from "../../../../src/lib/store/projection/fan-out-binding.js";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";

const directories: string[] = [];
beforeEach(() => { beginProjectionCommand(); });
afterEach(async () => { beginProjectionCommand(); await removeGitBackedDirs(directories.splice(0)); });

it("keeps a sibling another writer refreshed between the unlocked and leased index reads", async () => {
  let intervene: (() => Promise<void>) | null = null, visits = 0;
  const h = await createFanOutFixture(directories, { ports: ports => ({ ...ports, lock: { ...ports.lock,
    resolveProcessScope: async () => {
      if (intervene !== null && ++visits === 2) { const refresh = intervene; intervene = null; await refresh(); }
      return NATIVE_LEASE_PROCESS.resolveProcessScope();
    },
  } }) });
  let advanced: StateVersion | null = null;
  intervene = async () => {
    const current = await h.h.stored();
    success(await h.h.store.write({ action: "put", reference: current.reference, expected: current.version,
      content: "Another process completed this refresh.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
    expect(await withProjectionLock(h.sibling.location, async session => {
      const before = await h.disk();
      await rm(join(h.sibling.checkout, h.h.path));
      const rendered = await seedProjection({ store: h.h.store, checkout: h.sibling.checkout,
        files: [{ path: h.h.path, reference: current.reference }] });
      advanced = rendered.index.state;
      await commitProjectionIndex({ checkout: h.sibling.checkout, location: h.sibling.location,
        index: { ...rendered.index, ignoreFiles: before.ignoreFiles, ignoreGuard: before.ignoreGuard }, checkpoint: session.step });
    })).toMatchObject({ status: "done" });
  };
  const current = await h.h.stored();
  success(await h.store.write({ action: "put", reference: current.reference, expected: current.version,
    content: "This command's earlier snapshot.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  expect(advanced).not.toBeNull();
  expect((await h.disk()).state).toBe(advanced);
  expect(await h.file()).toContain("Another process completed this refresh.");
  expect(await h.h.file()).toContain("This command's earlier snapshot.");
  expect(projectionProcessState().diagnostics).toEqual([]);
  await endProjection(h.input);
  expect(await startProjection(h.input)).toMatchObject({ kind: "ready" });
  expect(await h.h.file()).toContain("Another process completed this refresh.");
});

it.each([false, true])("recovers a lost sibling lease while preserving a save during its retry=%s", async lateSave => {
  let target = "", relative = "", armed = false, mismatch = false;
  const h = await createFanOutFixture(directories, { workItem: true, ports: ports => ({ ...ports,
    lock: { ...ports.lock, readFile: async path => {
      const bytes = await readFile(path, "utf8");
      if (!mismatch || path !== target) return bytes;
      mismatch = false;
      return JSON.stringify({ ...JSON.parse(bytes) as Record<string, unknown>, token: "another-acquisition" });
    } }, hooks: { afterRecheck: async path => { if (armed && path === relative) { armed = false; mismatch = true; } } },
  }) });
  target = join(h.sibling.location.stateDir, PROJECTION_LOCK_FILE); relative = h.siblingPath; armed = true;
  const before = await h.file(), current = await h.h.stored();
  success(await h.store.write({ action: "put", reference: current.reference, expected: current.version,
    content: "Stored before a sibling lease was lost.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  expect(armed).toBe(false);
  expect(await h.file()).toBe(before);
  expect(await h.h.file()).toContain("Stored before a sibling lease was lost.");
  expect(projectionProcessState().diagnostics).toContainEqual(expect.objectContaining({ path: h.sibling.checkout,
    mark: expect.objectContaining({ reason: expect.stringContaining("lost") }) }));
  expect(projectionProcessState().roots.get(h.sibling.checkout)?.ready).toBe(false);
  await endProjection(h.input);
  const state = success(await h.h.store.version());
  let save = lateSave;
  const nextPorts = createProjectionEnginePorts(h.sibling.checkout);
  expect(await startProjection({ store: h.h.store, checkout: h.sibling.checkout, location: h.sibling.location,
    ports: () => ({ ...nextPorts, writer: async () => ({ ...await nextPorts.writer(), processInstance: "next-command" }),
      lock: { processInstance: "next-command" }, hooks: { afterRecheck: async path => {
        if (!save || path !== h.siblingPath) return;
        save = false;
        const parsed = parseStampedFile(before);
        if (parsed.stamp === null) throw new Error("Missing stale editor stamp");
        const temporary = join(h.sibling.checkout, `${path}.editor-save`);
        await writeFile(temporary, renderStampedFile({ stamp: parsed.stamp,
          content: parsed.content.replace("base", "A late hand edit") }));
        await rename(temporary, join(h.sibling.checkout, path));
      } } }) })).toMatchObject({ kind: "ready" });
  expect(save).toBe(false);
  expect(await h.file()).toContain(lateSave ? "A late hand edit" : "Stored before a sibling lease was lost.");
  expect(success(await h.h.store.version())).toBe(state);
});

it("recovers an unready root after a lost start lease and checks the recovered refresh's copies at end", async () => {
  const h = await createEngineFixture(directories);
  const base = "opening\nline one\nseparator\nbase\nseparator two\nline six\nclosing\n";
  await h.edit(base.replace("\nbase\n", "\nfirst edit\n"));
  const native = h.ports();
  let offset = 0, lose = true, saveLate = false, replacement: AdvisoryLockHandle | undefined;
  const now = () => Date.now() + offset;
  const store = withFanOut(h.store, createProjectionFanOutDependencies(h.checkout));
  const input = { store, checkout: h.checkout, location: h.location, ports: () => ({ ...native,
    lock: { now, resolveProcessScope: async () => "original-scope", scheduleEvery: () => () => undefined },
    hooks: { afterRecheck: async () => {
      if (!lose) return;
      lose = false; offset = ADVISORY_LEASE_DURATION_MS + 1_000;
      replacement = await acquireAdvisoryLock(join(h.location.stateDir, PROJECTION_LOCK_FILE), {
        pid: process.pid, processInstance: "replacement", processScope: "other-scope", now,
        leaseDurationMs: ADVISORY_LEASE_DURATION_MS, maxWaitMs: 200 });
    }, afterFirstCheck: async (path: string) => {
      if (!saveLate) return;
      saveLate = false;
      const disk = await readProjectionIndex(h.location, true, { groups: "all" });
      const entry = disk.kind === "index" ? disk.index.entries[path] : undefined;
      const copy = entry?.kind === "record" ? entry.copies.at(-1) : undefined;
      if (copy === undefined) throw new Error("Missing in-flight copy");
      const rendering = parseStampedFile(await readFile(join(h.checkout, copy.name), "utf8"));
      if (rendering.stamp === null) throw new Error("Missing copy stamp");
      await writeFile(join(h.checkout, copy.name), renderStampedFile({
        content: rendering.content.replace("opening", "late opening"), stamp: rendering.stamp }));
    } },
  }) };
  expect(await startProjection(input)).toMatchObject({ kind: "skipped", skip: { reason: "lost" } });
  expect(projectionProcessState().roots.get(h.checkout)?.ready).toBe(false);
  if (replacement === undefined) throw new Error("No replacement acquired the expired lease");
  await releaseAdvisoryLockConfirmed(replacement);
  const current = await h.stored();
  saveLate = true;
  success(await store.write({ action: "put", reference: current.reference, expected: current.version,
    content: base.replace("\nbase\n", "\nfirst edit\n").replace("closing", "verb closing"), provenance: { verb: "save", lifecycleAction: "save" } }));
  const root = projectionProcessState().roots.get(h.checkout);
  expect(root?.ready).toBe(true);
  const copy = root?.copies.at(-1);
  if (copy === undefined) throw new Error("The recovered refresh left no copy for command end");
  const rendering = parseStampedFile(await readFile(join(h.checkout, copy.copy), "utf8"));
  if (rendering.stamp === null) throw new Error("The refresh copy lost its base");
  await writeFile(join(h.checkout, copy.copy), renderStampedFile({ content: rendering.content.replace("first edit", "end edit"), stamp: rendering.stamp }));
  await endProjection(input);
  expect((await h.stored()).content).toBe(base.replace("opening", "late opening").replace("\nbase\n", "\nend edit\n").replace("closing", "verb closing"));
});
