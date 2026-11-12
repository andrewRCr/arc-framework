/** Anchored releases retain the Git checkout after persisting its projection. */
import { afterEach, describe, expect, it } from "vitest";
import { mkdir, readFile, readdir, readlink, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempDir } from "../helpers/integration.js";
import { projectedRetirement, retirementRetainedBase, interruptedRetirementReplacement, retirementFixtureRoots as roots } from "../helpers/store/projection-retirement.js";
import { releaseProjectionRemoval } from "../../src/lib/store/projection/removal-release.js";
import { writeWorktreeMarker, readWorktreeMarker, resolveWorktreeMarkerPath } from "../../src/lib/git/worktree-marker.js";
import { PROJECTION_INDEX_FILE, readProjectionIndex, writeProjectionIndex } from "../../src/lib/store/projection/index-file.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { createProjectionEnginePorts } from "../../src/lib/store/projection/engine-ports.js";
import { createRefusingStore } from "../helpers/store/projection/refusing-store.js";
import { parseStampedFile, renderStampedFile } from "../../src/lib/store/projection/stamp.js";
import { seedProjection } from "../helpers/store/projection/seeded-projection.js";
import { startProjection, endProjection } from "../../src/lib/store/projection/engine.js";
import { projectionProcessState } from "../../src/lib/store/projection/process-state.js";
import { PROJECTION_LOCK_FILE, withProjectionLock } from "../../src/lib/store/projection/lock.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { withFanOut } from "../../src/lib/store/projection/with-fan-out.js";
import { createProjectionFanOutDependencies } from "../../src/lib/store/projection/fan-out-binding.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { ASIDE_FILES_ROOT, createStagedFile, nameAsideFile, parseAsideFile } from "../../src/lib/store/projection/aside.js";
import { flatWorkItemArtifactPath } from "../../src/lib/store/lifecycle-storage.js";
import { recordWriteBack } from "../../src/lib/store/projection/taken-in.js";
import { createHistoryMemo } from "../../src/lib/store/projection/base-recovery.js";
import { projectionEntryForRecord } from "../../src/lib/store/projection/materialization-file.js";
import { overrideEngineStore } from "../helpers/store/projection/engine-fixture.js";
import { acquireAdvisoryLock, releaseAdvisoryLockConfirmed, type AdvisoryLockHandle } from "../../src/lib/advisory-lock.js";
import { ADVISORY_LEASE_DURATION_MS } from "../../src/lib/renewable-lease.js";

afterEach(async () => { for (const root of roots.splice(0)) await cleanupTempDir(root); });

async function anchoredRelease() {
  const h = await projectedRetirement();
  h.marker.spawnedByArc = false;
  await writeWorktreeMarker(h.checkout, h.marker);
  return h;
}

