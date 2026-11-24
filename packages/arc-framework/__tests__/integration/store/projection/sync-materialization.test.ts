/** Sync restores deleted projected files before its existing network orchestration. */
import { chmod, lstat, mkdir, readFile, realpath, rename, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { ProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../../../src/lib/kernel/index.js";
import { checkProjectionRemoval } from "../../../../src/lib/store/projection/removal-check.js";
import { persistProjectionRemoval } from "../../../../src/lib/store/projection/removal-persist.js";
import { releaseProjectionRemoval } from "../../../../src/lib/store/projection/removal-release.js";
import { NATIVE_LEASE_PROCESS } from "../../../../src/lib/lease-process.js";
import type { Store } from "../../../../src/lib/store/contract.js";

const binding = vi.hoisted(() => ({ store: null as Store | null,
  ports: null as ((ports: ProjectionEnginePorts) => ProjectionEnginePorts) | null,
  afterStage: null as ((path: string) => Promise<void>) | null,
  afterLink: null as ((destination: string) => Promise<void>) | null }));
vi.mock("node:fs/promises", async importOriginal => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return { ...original, link: async (...args: Parameters<typeof original.link>) => {
    await original.link(...args);
    const [, destination] = args;
    if (typeof destination === "string") await binding.afterLink?.(destination);
  } };
});
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

vi.mock("../../../../src/lib/store/projection/staging.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../../../src/lib/store/projection/staging.js")>();
  return { ...original, stageRenderedRecordFile: async (input: Parameters<typeof original.stageRenderedRecordFile>[0]) => {
    const staged = await original.stageRenderedRecordFile(input);
    await binding.afterStage?.(input.path);
    return staged;
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
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { projectionCommand } from "../../../helpers/store/projection/command.js";

const directories: string[] = [];
afterEach(async () => {
  binding.store = null; binding.ports = null; binding.afterStage = null; binding.afterLink = null;
  beginProjectionCommand(); await removeGitBackedDirs(directories.splice(0));
});

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

it.each([false, true])("rebuilds a damaged cold archive partition during the same sync: deleted=%s", async deleted => {
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
  expect(result.errors).not.toContain("mismatched index partition");
  expect(await h.file()).toContain(h.record.content);
  expect((await h.disk()).entries[h.path]).toMatchObject({ kind: "record", withheld: false });
  expect((await lstat(join(h.checkout, h.path))).mode & 0o200).toBe(0);

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

it.each([
  { existence: "absent", timing: "before the guard" },
  { existence: "absent", timing: "during the swap" },
  { existence: "empty", timing: "during the swap" },
  { existence: "empty", timing: "after the first copy check" },
])("keeps a late archive correction out of sync restoration of a $existence file $timing", async ({ existence, timing }) => {
  const h = await createEngineFixture(directories, { kind: "work-item/notes",
    path: ".arc/completed/2026-q4/01_work-item-one/notes-work-item-one.md",
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  await h.exec("git", ["commit", "--allow-empty", "-m", "Seed code"], { cwd: h.checkout });
  expect(await startProjection(h)).toMatchObject({ kind: "ready" });
  await endProjection(h);
  const entry = (await h.disk()).entries[h.path];
  if (entry?.kind !== "record") throw new Error("Missing archive entry");
  const file = join(h.checkout, h.path);
  await chmod(file, 0o644);
  if (existence === "absent") await rm(file);
  else {
    await writeFile(file, "");
    await utimes(file, new Date(0), new Date(0));
  }
  let edited = false;
  const bytes = renderStampedFile({ content: "# Notes\n\nA late correction.\n", stamp: entry.base.blob });
  const edit = async (path: string, target = file) => {
    if (edited || path !== h.path) return;
    edited = true;
    await writeFile(target, bytes);
  };
  if (timing === "before the guard") binding.afterStage = edit;
  else binding.ports = ports => ({ ...ports, hooks: timing === "during the swap" ? { afterRecheck: edit } : {
    afterFirstCheck: async path => {
      const indexed = (await h.disk()).entries[path];
      const copy = indexed?.kind === "record" ? indexed.copies.at(-1) : undefined;
      if (copy === undefined) throw new Error("Missing aside copy");
      await edit(path, join(h.checkout, copy.name));
    },
  } });
  await sync(h);
  expect(edited).toBe(true);
  expect(success(await h.store.read({ reference: h.record.reference }))).toMatchObject({
    version: h.record.version, content: h.record.content,
  });
  expect(await readFile(file, "utf8")).toBe(bytes);
});

it.each([
  { source: "another record's rendering", replaced: false },
  { source: "its own stored rendering", replaced: true },
])("treats $source written during sync restoration as an edit only when it is not this record's version", async ({ replaced }) => {
  const h = await createEngineFixture(directories, { kind: "work-item/notes",
    path: ".arc/completed/2026-q4/01_work-item-one/notes-work-item-one.md",
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  await h.exec("git", ["commit", "--allow-empty", "-m", "Seed code"], { cwd: h.checkout });
  expect(await startProjection(h)).toMatchObject({ kind: "ready" });
  await endProjection(h);
  const file = join(h.checkout, h.path), laid = await readFile(file, "utf8");
  const other = "# Notes of another work item\n\nIts own stored text.\n";
  const bytes = replaced ? laid : renderStampedFile({ content: other, stamp: gitBlobId(other, "sha1") });
  await chmod(file, 0o644);
  await writeFile(file, "");
  await utimes(file, new Date(0), new Date(0));
  let written = false;
  binding.ports = ports => ({ ...ports, hooks: { afterRecheck: async path => {
    if (written || path !== h.path) return;
    written = true;
    await writeFile(file, bytes);
  } } });
  const result = await sync(h);
  expect(written).toBe(true);
  expect(success(await h.store.read({ reference: h.record.reference }))).toMatchObject({ version: h.record.version });
  const restored = await readFile(file, "utf8");
  if (replaced) {
    expect(restored).toContain("arc-notice");
    expect(result.errors).not.toContain("changed during sync restoration");
  } else {
    expect(restored).toBe(bytes);
    expect(result.errors).toContain("An archived file changed during sync restoration");
    expect(result.errors).toContain("arc edit");
  }
});

it.each(["persist", "release"] as const)("leaves a correction sync's restoration refused unsettled, so the removal check passes and %s lands it", async slot => {
  const h = await createEngineFixture(directories, { kind: "work-item/notes",
    path: ".arc/completed/2026-q4/01_work-item-one/notes-work-item-one.md",
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  await h.exec("git", ["commit", "--allow-empty", "-m", "Seed code"], { cwd: h.checkout });
  expect(await startProjection(h)).toMatchObject({ kind: "ready" });
  await endProjection(h);
  const file = join(h.checkout, h.path), entry = (await h.disk()).entries[h.path];
  if (entry?.kind !== "record") throw new Error("Missing archive entry");
  const bytes = renderStampedFile({ content: "# Notes\n\nA late correction nobody opened.\n", stamp: entry.base.blob });
  await chmod(file, 0o644);
  await writeFile(file, "");
  await utimes(file, new Date(0), new Date(0));
  let written = false;
  binding.ports = ports => ({ ...ports, hooks: { afterRecheck: async path => {
    if (written || path !== h.path) return;
    written = true;
    await writeFile(file, bytes);
  } } });
  const result = await sync(h);
  binding.ports = null;
  expect(result.errors).toContain("An archived file changed during sync restoration");
  expect(success(await h.store.read({ reference: h.record.reference }))).toMatchObject({ version: h.record.version });
  const refused = (await h.disk()).entries[h.path];
  expect(refused).toMatchObject({ pending: true });
  expect(refused).not.toHaveProperty("opened");
  // A refused take-in leaves the entry unsettled, which the steps that finish unsettled entries land under the rights check.
  const context = { store: h.store, identity: SlugSchema.parse("andrew") };
  expect(await checkProjectionRemoval(h.checkout, context, slot === "release" ? "release" : "remove")).toMatchObject({ kind: "passes" });
  expect(slot === "release" ? await releaseProjectionRemoval(h.checkout, true, context) : await persistProjectionRemoval(h.checkout, context))
    .toMatchObject({ kind: slot === "release" ? "released" : "persisted" });
  expect(success(await h.store.read({ reference: h.record.reference })).content).toContain("A late correction nobody opened.");
});

it("finds an in-place correction made after the restoration link and lands it after explicit opening", async () => {
  const h = await createEngineFixture(directories, { kind: "work-item/notes",
    path: ".arc/completed/2026-q4/01_work-item-one/notes-work-item-one.md",
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  await h.exec("git", ["commit", "--allow-empty", "-m", "Seed code"], { cwd: h.checkout });
  expect(await startProjection(h)).toMatchObject({ kind: "ready" });
  await endProjection(h);
  const entry = (await h.disk()).entries[h.path];
  if (entry?.kind !== "record") throw new Error("Missing archive entry");
  const file = join(await realpath(h.checkout), h.path);
  const content = "# Notes\n\nA correction written over the restored file.\n";
  const bytes = renderStampedFile({ content, stamp: entry.base.blob });
  await chmod(file, 0o644);
  await rm(file);
  let edited = false;
  binding.afterLink = async destination => {
    if (destination !== file) return;
    binding.afterLink = null;
    edited = true;
    await chmod(file, 0o644);
    await writeFile(file, bytes);
  };
  await sync(h);
  expect(edited).toBe(true);
  expect(await readFile(file, "utf8")).toBe(bytes);
  expect(await h.stored()).toMatchObject({ version: h.record.version, content: h.record.content });
  expect((await sync(h)).errors).toContain(`arc edit ${h.path}`);
  expect((await projectionCommand(h, ["edit", file])).result).toMatchObject({ status: "ok" });
  expect((await projectionCommand(h, ["save"])).result).toMatchObject({ status: "ok" });
  expect((await h.stored()).content).toBe(content);
});
