/** Archive opening through the registered command preserves content and records intent before changing mode. */
import { chmod, mkdir, readFile, stat, writeFile, rm, symlink, rename, utimes } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { Store } from "../../../../src/lib/store/contract.js";
import type { ProjectionEditResult } from "../../../../src/lib/store/projection/edit.js";
import { createAdoptionFixture, createErrandAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { dispatchRegisteredCli } from "../../../helpers/registered-cli.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { readProjectionIndex, writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";

const binding = vi.hoisted(() => ({ store: null as Store | null, afterOpen: null as ((path: string) => Promise<void>) | null,
  timeOffset: 0, alias: null as { operand: string; file: string } | null, removeOnRead: null as string | null,
  denied: null as string | null }));
vi.mock("node:fs/promises", async original => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual,
    chmod: (path: Parameters<typeof actual.chmod>[0], mode: Parameters<typeof actual.chmod>[1]) =>
      actual.chmod(binding.alias?.operand === path ? binding.alias.file : path, mode),
    lstat: (...args: Parameters<typeof actual.lstat>) => {
      if (args[0] === binding.denied) throw Object.assign(new Error(`Access denied: ${args[0]}`), { code: "EACCES" });
      if (binding.alias !== null && args[0] === binding.alias.operand) args[0] = binding.alias.file;
      return actual.lstat(...args);
    },
    readFile: async (...args: Parameters<typeof actual.readFile>) => {
      if (binding.alias !== null && args[0] === binding.alias.operand) args[0] = binding.alias.file;
      if (binding.removeOnRead !== null && args[0] === binding.removeOnRead) {
        binding.removeOnRead = null;
        await actual.rm(args[0]);
      }
      return actual.readFile(...args);
    },
  };
});
vi.mock("../../../../src/lib/store/create.js", async original => {
  const actual = await original<typeof import("../../../../src/lib/store/create.js")>();
  return { ...actual, createStore: (...args: Parameters<typeof actual.createStore>) => binding.store ?? actual.createStore(...args) };
});
vi.mock("../../../../src/lib/store/projection/engine-ports.js", async original => {
  const actual = await original<typeof import("../../../../src/lib/store/projection/engine-ports.js")>();
  return { ...actual, createProjectionEnginePorts: (...args: Parameters<typeof actual.createProjectionEnginePorts>) => ({
    ...actual.createProjectionEnginePorts(...args), maxWaitMs: 25, lock: { now: () => Date.now() + binding.timeOffset },
    hooks: { afterOpenIndexCommit: (path: string) => binding.afterOpen?.(path) ?? Promise.resolve() },
  }) };
});

import { createExecaGitExec } from "../../../../src/lib/git/process-executor.js";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { seed, success, update, testProvenance } from "../../../helpers/store/suite-tools.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { completedCohortPath } from "../../../../src/lib/store/lifecycle-record-path.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";
import { cohortDoc } from "../../../helpers/store/cohort-rule-input.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import { configureEngineCheckout } from "../../../helpers/store/projection/engine-fixture.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import { projectionCommand } from "../../../helpers/store/projection/command.js";

const directories: string[] = [];
afterEach(async () => {
  binding.store = null;
  binding.afterOpen = null;
  binding.timeOffset = 0;
  binding.alias = null;
  binding.removeOnRead = null;
  binding.denied = null;
  await removeGitBackedDirs(directories.splice(0));
});
const quarter = ArchiveQuarterSchema.parse("2026-q4");

async function edit(store: Store, checkout: string, path: string, configure?: Parameters<typeof dispatchRegisteredCli>[1], flags: readonly string[] = []) {
  const cwd = process.cwd(), exit = process.exitCode;
  let output = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    binding.store = store; process.chdir(checkout); process.exitCode = undefined;
    await dispatchRegisteredCli([...flags, "edit", path, "--json"], configure);
    return JSON.parse(output) as ProjectionEditResult;
  } finally { out.mockRestore(); err.mockRestore(); process.chdir(cwd); process.exitCode = exit; }
}