async function removalCopy(h: Awaited<ReturnType<typeof projectedRetirement>>, path = h.path): Promise<string> {
  const disk = await readProjectionIndex(h.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("No removal index");
  const entry = disk.index.entries[path];
  if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("No removal copy");
  return entry.copies[0].name;
}

describe("projected checkout release", () => {
  it("never reads or deletes a removal copy through a linked ancestor introduced after the first check", async () => {
    const h = await projectedRetirement();
    const outside = join(h.root, "displaced-asides");
    let target = "", moved = false;
    h.configure({ ports: checkout => ({ ...createProjectionEnginePorts(checkout), hooks: { afterFirstCheck: async path => {
      if (moved) return;
      const copy = await removalCopy(h, path);
      target = join(outside, copy.slice(ASIDE_FILES_ROOT.length + 1));
      await rename(join(checkout, ASIDE_FILES_ROOT), outside);
      await symlink(outside, join(checkout, ASIDE_FILES_ROOT), "dir"); moved = true;
    } } }) });
    const result = await h.release();
    const bytes = await readFile(target, "utf8").catch(() => null);
    expect({ result, bytes }).toMatchObject({ result: { kind: "released" }, bytes: expect.stringContaining("Original prose.") });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).version).toBe(h.record.version);
  });

  it("keeps an unrecorded copy edited after final feasibility instead of deleting it with the aside folder", async () => {
    const h = await projectedRetirement();
    const copy = nameAsideFile({ path: h.path, base: h.entry.base.blob, writer: await createProjectionEnginePorts(h.checkout).writer(), role: "aside" });
    await createStagedFile(h.checkout, copy, renderStampedFile({ content: h.record.content, stamp: h.entry.base.blob }));
    const content = "A late edit in an unrecorded recovery copy.\n";
    const authored = renderStampedFile({ content, stamp: h.entry.base.blob });
    let saved = false;
    h.configure({ ports: checkout => ({ ...createProjectionEnginePorts(checkout), hooks: { afterFirstCheck: async () => {
      if (saved) return;
      await writeFile(join(checkout, copy), authored); saved = true;
    } } }) });
    const result = await h.release();
    const retained = await readFile(join(h.checkout, copy), "utf8").catch(() => null);
    const stored = lifecycleSuccess(await h.store.read({ reference: h.record.reference }));
    expect({ result, retained, stored: stored.content }).toMatchObject({ result: { kind: "refused" }, retained: authored, stored: h.record.content });
    expect(result).toMatchObject({ remedy: { text: expect.stringContaining(copy) } });
    expect(await readWorktreeMarker(h.checkout)).toMatchObject({ kind: "present" });
    expect(await readProjectionIndex(h.location, true)).toMatchObject({ kind: "index" });
    await rm(join(h.checkout, copy));
    expect(await h.release()).toEqual({ kind: "released" });
    expect(await readProjectionIndex(h.location, false)).toEqual({ kind: "no-projection" });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).version).toBe(h.record.version);
  });

  it.each(["md", "txt"] as const)("retains an edited %s projection until its accepted-input base is restored", async extension => {
    const h = await retirementRetainedBase(extension);
    h.marker.spawnedByArc = false; await writeWorktreeMarker(h.checkout, h.marker);
    const offline = `${h.retained}.offline`;
    await rename(h.retained, offline);
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringMatching(/retained|kept|base/iu) });
    expect(await readWorktreeMarker(h.checkout)).toMatchObject({ kind: "present" });
    expect(await readFile(join(h.checkout, h.path), "utf8")).toContain("edited opening");
    await rename(offline, h.retained);
    expect(await h.remove()).toMatchObject({ status: "torn-down" });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe(h.content);
  });

  it("takes over a live writer's primary copy and clears its interrupted replacement records", async () => {
    const h = await projectedRetirement("opening\nbase\nclosing\n", "txt");
    const projected = await seedProjection({ checkout: h.root, store: h.store, identity: SlugSchema.parse("test-user"), files: [{ path: h.path, reference: h.record.reference }] });
    const primaryEntry = projected.index.entries[h.path];
    if (primaryEntry?.kind !== "record") throw new Error("No primary entry");
    lifecycleSuccess(await h.store.write({ action: "put", reference: h.record.reference, expected: h.record.version,
      content: "opening\nbase\nclosing\nremote footer\n", provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const stopped = await interruptedRetirementReplacement({ ...h, ...projected, entry: primaryEntry }, projected.index, primaryEntry, "afterFirstCheck");
    expect(stopped.entry.inProgress?.copy).toBe(stopped.copy.name);
    await writeFile(join(h.root, stopped.copy.name), "local prefix\nopening\nbase\nclosing\n");
    expect(await releaseProjectionRemoval(h.root, true, { store: h.store, identity: SlugSchema.parse("test-user") })).toEqual({ kind: "released" });
    const disk = await readProjectionIndex(projected.location, true, { groups: "all" });
    const entry = disk.kind === "index" ? disk.index.entries[h.path] : undefined;
    expect(entry).toMatchObject({ kind: "record", inProgress: null, copies: [] });
    await expect(readFile(join(h.root, stopped.copy.name))).rejects.toMatchObject({ code: "ENOENT" });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe("local prefix\nopening\nbase\nclosing\nremote footer\n");
    expect(projectionProcessState().retiring.has(h.root)).toBe(false);
  });

  it("retains the marker after lease loss following a landed edit and releases on retry", async () => {
    const h = await anchoredRelease();
    await h.edit("An accepted edit before release lost its lease.\n");
    const bytes = await readFile(join(h.checkout, h.path));
    let now = Date.now(), replacement: AdvisoryLockHandle | undefined;
    const store = overrideEngineStore(h.store, { batch: async input => {
      const result = await h.store.batch(input);
      now = Date.now() + ADVISORY_LEASE_DURATION_MS + 1000;
      replacement = await acquireAdvisoryLock(join(h.location.stateDir, PROJECTION_LOCK_FILE), {
        pid: process.pid, processInstance: "replacement", processScope: "replacement-scope", now: () => now,
        leaseDurationMs: ADVISORY_LEASE_DURATION_MS, maxWaitMs: 200,
      });
      return result;
    } });
    h.configure({ store, ports: checkout => ({ ...createProjectionEnginePorts(checkout), lock: { now: () => now,
      resolveProcessScope: () => Promise.resolve("original-scope"), scheduleEvery: () => () => undefined } }) });
    try {
      expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("Projection lease lost") });
      expect(await readWorktreeMarker(h.checkout)).toMatchObject({ kind: "present" });
      expect(await readFile(join(h.checkout, h.path))).toEqual(bytes);
      expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe("An accepted edit before release lost its lease.\n");
    } finally { if (replacement !== undefined) await releaseAdvisoryLockConfirmed(replacement); }
    h.configure({ store: h.store, ports: undefined });
    expect(await h.remove()).toMatchObject({ status: "torn-down" });
  });

  it("releases a checkout with neither projection nor index before consulting its missing identity", async () => {
    const h = await projectedRetirement();
    await rm(resolveWorktreeMarkerPath(h.checkout));
    await rm(join(h.checkout, h.path));
    await rm(join(h.location.stateDir, PROJECTION_INDEX_FILE));
    await h.exec("git", ["config", "--unset-all", "arc.identity"], { cwd: h.checkout });
    await h.exec("git", ["config", "user.name", ""], { cwd: h.checkout });
    expect(await h.release()).toEqual({ kind: "released" });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).version).toBe(h.record.version);
  });

  it.each([false, true])("removes unchanged old-identity files and holds an edit there, edited=%s", async edited => {
    const h = await anchoredRelease();
    const record = await h.seed(RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "blair" }, key: "scratch/previous.md" }), "Previous identity's prose.\n");
    const path = ".arc/user/blair/scratch/previous.md";
    const seeded = await seedProjection({ checkout: h.checkout, store: h.store, identity: SlugSchema.parse("blair"), files: [{ path, reference: record.reference }] });
    const entry = seeded.index.entries[path];
    if (entry?.kind !== "record") throw new Error("No previous-identity entry");
    const content = "A previous identity's saved hand edit.\n";
    if (edited) {
      await writeFile(join(h.checkout, path), renderStampedFile({ content, stamp: entry.base.blob }));
      expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("blair") });
      expect(await readWorktreeMarker(h.checkout)).toMatchObject({ kind: "present" });
      expect(lifecycleSuccess(await h.store.read({ reference: record.reference })).version).toBe(record.version);
      await h.exec("git", ["config", "arc.identity", "blair"], { cwd: h.checkout });
      h.store.environment.identity = "blair";
      const command = { checkout: h.checkout, store: h.store, mode: "save" as const };
      expect(await startProjection(command)).toMatchObject({ kind: "ready" }); await endProjection(command);
      await h.exec("git", ["config", "arc.identity", "test-user"], { cwd: h.checkout }); h.store.environment.identity = "test-user";
    }
    expect(await h.remove()).toMatchObject({ status: "torn-down" });
    await expect(readFile(join(h.checkout, path))).rejects.toMatchObject({ code: "ENOENT" });
    expect(lifecycleSuccess(await h.store.read({ reference: record.reference })).content).toBe(edited ? content : record.content);
  });

  it("skips a released linked projection during later fan-out and command-end checking", async () => {
    const h = await anchoredRelease();
    const store = withFanOut(h.store, createProjectionFanOutDependencies(h.root));
    const command = { checkout: h.root, store };
    expect(await startProjection(command)).toMatchObject({ kind: "ready" });
    lifecycleSuccess(await store.write({ action: "put", reference: h.record.reference, expected: h.record.version,
      content: "A pre-release refresh.\n", provenance: { verb: "edit", lifecycleAction: "edit" } }));
    expect(projectionProcessState().roots.has(h.checkout)).toBe(true);
    h.configure({ store });
    expect(await h.release()).toEqual({ kind: "released" });
    const prior = lifecycleSuccess(await h.store.read({ reference: h.record.reference }));
    lifecycleSuccess(await store.write({ action: "put", reference: h.record.reference, expected: prior.version,
      content: "A post-release refresh.\n", provenance: { verb: "edit", lifecycleAction: "edit" } }));
    expect(await readFile(join(h.root, h.path), "utf8")).toContain("A post-release refresh.");
    await expect(readFile(join(h.checkout, h.path))).rejects.toMatchObject({ code: "ENOENT" });
    expect(projectionProcessState().roots.has(h.checkout)).toBe(false);
    await endProjection(command);
    expect(await readProjectionIndex(h.location, false)).toEqual({ kind: "no-projection" });
    expect(await withProjectionLock(h.location, () => Promise.resolve("free"), { maxWaitMs: 0 })).toEqual({ status: "done", value: "free" });
  });

  it("returns an unparseable removal edit to its path and releases after the metadata is repaired", async () => {
    const h = await anchoredRelease();
    const record = await h.seedMeta("editable", { owner: "test-user", state: "Shipped", currentWorkflow: null },
      { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
    if (record.placement?.kind !== "completed" || !("sequence" in record.placement)) throw new Error("No archive sequence");
    const path = flatWorkItemArtifactPath("editable", "meta", record.placement, null);
    await rm(join(h.checkout, h.path));
    const seeded = await seedProjection({ checkout: h.checkout, store: h.store, identity: SlugSchema.parse("test-user"),
      files: [{ path, reference: record.reference }, { path: h.path, reference: h.record.reference }] });
    const entry = seeded.index.entries[path];
    if (entry?.kind !== "record") throw new Error("No metadata entry");
    let saved = false;
    h.configure({ ports: checkout => ({ ...createProjectionEnginePorts(checkout), hooks: { afterMove: async moved => {
      if (saved || moved !== path) return;
      const copy = await removalCopy(h, path);
      await writeFile(join(checkout, copy), renderStampedFile({ content: "No metadata heading or table.\n", stamp: entry.base.blob })); saved = true;
    } } }) });
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("parser accepts") });
    expect(await readWorktreeMarker(h.checkout)).toMatchObject({ kind: "present" });
    expect(await readFile(join(h.checkout, path), "utf8")).toContain("No metadata heading or table.");
    expect(lifecycleSuccess(await h.store.read({ reference: record.reference })).version).toBe(record.version);
    const repaired = `${record.content}\nA repaired archive note.\n`;
    await writeFile(join(h.checkout, path), renderStampedFile({ content: repaired, stamp: entry.base.blob }));
    expect(await h.remove()).toMatchObject({ status: "torn-down" });
    expect(lifecycleSuccess(await h.store.read({ reference: record.reference })).content).toBe(repaired);
  });

  it("returns a clashed removal edit and releases once the conflict is resolved", async () => {
    const h = await projectedRetirement("opening\nbase\nclosing\n");
    h.marker.spawnedByArc = false; await writeWorktreeMarker(h.checkout, h.marker);
    lifecycleSuccess(await h.store.write({ action: "put", reference: h.record.reference, expected: h.record.version,
      content: "opening\naccepted\nclosing\n", provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const accepted = lifecycleSuccess(await h.store.read({ reference: h.record.reference }));
    lifecycleSuccess(await h.store.write({ action: "put", reference: h.record.reference, expected: accepted.version,
      content: "opening\nremote\nclosing\n", provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const current = lifecycleSuccess(await h.store.read({ reference: h.record.reference }));
    const recorded = await recordWriteBack({ location: h.location, entry: h.entry, stamp: h.entry.base.blob,
      takenIn: accepted.content, outcome: { kind: "landed", version: accepted.version }, readBack: current,
      grammar: undefined, format: "sha1", memo: createHistoryMemo(h.store) });
    expect(recorded.entry.persisted?.takenIn.kind).toBe("copy");
    const refreshed = { ...projectionEntryForRecord(current, h.path, "sha1"), persisted: recorded.entry.persisted };
    await writeProjectionIndex(h.location, { ...h.index, entries: { ...h.index.entries, [h.path]: refreshed } });
    await writeFile(join(h.checkout, h.path), renderStampedFile({ content: current.content, stamp: refreshed.base.blob }));
    let saved = false;
    h.configure({ ports: checkout => ({ ...createProjectionEnginePorts(checkout), hooks: { afterMove: async path => {
      if (saved) return;
      const copy = await removalCopy(h, path);
      await writeFile(join(checkout, copy), renderStampedFile({ content: "opening\nlocal\nclosing\n", stamp: h.entry.base.blob })); saved = true;
    } } }) });
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("markers by hand") });
    expect(await readWorktreeMarker(h.checkout)).toMatchObject({ kind: "present" });
    expect(await readFile(join(h.checkout, h.path), "utf8")).toContain("local");
    const command = { checkout: h.checkout, store: h.store, mode: "save" as const };
    expect(await startProjection(command)).toMatchObject({ kind: "ready" }); await endProjection(command);
    const drawing = await readFile(join(h.checkout, h.path), "utf8");
    const stamp = parseStampedFile(drawing).stamp;
    if (stamp === null) throw new Error("No conflict drawing stamp");
    await writeFile(join(h.checkout, h.path), renderStampedFile({ content: "opening\nchosen resolution\nclosing\n", stamp }));
    expect(await h.remove()).toMatchObject({ status: "torn-down" });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe("opening\nchosen resolution\nclosing\n");
  });

  it.each(["empty", "directory"] as const)("retains a late %s copy with its repair route and releases after repair", async fault => {
    const h = await anchoredRelease();
    let copy = "", saved = false;
    h.configure({ ports: checkout => ({ ...createProjectionEnginePorts(checkout), hooks: { afterFirstCheck: async path => {
      if (saved) return;
      copy = await removalCopy(h, path);
      if (fault === "empty") await writeFile(join(checkout, copy), "");
      else { await rm(join(checkout, copy)); await mkdir(join(checkout, copy)); }
      saved = true;
    } } }) });
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining(fault === "empty" ? "finish saving" : "regular file") });
    expect(await readWorktreeMarker(h.checkout)).toMatchObject({ kind: "present" });
    if (fault === "directory") await rm(join(h.checkout, copy), { recursive: true });
    await writeFile(join(h.checkout, copy), renderStampedFile({ content: "A completed late save.\n", stamp: h.entry.base.blob }));
    expect(await h.remove()).toMatchObject({ status: "torn-down" });
    expect(await h.store.read({ reference: h.record.reference })).toMatchObject({ status: "ok", result: { content: "A completed late save.\n" } });
  });

  it("refreshes a released primary and checks the resulting copy at command end", async () => {
    const h = await projectedRetirement("opening\nbase\nclosing\n");
    const projected = await seedProjection({ checkout: h.root, store: h.store, identity: SlugSchema.parse("test-user"), files: [{ path: h.path, reference: h.record.reference }] });
    let armed = false, saved = false;
    const ports = { ...createProjectionEnginePorts(h.root), hooks: { afterFirstCheck: async (path: string) => {
      if (!armed || saved || path !== h.path) return;
      const disk = await readProjectionIndex(projected.location, true, { groups: "all" });
      if (disk.kind !== "index") throw new Error("No refreshed index");
      const entry = disk.index.entries[path];
      if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("No refreshed copy");
      const named = parseAsideFile(entry.copies[0].name);
      if (named === undefined) throw new Error("Invalid refreshed copy");
      await writeFile(join(h.root, entry.copies[0].name), renderStampedFile({ content: "local prefix\nopening\nbase\nclosing\n", stamp: named.base }));
      saved = true;
    } } };
    const store = withFanOut(h.store, createProjectionFanOutDependencies(h.root));
    const command = { checkout: h.root, store, ports: () => ports };
    expect(await startProjection(command)).toMatchObject({ kind: "ready" });
    expect(await releaseProjectionRemoval(h.root, true, { store, identity: SlugSchema.parse("test-user") })).toEqual({ kind: "released" });
    armed = true;
    lifecycleSuccess(await store.write({ action: "put", reference: h.record.reference, expected: h.record.version,
      content: "opening\nbase\nclosing\nremote footer\n", provenance: { verb: "edit", lifecycleAction: "edit" } }));
    expect(await readFile(join(h.root, h.path), "utf8")).toContain("remote footer");
    const refreshed = await readProjectionIndex(projected.location, true, { groups: "all" });
    const refreshedEntry = refreshed.kind === "index" ? refreshed.index.entries[h.path] : undefined;
    expect(refreshedEntry?.kind === "record" && refreshedEntry.changed).toBe(true);
    expect(saved).toBe(true);
    await endProjection(command);
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content)
      .toBe("local prefix\nopening\nbase\nclosing\nremote footer\n");
  });

  it.each(["identity", "different identity", "index", "admission", "unadopted prose"] as const)("retains an anchored marker and edit behind %s, then releases after repair", async fault => {
    const h = await anchoredRelease();
    const originalHeader = await readFile(join(h.location.stateDir, PROJECTION_INDEX_FILE));
    const refusing = createRefusingStore(h.store);
    await h.edit("A held edit must survive release.\n");
    if (fault === "identity") {
      await h.exec("git", ["config", "--unset-all", "arc.identity"], { cwd: h.checkout });
      await h.exec("git", ["config", "user.name", ""], { cwd: h.checkout });
    }
    if (fault === "different identity") h.configure({ identity: SlugSchema.parse("blair") });
    if (fault === "index") await writeFile(join(h.location.stateDir, PROJECTION_INDEX_FILE), "broken header\n");
    if (fault === "admission") {
      refusing.refuse("batch", { code: "version-conflict", cause: "projection-admission", class: "recoverable", records: [h.record.reference],
        condition: "Authority is pending.", remedy: { text: "Retry after repairing admission authority." } });
      h.configure({ store: refusing.store });
    }
    const loose = ".arc/active/unowned.txt";
    if (fault === "unadopted prose") {
      await mkdir(join(h.checkout, ".arc/active"), { recursive: true });
      await writeFile(join(h.checkout, loose), "Unadopted content.\n");
    }
    expect(await h.remove()).toMatchObject({ status: "rejected" });
    expect(await readWorktreeMarker(h.checkout)).toMatchObject({ kind: "present" });
    expect(await readFile(join(h.checkout, h.path), "utf8")).toContain("A held edit must survive release.");
    if (fault === "identity") await h.exec("git", ["config", "arc.identity", "test-user"], { cwd: h.checkout });
    if (fault === "different identity") h.configure({ identity: SlugSchema.parse("test-user") });
    if (fault === "index") await writeFile(join(h.location.stateDir, PROJECTION_INDEX_FILE), originalHeader);
    if (fault === "admission") refusing.refuse("batch", null);
    if (fault === "unadopted prose") await rm(join(h.checkout, loose));
    expect(await h.remove()).toMatchObject({ status: "torn-down" });
    expect(await readWorktreeMarker(h.checkout)).toEqual({ kind: "absent" });
    expect(await h.store.read({ reference: h.record.reference })).toMatchObject({ status: "ok", result: { content: "A held edit must survive release.\n" } });
  });

  it("refuses a held native lease with its holder and releases after the lease ends", async () => {
    const h = await anchoredRelease();
    h.configure({ ports: checkout => ({ ...createProjectionEnginePorts(checkout), maxWaitMs: 50 }) });
    await h.edit("An edit waiting for release.\n");
    const held = await withProjectionLock(h.location, async () => {
      expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("holder") });
      expect(await readWorktreeMarker(h.checkout)).toMatchObject({ kind: "present" });
      expect(await h.store.read({ reference: h.record.reference })).toMatchObject({ status: "ok", result: { version: h.record.version } });
    });
    expect(held.status).toBe("done");
    expect(await h.remove()).toMatchObject({ status: "torn-down" });
    expect(await h.store.read({ reference: h.record.reference })).toMatchObject({ status: "ok", result: { content: "An edit waiting for release.\n" } });
  });

  it("adopts a new file first observed by the release's final check", async () => {
    const h = await anchoredRelease();
    let saved = false;
    const path = ".arc/user/test-user/scratch/release-late.md";
    h.configure({ hooks: { beforeLastCheck: async () => {
      if (saved) return;
      await writeFile(join(h.checkout, path), "Late adopted input.\n"); saved = true;
    } } });
    expect(await h.remove()).toMatchObject({ status: "torn-down" });
    const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "test-user" }, key: "scratch/release-late.md" });
    expect(await h.store.read({ reference })).toMatchObject({ status: "ok", result: { content: "Late adopted input.\n" } });
    await expect(readFile(join(h.checkout, path))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps a late edited removal copy when its destination becomes a link, then releases after recovery", async () => {
    const h = await projectedRetirement();
    let copy = "", saved = false;
    const context = { store: h.store, identity: SlugSchema.parse("test-user"), ports: (checkout: string) => ({
      ...createProjectionEnginePorts(checkout), hooks: { afterFirstCheck: async (path: string) => {
        if (saved) return;
        const disk = await readProjectionIndex(h.location, true, { groups: "all" });
        if (disk.kind !== "index") throw new Error("No removal index");
        const entry = disk.index.entries[path];
        if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("No removal copy");
        copy = entry.copies[0].name;
        await writeFile(join(checkout, copy), renderStampedFile({ content: "Recover this late edit.\n", stamp: h.entry.base.blob }));
        await symlink(join(h.root, "base"), join(checkout, path)); saved = true;
      } },
    }) };
    expect(await releaseProjectionRemoval(h.checkout, false, context)).toMatchObject({ kind: "refused" });
    expect(await readFile(join(h.checkout, copy), "utf8")).toContain("Recover this late edit.");
    expect(await readFile(join(h.root, "base"), "utf8")).toBe("base\n");
    await rm(join(h.checkout, copy));
    expect(await releaseProjectionRemoval(h.checkout, false, context)).toEqual({ kind: "released" });
  });

  it("leaves a symbolic link created during removal opaque and releases the projection", async () => {
    const h = await projectedRetirement();
    const target = join(h.root, "base");
    let linked = false;
    const result = await releaseProjectionRemoval(h.checkout, false, { store: h.store, identity: SlugSchema.parse("test-user"),
      ports: checkout => ({ ...createProjectionEnginePorts(checkout), hooks: { afterFirstCheck: async path => {
        if (linked) return;
        await symlink(target, join(checkout, path)); linked = true;
      } } }) });
    expect(result).toEqual({ kind: "released" });
    expect(await readlink(join(h.checkout, h.path))).toBe(target);
    expect(await readFile(target, "utf8")).toBe("base\n");
    await expect(readFile(join(h.location.stateDir, PROJECTION_INDEX_FILE))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await readdir(h.location.stateDir)).filter(name => /^index(?:-[a-f0-9]{40})?$/u.test(name))).toEqual([]);
    expect(await h.store.read({ reference: h.record.reference })).toMatchObject({ status: "ok", result: { version: h.record.version } });
  });

  it.each(["ordinary", "separate Git directory"] as const)("keeps the %s primary and its registered root when the caller says linked", async arrangement => {
    const h = await projectedRetirement();
    if (arrangement !== "ordinary") {
      await h.exec("git", ["worktree", "remove", h.checkout]);
      await h.exec("git", ["init", "--separate-git-dir", join(h.root, "separate.git")]);
    }
    const projected = await seedProjection({ checkout: h.root, store: h.store, identity: SlugSchema.parse("test-user"),
      files: [{ path: h.path, reference: h.record.reference }] });
    expect(projected.location.primary).toBe(true);
    const command = { checkout: h.root, store: h.store };
    expect(await startProjection(command)).toMatchObject({ kind: "ready" });
    const registered = projectionProcessState().roots.get(h.root);
    expect(registered).toBeDefined();
    await writeFile(join(h.root, h.path), renderStampedFile({ content: "Saved from primary release.\n", stamp: h.entry.base.blob }));
    expect(await releaseProjectionRemoval(h.root, false, { store: h.store, identity: SlugSchema.parse("test-user") })).toEqual({ kind: "released" });
    expect(projectionProcessState().roots.get(h.root) === registered).toBe(true);
    expect(projectionProcessState().retiring.has(h.root)).toBe(false);
    expect(await readFile(join(h.root, h.path), "utf8")).toContain("Saved from primary release.");
    expect(await readProjectionIndex(projected.location, true)).toMatchObject({ kind: "index" });
    expect(await h.store.read({ reference: h.record.reference })).toMatchObject({ status: "ok", result: { content: "Saved from primary release.\n" } });
    await endProjection(command);
  });

  it.each(["first", "second"] as const)("keeps a pending removal edit at the %s check and reports its admission remedy", async when => {
    const h = await projectedRetirement();
    const refusing = createRefusingStore(h.store);
    refusing.refuse("batch", { code: "version-conflict", cause: "projection-admission", class: "recoverable", records: [h.record.reference],
      condition: "Removal copy admission is pending.", remedy: { text: "Retry this removal admission once its authority settles." } });
    let saved = false;
    const save = async () => {
      if (saved) return;
      const disk = await readProjectionIndex(h.location, true, { groups: "all" });
      if (disk.kind !== "index") throw new Error("No removal index");
      const entry = disk.index.entries[h.path];
      if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("No removal copy");
      await writeFile(join(h.checkout, entry.copies[0].name), renderStampedFile({ content: "Late copy edit.\n", stamp: h.entry.base.blob }));
      saved = true;
    };
    const context = { store: refusing.store, identity: SlugSchema.parse("test-user"), ports: (checkout: string) => ({
      ...createProjectionEnginePorts(checkout), hooks: when === "first" ? { afterMove: save } : { afterFirstCheck: save },
    }) };
    expect(await releaseProjectionRemoval(h.checkout, false, context)).toMatchObject({ kind: "refused",
      remedy: { text: expect.stringContaining("Retry this removal admission") } });
    expect(await readProjectionIndex(h.location, true)).toMatchObject({ kind: "index" });
    refusing.refuse("batch", null);
    expect(await releaseProjectionRemoval(h.checkout, false, context)).toEqual({ kind: "released" });
    expect(await h.store.read({ reference: h.record.reference })).toMatchObject({ status: "ok", result: { content: "Late copy edit.\n" } });
  });

  it("keeps its index and original when a removal move fails, then releases after repair", async () => {
    const h = await projectedRetirement();
    let blocked = true, destination = "";
    const context = { store: h.store, identity: SlugSchema.parse("test-user"), ports: (checkout: string) => ({
      ...createProjectionEnginePorts(checkout), hooks: { afterRecheck: async (path: string) => {
        if (!blocked) return;
        const disk = await readProjectionIndex(h.location, true, { groups: "all" });
        if (disk.kind !== "index") throw new Error("No removal index");
        const entry = disk.index.entries[path];
        if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("No planned copy");
        destination = join(checkout, entry.copies[0].name);
        await mkdir(destination, { recursive: true });
        await writeFile(join(destination, "held-open"), "Native rename must refuse this nonempty destination.\n");
      } },
    }) };
    expect(await releaseProjectionRemoval(h.checkout, false, context)).toMatchObject({ kind: "refused" });
    expect(await readFile(join(h.checkout, h.path), "utf8")).toContain("Original prose.");
    expect(await readProjectionIndex(h.location, true)).toMatchObject({ kind: "index" });
    await rm(destination, { recursive: true }); blocked = false;
    expect(await releaseProjectionRemoval(h.checkout, false, context)).toEqual({ kind: "released" });
    await expect(readFile(join(h.checkout, h.path))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("persists an anchored linked checkout and removes its projection while keeping Git changes", async () => {
    const h = await projectedRetirement();
    h.marker.spawnedByArc = false;
    await writeWorktreeMarker(h.checkout, h.marker);
    h.ctx.projectionRemovalSlots = { ...h.ctx.projectionRemovalSlots!,
      release: (checkout, primary) => releaseProjectionRemoval(checkout, primary, { store: h.store, identity: SlugSchema.parse("test-user") }) };
    await h.edit("Authored before release.\n");
    await writeFile(join(h.checkout, "personal.txt"), "Uncommitted Git content.\n");
    expect(await h.remove()).toMatchObject({ status: "torn-down" });
    const stored = await h.store.read({ reference: h.record.reference });
    expect(stored).toMatchObject({ status: "ok", result: { content: "Authored before release.\n" } });
    await expect(readFile(join(h.checkout, h.path))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(h.location.stateDir, PROJECTION_INDEX_FILE))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(h.checkout, "personal.txt"), "utf8")).toBe("Uncommitted Git content.\n");
    expect(await readWorktreeMarker(h.checkout)).toEqual({ kind: "absent" });
    expect((await h.exec("git", ["status", "--porcelain"], { cwd: h.checkout })).stdout).toContain("personal.txt");
  });
});
