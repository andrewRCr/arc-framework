/** Sync restores deleted projected files before its existing network orchestration. */
import { access, lstat, mkdir, readFile, rename, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { ProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { NATIVE_LEASE_PROCESS } from "../../../../src/lib/lease-process.js";
import type { Store } from "../../../../src/lib/store/contract.js";

const binding = vi.hoisted(() => ({ store: null as Store | null, ports: null as ((ports: ProjectionEnginePorts) => ProjectionEnginePorts) | null }));
vi.mock("../../../../src/lib/store/create.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => binding.store ?? original.createStore(...args) };
});

vi.mock("../../../../src/lib/store/projection/engine-ports.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../../../src/lib/store/projection/engine-ports.js")>();
  return { ...original, createProjectionEnginePorts: (...args: Parameters<typeof original.createProjectionEnginePorts>) => {
    const ports = original.createProjectionEnginePorts(...args);
    return binding.ports?.(ports) ?? ports;
  } };
});

import { dispatchRegisteredCli } from "../../../helpers/registered-cli.js";
import { createFanOutFixture } from "../../../helpers/store/projection/fan-out-fixture.js";
import { createEngineFixture, overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { withFanOut } from "../../../../src/lib/store/projection/with-fan-out.js";
import { createProjectionFanOutDependencies } from "../../../../src/lib/store/projection/fan-out-binding.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import { beginProjectionCommand, projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";

const directories: string[] = [];
afterEach(async () => { binding.store = null; binding.ports = null; beginProjectionCommand(); await removeGitBackedDirs(directories.splice(0)); });

async function sync(h: { store: Store; checkout: string }, args: readonly string[] = []) {
  const cwd = process.cwd(), previousExit = process.exitCode;
  let output = "", errors = "";
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(chunk => { errors += String(chunk); return true; });
  try {
    binding.store = h.store; process.chdir(h.checkout); process.exitCode = undefined;
    await dispatchRegisteredCli(["sync", ...args, "--json"]);
    return { output, errors, exitCode: process.exitCode ?? 0 };
  } finally { stdout.mockRestore(); stderr.mockRestore(); process.chdir(cwd); process.exitCode = previousExit; }
}

async function fixture() {
  const h = await createEngineFixture(directories, { extraPaths: [".arc/user/andrew/scratch/edited.md"] });
  await h.exec("git", ["commit", "--allow-empty", "-m", "Seed code"], { cwd: h.checkout });
  const command = { store: h.store, checkout: h.checkout, location: h.location };
  expect(await startProjection(command)).toMatchObject({ kind: "ready" }); await endProjection(command);
  return h;
}

it("restores a deleted projected file while retaining another file's edit", async () => {
  const extraPath = ".arc/user/andrew/scratch/edited.md";
  const h = await fixture();
  const entry = (await h.disk()).entries[extraPath], extra = h.extra[0];
  if (entry?.kind !== "record" || extra === undefined) throw new Error("Missing editable companion");
  await rm(join(h.checkout, h.path));
  await writeFile(join(h.checkout, extraPath), renderStampedFile({ content: "A concurrent file edit.\n", stamp: entry.base.blob }));
  await sync(h);
  expect(await h.file()).toContain(h.record.content);
  expect(await readFile(join(h.checkout, extraPath), "utf8")).toContain("A concurrent file edit.");
  expect(success(await h.store.read({ reference: extra.record.reference })).content).toBe("A concurrent file edit.\n");
});

it.each(["normal", "dry-run", "skip-projection"])("leaves a present file unchanged during sync %s", async mode => {
  const h = await fixture(), extra = h.extra[0];
  if (extra === undefined) throw new Error("Missing deletable file");
  await rm(join(h.checkout, extra.path));
  const before = await lstat(join(h.checkout, h.path), { bigint: true }), bytes = await h.file();
  await sync(h, mode === "normal" ? [] : [`--${mode}`]);
  const after = await lstat(join(h.checkout, h.path), { bigint: true });
  expect(after.ino).toBe(before.ino); expect(after.mtimeNs).toBe(before.mtimeNs);
  expect(await h.file()).toBe(bytes);
  if (mode === "normal") expect(await readFile(join(h.checkout, extra.path), "utf8")).toContain(extra.record.content);
  else await expect(readFile(join(h.checkout, extra.path), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
});

async function failFetch(h: Awaited<ReturnType<typeof fixture>>) {
  await h.exec("git", ["remote", "add", "origin", join(h.checkout, "unavailable.git")], { cwd: h.checkout });
  const branch = (await h.exec("git", ["branch", "--show-current"], { cwd: h.checkout })).stdout.trim();
  await h.exec("git", ["config", `branch.${branch}.remote`, "origin"], { cwd: h.checkout });
  await h.exec("git", ["config", `branch.${branch}.merge`, `refs/heads/${branch}`], { cwd: h.checkout });
}

it("restores a deleted file before a failed remote fetch", async () => {
  const h = await fixture();
  await failFetch(h);
  await rm(join(h.checkout, h.path));
  const result = await sync(h);
  expect(JSON.parse(result.output)).toMatchObject({ reason: "worktree-fetch-failed", exitCode: 1 });
  expect(await h.file()).toContain(h.record.content);
});

it("refuses a missing identity before restoring a deleted file", async () => {
  const h = await fixture();
  await h.exec("git", ["config", "arc.identity", "BAD ID"], { cwd: h.checkout });
  await rm(join(h.checkout, h.path));
  const result = await sync(h);
  expect(JSON.parse(result.output)).toMatchObject({ reason: "identity-absent" });
  expect(result.errors).toContain("arc.identity");
  await expect(h.file()).rejects.toMatchObject({ code: "ENOENT" });
});

it.each(["empty", "leaf-link", "ancestor-link"])("restores a deleted rendering safely when its shape is %s", async shape => {
  const h = await fixture(), full = join(h.checkout, h.path), external = join(h.checkout, "external");
  const target = join(external, "one.md");
  await mkdir(external); await writeFile(target, "External bytes stay untouched.\n");
  if (shape === "empty") {
    await writeFile(full, "");
    const old = new Date(Date.now() - 1_000); await utimes(full, old, old);
  } else if (shape === "leaf-link") {
    await rm(full); await symlink(target, full, "file");
  } else {
    const parent = join(h.checkout, ".arc/user/andrew/scratch");
    await rename(parent, `${parent}-saved`); await symlink(external, parent, "junction");
  }
  await sync(h);
  expect(await readFile(target, "utf8")).toBe("External bytes stay untouched.\n");
  if (shape === "ancestor-link") {
    expect((await lstat(join(h.checkout, ".arc/user/andrew/scratch"))).isSymbolicLink()).toBe(true);
    await expect(readFile(join(external, "edited.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  } else {
    expect((await lstat(full)).isSymbolicLink()).toBe(false);
    expect(await h.file()).toContain(h.record.content);
  }
});

it("reports a rebuild failure, continues to fetch, and restores successfully on retry", async () => {
  const h = await fixture(); await failFetch(h);
  await rm(join(h.checkout, h.path));
  binding.ports = ports => ({ ...ports, hooks: { beforeRebuildLink: async path => {
    if (path === h.path) throw new Error("Injected restoration failure");
  } } });
  const failed = await sync(h);
  expect(failed.errors).toContain("Injected restoration failure");
  expect(JSON.parse(failed.output)).toMatchObject({ reason: "worktree-fetch-failed" });
  await expect(h.file()).rejects.toMatchObject({ code: "ENOENT" });
  binding.ports = null;
  expect(JSON.parse((await sync(h)).output)).toMatchObject({ reason: "worktree-fetch-failed" });
  expect(await h.file()).toContain(h.record.content);
});

it("keeps a file recreated at the exclusive link and saves it on the next command", async () => {
  const h = await fixture(); await rm(join(h.checkout, h.path));
  let recreate = true;
  binding.ports = ports => ({ ...ports, hooks: { beforeRebuildLink: async path => {
    if (!recreate || path !== h.path) return;
    recreate = false;
    await h.edit("An editor recreated the missing file.\n");
  } } });
  await sync(h);
  expect(recreate).toBe(false);
  expect(await h.file()).toContain("An editor recreated the missing file.");
  expect((await h.stored()).content).toBe(h.record.content);
  binding.ports = null;
  await sync(h);
  expect((await h.stored()).content).toBe("An editor recreated the missing file.\n");
});

it("retains the old refresh anchor when newer source restores a different deleted file", async () => {
  const h = await fixture(), extra = h.extra[0];
  if (extra === undefined) throw new Error("Missing restore destination");
  await rm(join(h.checkout, extra.path));
  const before = (await h.disk()).state;
  let leases = 0;
  binding.ports = ports => ({ ...ports, lock: { ...ports.lock, resolveProcessScope: async () => {
    if (++leases === 2) success(await h.store.write({ action: "put", reference: h.record.reference, expected: h.record.version,
      content: "A newer source after command start.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
    return NATIVE_LEASE_PROCESS.resolveProcessScope();
  } } });
  await sync(h);
  expect(leases).toBeGreaterThanOrEqual(2);
  expect(await readFile(join(h.checkout, extra.path), "utf8")).toContain(extra.record.content);
  expect(await h.file()).toContain(h.record.content);
  expect((await h.disk()).state).toBe(before);
  binding.ports = null;
  await sync(h);
  expect(await h.file()).toContain("A newer source after command start.");
});

it.each([false, true])("keeps an untouched archive partition cold and invalidates a selected one: deleted=%s", async deleted => {
  const quarter = ".arc/completed/2026-q4";
  const h = await createEngineFixture(directories, { kind: "work-item/notes",
    path: `${quarter}/01_work-item-one/notes-work-item-one.md`, placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  await h.exec("git", ["commit", "--allow-empty", "-m", "Seed code"], { cwd: h.checkout });
  const command = { store: h.store, checkout: h.checkout, location: h.location };
  expect(await startProjection(command)).toMatchObject({ kind: "ready" }); await endProjection(command);
  await sync(h);
  const header = JSON.parse(await readFile(join(h.location.stateDir, "index"), "utf8")) as { groups: Record<string, { name: string }> };
  const partition = header.groups[quarter];
  if (partition === undefined) throw new Error("Missing settled archive partition");
  if (deleted) await rm(join(h.checkout, h.path));
  await writeFile(join(h.location.stateDir, partition.name), "Damaged cold partition bytes");
  const result = await sync(h);
  if (!deleted) {
    expect(await readFile(join(h.location.stateDir, partition.name), "utf8")).toBe("Damaged cold partition bytes");
    expect(await h.file()).toContain(h.record.content);
    return;
  }
  expect(result.errors).toContain(partition.name);
  await expect(access(join(h.location.stateDir, partition.name))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(h.file()).rejects.toMatchObject({ code: "ENOENT" });
  expect(await startProjection(command)).toMatchObject({ kind: "ready" }); await endProjection(command);
  expect(await h.file()).toContain(h.record.content);
});

it("fans out a materialization take-in once after releasing its native lease", async () => {
  const h = await createFanOutFixture(directories); await endProjection(h.input);
  await writeFile(join(h.h.checkout, h.h.path), "");
  const old = new Date(Date.now() - 1_000); await utimes(join(h.h.checkout, h.h.path), old, old);
  let edited = false, landed = false, batches = 0, rounds = 0;
  const observed = overrideEngineStore(h.h.store, {
    batch: async input => {
      const result = await h.h.store.batch(input);
      if (result.status === "ok") { expect(projectionProcessState().lockHeld).toBe(true); landed = true; batches++; }
      return result;
    }, version: async () => {
      if (landed) {
        rounds++;
        expect(projectionProcessState().lockHeld).toBe(false);
        expect(await withProjectionLock(h.h.location, async () => "unlocked", { maxWaitMs: 100 }))
          .toMatchObject({ status: "done", value: "unlocked" });
      }
      return h.h.store.version();
    },
  });
  const store = withFanOut(observed, createProjectionFanOutDependencies(h.h.checkout));
  binding.ports = ports => ({ ...ports, hooks: { afterRecheck: async path => {
    if (edited || path !== h.h.path) return;
    edited = true; await h.h.edit("An edit arriving during materialization.\n");
  } } });
  await sync({ checkout: h.h.checkout, store });
  expect(edited).toBe(true); expect(batches).toBe(1); expect(rounds).toBe(1);
  expect(await h.h.file()).toContain("An edit arriving during materialization.");
  expect(await h.file()).toBe(await h.h.file());
  expect((await h.h.stored()).content).toBe("An edit arriving during materialization.\n");
});