it("opens archived metadata after recording intent, leaving its content and store untouched", async () => {
  const h = await createAdoptionFixture({ placement: { kind: "completed", quarter } });
  directories.push(h.f.root);
  const path = Object.keys(h.projected.index.entries)[0]!, absolute = join(h.f.root, path);
  await chmod(absolute, 0o444);
  const bytes = await readFile(absolute), version = await h.f.store.version();
  let observed = false;
  binding.afterOpen = async opened => {
    expect(opened).toBe(path);
    expect(await readProjectionIndex(h.projected.location, true, { groups: "all" }))
      .toMatchObject({ kind: "index", index: { entries: { [path]: { opened: true } } } });
    expect((await stat(absolute)).mode & 0o200).toBe(0);
    observed = true;
  };
  expect(await edit(h.f.store, h.f.root, path)).toMatchObject({ status: "ok", result: { path } });
  expect(observed).toBe(true);
  expect((await stat(absolute)).mode & 0o200).toBe(0o200);
  expect(await readFile(absolute)).toEqual(bytes);
  expect(await h.f.store.version()).toEqual(version);
  binding.afterOpen = null;
  await chmod(absolute, 0o444);
  expect(await edit(h.f.store, h.f.root, path)).toMatchObject({ status: "ok" });
  expect((await stat(absolute)).mode & 0o200).toBe(0o200);
});

it("opens a new archived companion without adopting or changing its bytes", async () => {
  const h = await createAdoptionFixture({ placement: { kind: "completed", quarter } });
  directories.push(h.f.root);
  const path = `${h.folder}/correction.txt`, bytes = "An authored correction.\n";
  await writeFile(join(h.f.root, path), bytes);
  const version = await h.f.store.version();
  expect(await edit(h.f.store, h.f.root, path)).toMatchObject({ status: "ok" });
  expect(await readProjectionIndex(h.projected.location, true, { groups: "all" }))
    .toMatchObject({ kind: "index", index: { entries: { [path]: { kind: "ownerless", opened: true } } } });
  expect(await readFile(join(h.f.root, path), "utf8")).toBe(bytes);
  expect(await h.f.store.version()).toEqual(version);
});

it.each(["indexed", "unindexed", "new"] as const)("opens an archived Errand's %s description", async kind => {
  const h = await createErrandAdoptionFixture({ completed: true, unindexed: kind !== "indexed" });
  if (kind === "new") success(await h.f.store.write({ action: "remove", reference: h.description.reference,
    expected: h.description.version, provenance: testProvenance }));
  directories.push(h.f.root);
  const path = `${h.folder}/errand-alpha.md`;
  expect(await edit(h.f.store, h.f.root, path)).toMatchObject({ status: "ok" });
  expect(await readProjectionIndex(h.projected.location, true, { groups: "all" }))
    .toMatchObject({ kind: "index", index: { entries: { [path]: { kind: kind === "indexed" ? "record" : "ownerless", opened: true } } } });
});

async function archived(owner = "andrew") {
  const h = await createAdoptionFixture({ placement: { kind: "completed", quarter }, owner });
  directories.push(h.f.root);
  return { ...h, path: Object.keys(h.projected.index.entries)[0]! };
}

it("names the stored spelling when a case alias addresses an archived file", async () => {
  const h = await archived(), path = `${h.folder}/notes-alpha.md`, alias = `${h.folder}/Notes-alpha.md`;
  const notes = await seed(h.f, recordReferences["work-item/notes"](h.primary.reference.owner), "# Notes\n\nArchive notes.\n");
  await rm(join(h.f.root, h.path));
  await seedProjection({ store: h.f.store, checkout: h.f.root, files: [
    { reference: h.primary.reference, path: h.path }, { reference: notes.reference, path },
  ] });
  binding.alias = { operand: join(h.f.root, alias), file: join(h.f.root, path) };
  expect(await edit(h.f.store, h.f.root, alias)).toMatchObject({ status: "refused", refusal: {
    code: "edit-refused", remedy: { text: expect.stringContaining(path) },
  } });
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  expect(disk).toMatchObject({ kind: "index" });
  if (disk.kind !== "index") throw new Error("Missing archive index");
  expect(disk.index.entries[alias]).toBeUndefined();
  expect(disk.index.entries[path]).not.toHaveProperty("opened");
  expect(await edit(h.f.store, h.f.root, path)).toMatchObject({ status: "ok", result: { path } });
});

it("names creation when the new archive file disappears during adoption inspection", async () => {
  const h = await archived(), path = `${h.folder}/interrupted.txt`, file = join(h.f.root, path);
  await writeFile(file, "An archive correction.\n");
  binding.removeOnRead = file;
  expect(await edit(h.f.store, h.f.root, path)).toMatchObject({ status: "refused", refusal: {
    code: "edit-refused", condition: `No file exists at ${path}.`, remedy: { text: expect.stringContaining("Create the file") },
  } });
  await writeFile(file, "An archive correction.\n");
  expect(await edit(h.f.store, h.f.root, path)).toMatchObject({ status: "ok" });
});

it("names arc sync when an indexed file disappears during rights inspection", async () => {
  const h = await archived(), absolute = join(h.f.root, h.path);
  let disappear = false;
  const store = overrideEngineStore(h.f.store, { read: async input => {
    if (disappear && input.reference.kind === "work-item/meta") {
      disappear = false;
      await rm(absolute);
    }
    return h.f.store.read(input);
  } });
  expect(await edit(store, h.f.root, h.path, program => { program.hook("preAction", () => { disappear = true; }); }))
    .toMatchObject({ status: "refused", refusal: { code: "edit-refused", condition: `No file exists at ${h.path}.`,
      remedy: { argv: ["arc", "sync"] } } });
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing archive index");
  expect(disk.index.entries[h.path]).not.toHaveProperty("opened");
});

it("names arc sync for a deleted stored file with no index entry", async () => {
  const h = await createErrandAdoptionFixture({ completed: true, unindexed: true });
  directories.push(h.f.root);
  const path = `${h.folder}/errand-alpha.md`;
  await rm(join(h.f.root, path));
  expect(await edit(h.f.store, h.f.root, path)).toMatchObject({ status: "refused", refusal: {
    code: "edit-refused", remedy: { argv: ["arc", "sync"] },
  } });
});

it("keeps the opening and names a retry when the file disappears after recording", async () => {
  const h = await archived(), absolute = join(h.f.root, h.path), bytes = await readFile(absolute);
  binding.afterOpen = async () => { await rm(absolute); };
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "refused", refusal: { code: "edit-refused",
    condition: expect.stringContaining(h.path), remedy: { text: expect.stringContaining("retry arc edit") } } });
  expect(await readProjectionIndex(h.projected.location, true, { groups: "all" }))
    .toMatchObject({ kind: "index", index: { entries: { [h.path]: { opened: true } } } });
  binding.afterOpen = null;
  await writeFile(absolute, bytes, { mode: 0o444 });
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
  expect((await stat(absolute)).mode & 0o200).toBe(0o200);
});

it("opens an absolute operand spelled through a link to the checkout", async () => {
  const h = await archived(), alias = `${h.f.root}-alias`;
  await symlink(h.f.root, alias, "junction");
  try {
    expect(await edit(h.f.store, h.f.root, join(alias, h.path))).toMatchObject({ status: "ok", result: { path: h.path } });
  } finally { await rm(alias); }
});

it.each(["outside", "missing-new", "side-file", "symlink", "unowned", "missing-stored"] as const)(
  "refuses a %s path with a remedy and opens once the path is repaired", async kind => {
    const h = await archived();
    const valid = h.path;
    const path = kind === "outside" ? "README.md"
      : kind === "missing-new" ? `${h.folder}/new.txt`
      : kind === "side-file" ? `${h.folder}/.DS_Store`
      : kind === "unowned" ? ".arc/completed/2026-q4/unknown.txt"
      : kind === "symlink" ? `${h.folder}/link.txt` : valid;
    if (kind === "symlink") await symlink(join(h.f.root, valid), join(h.f.root, path));
    else if (kind === "missing-stored") await rm(join(h.f.root, valid));
    else if (kind !== "missing-new") await writeFile(join(h.f.root, path), "Local input\n");
    const refused = await edit(h.f.store, h.f.root, path);
    expect(refused).toMatchObject({ status: "refused", refusal: { code: "edit-refused",
      condition: expect.stringContaining(path), remedy: { text: expect.any(String) } } });
    if (kind === "missing-stored") expect(refused).toMatchObject({ refusal: { remedy: { text: expect.stringContaining("arc sync") } } });
    let repaired = valid;
    if (kind === "missing-stored") await projectionCommand({ store: h.f.store, checkout: h.f.root }, ["sync"]);
    if (kind === "missing-new") { await writeFile(join(h.f.root, path), "New archive prose\n"); repaired = path; }
    if (kind === "symlink") { await rm(join(h.f.root, path)); await writeFile(join(h.f.root, path), "Regular file\n"); repaired = path; }
    expect(await edit(h.f.store, h.f.root, repaired)).toMatchObject({ status: "ok" });
  },
);

it("refuses another person's archive and opens it under its owner's identity", async () => {
  const h = await archived("beth");
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "refused", refusal: {
    code: "edit-refused", condition: expect.stringContaining("beth"), remedy: { text: expect.stringContaining("beth") },
  } });
  await createExecaGitExec()("git", ["config", "arc.identity", "beth"], { cwd: h.f.root });
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
});

it("refuses another checkout's absolute path and opens it from the holding checkout", async () => {
  const h = await archived(), other = await archived();
  expect(await edit(h.f.store, h.f.root, join(other.f.root, other.path))).toMatchObject({
    status: "refused", refusal: { code: "edit-refused", remedy: { text: expect.stringContaining("checkout that holds") } },
  });
  expect(await edit(other.f.store, other.f.root, other.path)).toMatchObject({ status: "ok" });
});

it("refuses a withheld entry with its repair guidance", async () => {
  const h = await archived(), entry = h.projected.index.entries[h.path]!;
  await writeProjectionIndex(h.projected.location, { ...h.projected.index, entries: { [h.path]: { ...entry, withheld: true } } });
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "refused", refusal: {
    code: "edit-refused", remedy: { text: expect.stringContaining("delete") },
  } });
  await writeProjectionIndex(h.projected.location, h.projected.index);
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
});

it("refuses a file held by incomplete inventory and opens after a whole-evidence rebuild", async () => {
  const h = await archived();
  const refusal = StoreRefusalSchema.parse({ code: "namespace-corrupt", class: "terminal", namespace: "refs/arc/project/work-items",
    condition: "The inventory is unavailable.", remedy: { text: "Repair the inventory and retry." } });
  const faulted = overrideEngineStore(h.f.store, { list: input => input.family === "work-item"
    ? Promise.resolve({ status: "refused", refusal }) : h.f.store.list(input) });
  await rm(join(h.projected.location.stateDir, "index"));
  expect(await edit(faulted, h.f.root, h.path)).toMatchObject({ status: "refused", refusal: {
    code: "edit-refused", remedy: { text: expect.stringContaining("Resolve the condition") },
  } });
  expect(await readProjectionIndex(h.projected.location, true, { groups: "all" })).toMatchObject({
    kind: "index", index: { state: null, entries: { [h.path]: { kind: "ownerless", withheld: true } } },
  });
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
  expect(await readProjectionIndex(h.projected.location, true, { groups: "all" })).toMatchObject({
    kind: "index", index: { entries: { [h.path]: { kind: "record", opened: true, withheld: false } } },
  });
});

it("refuses before the storage switch, naming in-place archive editing", async () => {
  const h = await archived();
  const dark = overrideEngineStore(h.f.store, { capabilities: { stateOffBranch: false } });
  expect(await edit(dark, h.f.root, h.path)).toMatchObject({ status: "refused", refusal: {
    code: "unsupported", remedy: { text: expect.stringContaining("in place") },
  } });
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
});

it("refuses without an identity and opens after arc.identity is set", async () => {
  const h = await archived(), exec = createExecaGitExec();
  await exec("git", ["config", "arc.identity", ""], { cwd: h.f.root });
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "refused", refusal: {
    code: "projection-skipped", remedy: { text: expect.stringContaining("arc.identity") },
  } });
  await exec("git", ["config", "arc.identity", "andrew"], { cwd: h.f.root });
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
});

it("refuses while its opening lock is held and succeeds after release", async () => {
  const h = await archived();
  let release = (): void => {}, holding: ReturnType<typeof withProjectionLock> | undefined;
  try {
    const refused = await edit(h.f.store, h.f.root, h.path, program => { program.hook("preAction", async () => {
      let acquired = (): void => {};
      const entered = new Promise<void>(resolve => { acquired = resolve; });
      holding = withProjectionLock(h.projected.location, async () => {
        acquired(); await new Promise<void>(resolve => { release = resolve; });
      });
      await entered;
    }); });
    expect(refused).toMatchObject({ status: "refused", refusal: { code: "projection-skipped", condition: expect.stringContaining(`"pid":${process.pid}`),
      remedy: { text: "Retry arc edit once the command holding the projection lock finishes." } } });
  } finally { release(); await holding; }
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
});

it("refuses --skip-projection and opens once the switch is removed", async () => {
  const h = await archived();
  expect(await edit(h.f.store, h.f.root, h.path, undefined, ["--skip-projection"])).toMatchObject({
    status: "refused", refusal: { code: "projection-skipped", condition: expect.stringContaining("skip") },
  });
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
});

it("names a mistyped editor argument as a missing path", async () => {
  const h = await archived();
  expect(await edit(h.f.store, h.f.root, "vscode")).toMatchObject({ status: "refused", refusal: {
    code: "edit-refused", condition: expect.stringContaining("No file exists at vscode"),
    remedy: { text: expect.stringContaining("in place") },
  } });
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
});

it("gives an in-place edit remedy for a file still being saved outside the archive", async () => {
  const h = await archived(), path = "README.md", absolute = join(h.f.root, path);
  await writeFile(absolute, "");
  const future = new Date(Date.now() + 60_000);
  await utimes(absolute, future, future);
  expect(await edit(h.f.store, h.f.root, path)).toMatchObject({ status: "refused", refusal: {
    code: "edit-refused", remedy: { text: expect.stringContaining("in place") },
  } });
});

it("gives an in-place edit remedy for an inaccessible operand outside the archive", async () => {
  const h = await archived(), path = ".arc/active/private/file.md";
  expect(await edit(h.f.store, h.f.root, path, program => { program.hook("preAction", () => {
    binding.denied = join(h.f.root, path);
  }); })).toMatchObject({ status: "refused", refusal: { code: "edit-refused",
    remedy: { text: expect.stringContaining("in place") },
  } });
});

it("names the owner of a missing companion before advising how to open it", async () => {
  const h = await archived("beth"), path = `${h.folder}/missing.txt`;
  expect(await edit(h.f.store, h.f.root, path)).toMatchObject({ status: "refused", refusal: {
    code: "edit-refused", condition: expect.stringContaining("beth"), remedy: { text: expect.stringContaining("beth") },
  } });
});

it("gives adoption's remedy for a missing file with no archive owner", async () => {
  const h = await archived(), path = ".arc/completed/2026-q4/unknown.txt";
  expect(await edit(h.f.store, h.f.root, path)).toMatchObject({ status: "refused", refusal: {
    code: "edit-refused", remedy: { text: expect.stringContaining("Move the file") },
  } });
});

it.each(["checkout root", "archive folder", "work unit folder"] as const)(
  "directs a %s operand to one archived file", async folder => {
    const h = await archived();
    const path = folder === "checkout root" ? "." : folder === "archive folder" ? ".arc/completed" : h.folder;
    const refused = await edit(h.f.store, h.f.root, path);
    expect(refused).toMatchObject({ status: "refused", refusal: { code: "edit-refused",
      condition: expect.stringContaining("opens one file"), remedy: { text: expect.stringContaining("one file") },
    } });
    expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
  },
);

it("invalidates a corrupt archive partition discovered after start and opens on retry", async () => {
  const h = await archived();
  let name = "";
  const refused = await edit(h.f.store, h.f.root, h.path, program => { program.hook("preAction", async () => {
    const header = JSON.parse(await readFile(join(h.projected.location.stateDir, "index"), "utf8")) as {
      groups: Record<string, { name: string }>;
    };
    name = header.groups[".arc/completed/2026-q4"]!.name;
    await writeFile(join(h.projected.location.stateDir, name), "changed after start");
  }); });
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "projection-skipped",
    condition: expect.stringContaining(name), remedy: { text: "Retry arc edit; its command start rebuilds the projection index." } } });
  await expect(readFile(join(h.projected.location.stateDir, name))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
});

it("keeps opening intent after a lost lease and opens on retry", async () => {
  const h = await archived(), absolute = join(h.f.root, h.path);
  await chmod(absolute, 0o444);
  binding.afterOpen = async () => { await rm(join(h.projected.location.stateDir, "lock")); binding.timeOffset = 120_000; };
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "refused", refusal: {
    code: "projection-skipped", condition: expect.stringContaining("lost"), remedy: { text: "Retry arc edit." },
  } });
  expect((await stat(absolute)).mode & 0o200).toBe(0);
  expect(await readProjectionIndex(h.projected.location, true, { groups: "all" }))
    .toMatchObject({ kind: "index", index: { entries: { [h.path]: { opened: true } } } });
  binding.afterOpen = null; binding.timeOffset = 0;
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
});

it("refuses a Git directory removed after start and succeeds once restored", async () => {
  const h = await archived(), saved = join(h.f.root, "held-git-dir");
  let moved = false;
  try {
    expect(await edit(h.f.store, h.f.root, h.path, program => { program.hook("preAction", async () => {
      await rename(join(h.f.root, ".git"), saved); moved = true;
    }); })).toMatchObject({ status: "refused", refusal: {
      code: "projection-skipped", condition: expect.stringContaining("Git directory"),
      remedy: { text: "Restore the worktree's Git directory, then retry arc edit." },
    } });
  } finally { if (moved) await rename(saved, join(h.f.root, ".git")); }
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
});

it("refuses an unclaimed linked checkout without a projection and opens after materialization", async () => {
  const h = await archived(), exec = createExecaGitExec(), checkout = join(h.f.root, "linked");
  await exec("git", ["worktree", "add", "-b", "unclaimed", checkout], { cwd: h.f.root });
  await configureEngineCheckout(checkout);
  expect(await edit(h.f.store, checkout, h.path)).toMatchObject({ status: "refused", refusal: {
    code: "projection-refused", condition: expect.stringContaining("no projection"),
    remedy: { text: expect.stringContaining("materialize") },
  } });
  await seedProjection({ store: h.f.store, checkout, files: [{ reference: h.primary.reference, path: h.path }] });
  expect(await edit(h.f.store, checkout, h.path)).toMatchObject({ status: "ok" });
});

it("opens a forced edit without changing its bytes or publishing it", async () => {
  const h = await archived(), absolute = join(h.f.root, h.path), original = await readFile(absolute, "utf8");
  await chmod(absolute, 0o644);
  const content = original + "\nLocal correction waiting for save.\n";
  await writeFile(absolute, content);
  const version = await h.f.store.version();
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
  expect(await readFile(absolute, "utf8")).toBe(content);
  expect(await h.f.store.version()).toEqual(version);
});

async function archiveCohort(f: Awaited<ReturnType<typeof archived>>["f"]) {
  const prior = await seed(f, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" })),
    cohortDoc().content);
  success(await f.store.write({ ...update(f, prior, prior.content), placement: { kind: "completed", quarter },
    provenance: { verb: "archive", lifecycleAction: "archive" } }));
  return success(await f.store.read({ reference: prior.reference }));
}

it("names the adoption remedy for invalid archive locations and opens files after relocation", async () => {
  const h = await archived();
  const cohortFolder = dirname(completedCohortPath(await archiveCohort(h.f))).replaceAll("\\", "/");
  const folders = [".arc/completed", `.arc/completed/${quarter}`, cohortFolder];
  for (const [ordinal, folder] of folders.entries()) {
    const path = `${folder}/correction-${ordinal}.txt`, recovered = `${h.folder}/correction-${ordinal}.txt`;
    await mkdir(join(h.f.root, folder), { recursive: true });
    await writeFile(join(h.f.root, path), "Archive prose with a valid destination.\n");
    expect(await edit(h.f.store, h.f.root, path)).toMatchObject({ status: "refused", refusal: {
      condition: expect.stringContaining(path), remedy: { text: expect.stringContaining("a work item's folder") },
    } });
    await rename(join(h.f.root, path), join(h.f.root, recovered));
    expect(await edit(h.f.store, h.f.root, recovered)).toMatchObject({ status: "ok" });
  }
});

it("lets anyone open an archived cohort document", async () => {
  const h = await archived();
  const archivedRecord = await archiveCohort(h.f), path = completedCohortPath(archivedRecord);
  await rm(join(h.f.root, h.path));
  await seedProjection({ store: h.f.store, checkout: h.f.root, files: [
    { reference: h.primary.reference, path: h.path }, { reference: archivedRecord.reference, path },
  ] });
  await createExecaGitExec()("git", ["config", "arc.identity", "beth"], { cwd: h.f.root });
  expect(await edit(h.f.store, h.f.root, path)).toMatchObject({ status: "ok", result: { path } });
  expect(await readProjectionIndex(h.projected.location, true, { groups: "all" }))
    .toMatchObject({ kind: "index", index: { entries: { [path]: { opened: true } } } });
});

it.each([true, false])("refuses in-flight metadata with its own editing remedy, own=%s", async own => {
  const h = await createAdoptionFixture({ placement: { kind: "active" }, ...(own ? { ownLayout: "nested" as const } : {}) });
  directories.push(h.f.root);
  const path = Object.keys(h.projected.index.entries)[0]!;
  expect(await edit(h.f.store, h.f.root, path)).toMatchObject({ status: "refused", refusal: {
    code: "edit-refused", remedy: { text: expect.stringContaining(own ? "in place" : "materialize") },
  } });
  const correction = await archived();
  expect(await edit(correction.f.store, correction.f.root, correction.path)).toMatchObject({ status: "ok" });
});
