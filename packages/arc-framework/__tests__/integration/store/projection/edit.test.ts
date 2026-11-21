/** Archive opening through the registered command preserves content and records intent before changing mode. */
import { chmod, lstat, mkdir, readFile, stat, writeFile, rm, symlink, rename, utimes } from "node:fs/promises";
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
  removeOnRead: null as string | null, timeOffset: 0, chmodError: null as string | null }));
vi.mock("node:fs", async original => {
  const actual = await original<typeof import("node:fs")>();
  return { ...actual, openSync: (...args: Parameters<typeof actual.openSync>) => {
    if (args[0] === binding.removeOnRead && binding.removeOnRead !== null) {
      actual.rmSync(binding.removeOnRead);
      binding.removeOnRead = null;
    }
    return actual.openSync(...args);
  } };
});
vi.mock("node:fs/promises", async original => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, open: async (...args: Parameters<typeof actual.open>) => {
    const handle = await actual.open(...args);
    return new Proxy(handle, { get(target, key) {
      const code = binding.chmodError;
      if (key === "chmod" && code !== null) return async () => {
        binding.chmodError = null;
        throw Object.assign(new Error(`Mode change failed: ${code}`), { code });
      };
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
  } };
});
vi.mock("../../../../src/lib/store/create.js", async original => {
  const actual = await original<typeof import("../../../../src/lib/store/create.js")>();
  return { ...actual, createStore: (...args: Parameters<typeof actual.createStore>) => binding.store ?? actual.createStore(...args) };
});
vi.mock("../../../../src/lib/store/projection/engine-ports.js", async original => {
  const actual = await original<typeof import("../../../../src/lib/store/projection/engine-ports.js")>();
  return { ...actual, createProjectionEnginePorts: (...args: Parameters<typeof actual.createProjectionEnginePorts>) => {
    const ports = actual.createProjectionEnginePorts(...args);
    return { ...ports, maxWaitMs: 25, lock: { now: () => Date.now() + binding.timeOffset },
      hooks: { afterOpenIndexCommit: (path: string) => binding.afterOpen?.(path) ?? Promise.resolve() },
    };
  } };
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
  binding.removeOnRead = null;
  binding.timeOffset = 0;
  binding.chmodError = null;
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

it.each([true, false])("refuses a nested checkout's file when the checkout is inside the parent archive=%s", async insideArchive => {
  const h = await archived();
  const prefix = insideArchive ? `${h.folder}/linked` : "linked";
  const checkout = join(h.f.root, prefix), path = `${prefix}/${h.folder}/note.txt`, file = join(h.f.root, path);
  await h.f.ports.exec("git", ["worktree", "add", "--detach", checkout], { cwd: h.f.root });
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, "Nested checkout's note.\n", { mode: 0o444 });
  expect(await edit(h.f.store, h.f.root, path)).toMatchObject({ status: "refused", refusal: {
    condition: expect.stringContaining("another checkout"), remedy: { text: expect.stringContaining("checkout that holds") },
  } });
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing archive index");
  expect(disk.index.entries[path]).toBeUndefined();
  expect((await stat(file)).mode & 0o200).toBe(0);
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
});

it("leaves permissions alone when a folder link arrives after recording the opening", async () => {
  const h = await archived(), file = join(h.f.root, h.path);
  const folder = join(h.f.root, h.folder), held = `${folder}-held`;
  binding.afterOpen = async () => { await rename(folder, held); await symlink(held, folder, "junction"); };
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "refused", refusal: {
    condition: expect.stringContaining("symbolic link"), remedy: { text: expect.stringContaining("Replace the symbolic link") },
  } });
  expect((await stat(file)).mode & 0o200).toBe(0);
  const withdrawn = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (withdrawn.kind !== "index") throw new Error("Missing archive index");
  expect(withdrawn.index.entries[h.path]).not.toHaveProperty("opened");
  binding.afterOpen = null;
  await rm(folder, { recursive: true });
  await rename(held, folder);
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
});

it("keeps a nested checkout's replacement read-only when it arrives after the opening is recorded", async () => {
  const h = await archived(), folder = join(h.f.root, h.folder), file = join(h.f.root, h.path);
  const original = `${folder}-original`, replacement = "The nested checkout owns these bytes.\n";
  binding.afterOpen = async () => {
    await rename(folder, original);
    await h.f.ports.exec("git", ["worktree", "add", "--detach", folder], { cwd: h.f.root });
    await writeFile(file, replacement, { mode: 0o444 });
  };
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "refused", refusal: {
    condition: expect.stringContaining("another checkout"), remedy: { text: expect.stringContaining("checkout that holds") },
  } });
  expect(await readFile(file, "utf8")).toBe(replacement);
  expect((await stat(file)).mode & 0o200).toBe(0);
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  expect(disk).toMatchObject({ kind: "index" });
  if (disk.kind !== "index") throw new Error("Missing archive index");
  expect(disk.index.entries[h.path]).not.toHaveProperty("opened");
  binding.afterOpen = null;
  await chmod(file, 0o644);
  await h.f.ports.exec("git", ["worktree", "remove", "--force", folder], { cwd: h.f.root });
  await rename(original, folder);
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
});

it("keeps an editor's replacement read-only until a new opening inspects it", async () => {
  const h = await archived(), file = join(h.f.root, h.path), bytes = await readFile(file);
  binding.afterOpen = async () => {
    await rename(file, `${file}.bak`);
    await writeFile(file, bytes, { mode: 0o444 });
  };
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "refused", refusal: {
    condition: expect.stringContaining("changed while it was being checked"), remedy: { text: expect.stringContaining("retry") },
  } });
  expect((await stat(file)).mode & 0o200).toBe(0);
  binding.afterOpen = null;
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
  expect((await stat(file)).mode & 0o200).toBe(0o200);
});

it("reports how to retry when the file disappears after the opening is recorded", async () => {
  const h = await archived(), file = join(h.f.root, h.path);
  const bytes = await readFile(file);
  binding.afterOpen = async () => { await rm(file); };
  const refused = await edit(h.f.store, h.f.root, h.path);
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "edit-refused",
    condition: expect.stringContaining(h.path), remedy: { text: expect.stringContaining("retry arc edit") } } });
  expect(await readProjectionIndex(h.projected.location, true, { groups: "all" }))
    .toMatchObject({ kind: "index", index: { entries: { [h.path]: { opened: true } } } });
  binding.afterOpen = null;
  await writeFile(file, bytes, { mode: 0o444 });
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
  expect((await stat(file)).mode & 0o200).toBe(0o200);
});

it.each(["outside", "missing-new", "side-file", "symlink", "missing-stored"] as const)(
  "refuses a %s path with a remedy and opens once the path is repaired", async kind => {
    const h = await archived();
    const valid = h.path;
    const path = kind === "outside" ? "README.md"
      : kind === "missing-new" ? `${h.folder}/new.txt`
      : kind === "side-file" ? `${h.folder}/.DS_Store`
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

it("names the adoption remedy for invalid archive locations and opens files after relocation", async () => {
  const h = await archived(), archivedRecord = await archiveCohort(h.f);
  const cohortFolder = dirname(completedCohortPath(archivedRecord)).replaceAll("\\", "/");
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
    expect(refused).toMatchObject({ status: "refused", refusal: { code: "projection-skipped", condition: expect.stringContaining("held"),
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
    remedy: { text: "Edit an in-flight file in place; arc edit opens only files under .arc/completed/." },
  } });
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
});

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

it("refuses an alternate spelling before it can open an existing archive file as a new record", async () => {
  const h = await archived(), path = `${h.folder}/notes-alpha.md`, alias = `${h.folder}/Notes-alpha.md`;
  const file = join(h.f.root, path);
  await seed(h.f, recordReferences["work-item/notes"](h.primary.reference.owner), "# Notes\n\nArchive notes.\n");
  expect((await projectionCommand({ checkout: h.f.root, store: h.f.store }, ["status"])).result).toMatchObject({ kind: "ready" });
  const insensitive = await lstat(join(h.f.root, alias)).then(() => true, () => false);
  const result = await edit(h.f.store, h.f.root, alias);
  expect(result).toMatchObject({ status: "refused", refusal: {
    condition: expect.stringContaining(insensitive ? "on-disk spelling" : "No file exists"),
    remedy: { text: expect.stringContaining(insensitive ? "exact on-disk path" : "Create the file in its archived owner's folder") },
  } });
  expect((await stat(file)).mode & 0o200).toBe(0);
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing archive index");
  expect(disk.index.entries[alias]).toBeUndefined();
  expect(disk.index.entries[path]).not.toHaveProperty("opened");
  expect(await edit(h.f.store, h.f.root, path)).toMatchObject({ status: "ok" });
});

it("holds a case-only rename when the indexed name still denotes the same file", async () => {
  const h = await archived(), path = `${h.folder}/notes-alpha.md`, alias = `${h.folder}/Notes-alpha.md`;
  const file = join(h.f.root, path), renamed = join(h.f.root, alias), intermediate = `${file}.rename`;
  await seed(h.f, recordReferences["work-item/notes"](h.primary.reference.owner), "# Notes\n\nArchive notes.\n");
  expect((await projectionCommand({ checkout: h.f.root, store: h.f.store }, ["status"])).result).toMatchObject({ kind: "ready" });
  const insensitive = await lstat(renamed).then(() => true, () => false);
  await rename(file, intermediate);
  await rename(intermediate, renamed);
  if (!insensitive) await writeFile(file, "# Notes\n\nAn independently addressable file.\n");
  const result = await edit(h.f.store, h.f.root, alias);
  if (insensitive) expect(result).toMatchObject({ status: "refused", refusal: {
    condition: expect.stringContaining(path), remedy: { text: expect.stringContaining("recorded spelling") },
  } });
  else expect(result).toMatchObject({ status: "ok", result: { path: alias } });
  // The recorded spelling, too, names the rename's repair rather than the on-disk spelling the alias refusal holds.
  if (insensitive) expect(await edit(h.f.store, h.f.root, path)).toMatchObject({ status: "refused", refusal: {
    condition: expect.stringContaining("case-only rename"), remedy: { text: `Restore the recorded spelling ${path}, then retry arc edit.` },
  } });
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing archive index");
  expect(disk.index.entries[path]).not.toHaveProperty("opened");
  if (insensitive) expect(disk.index.entries[alias]).toBeUndefined();
  else expect(disk.index.entries[alias]).toMatchObject({ kind: "ownerless", opened: true });
  if (!insensitive) return;
  await rename(renamed, intermediate);
  await rename(intermediate, file);
  expect(await edit(h.f.store, h.f.root, path)).toMatchObject({ status: "ok", result: { path } });
});

it("returns an edit refusal when the new archive file disappears during adoption inspection", async () => {
  const h = await archived(), path = `${h.folder}/interrupted.txt`, file = join(h.f.root, path);
  await writeFile(file, "An archive correction.\n");
  binding.removeOnRead = file;
  expect(await edit(h.f.store, h.f.root, path)).toMatchObject({ status: "refused", refusal: {
    code: "edit-refused", condition: expect.stringContaining("changed while it was being checked"),
  } });
  expect(binding.removeOnRead).toBeNull();
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing archive index");
  expect(disk.index.entries[path]).toBeUndefined();
  await writeFile(file, "An archive correction.\n");
  expect(await edit(h.f.store, h.f.root, path)).toMatchObject({ status: "ok" });
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

it("answers a missing in-flight path with an in-place edit, never the archive's create-then-open remedy", async () => {
  const h = await archived(), path = ".arc/active/current/notes-missing.md";
  expect(await edit(h.f.store, h.f.root, path)).toMatchObject({ status: "refused", refusal: {
    code: "edit-refused", condition: `No file exists at ${path}.`,
    remedy: { text: "Edit an in-flight file in place; arc edit opens only files under .arc/completed/." },
  } });
});

it.each(["absolute", "relative"] as const)("opens a %s operand spelled through a link to the checkout", async form => {
  const h = await archived(), alias = `${h.f.root}-alias`;
  await symlink(h.f.root, alias, "junction");
  try {
    const operand = form === "absolute" ? join(alias, h.path) : h.path;
    expect(await edit(h.f.store, alias, operand)).toMatchObject({ status: "ok", result: { path: h.path } });
  } finally { await rm(alias); }
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing archive index");
  expect(disk.index.entries[h.path]).toMatchObject({ opened: true });
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

it.each(["folder", "root"] as const)("refuses a %s operand as naming no one file and opens a file inside it", async kind => {
  const h = await archived();
  const refused = await edit(h.f.store, h.f.root, kind === "folder" ? h.folder : ".");
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "edit-refused",
    condition: expect.stringContaining("is a folder; arc edit opens one file"),
    remedy: { text: `Run arc edit on one file inside ${kind === "folder" ? h.folder : ".arc/completed/"}.` } } });
  expect((await lstat(join(h.f.root, h.folder))).isDirectory()).toBe(true);
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
});

it.each(["saving", "misspelled"] as const)("answers a %s path outside the archive with an in-place edit, never a retry", async kind => {
  const h = await archived(), path = ".arc/active/current/notes-local.md", file = join(h.f.root, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, kind === "saving" ? "" : "In-flight prose.\n");
  const operand = kind === "saving" ? path : ".arc/active/current/Notes-local.md";
  expect(await edit(h.f.store, h.f.root, operand)).toMatchObject({ status: "refused", refusal: { code: "edit-refused",
    remedy: { text: "Edit an in-flight file in place; arc edit opens only files under .arc/completed/." } } });
});

it.each(["stored", "new"] as const)("answers another person's rights before a missing %s file's remedy, then opens under the owner", async kind => {
  const h = await archived("beth"), path = kind === "stored" ? h.path : `${h.folder}/correction.txt`;
  const file = join(h.f.root, path), bytes = kind === "stored" ? await readFile(file) : Buffer.from("A correction.\n");
  if (kind === "stored") await rm(file);
  expect(await edit(h.f.store, h.f.root, path)).toMatchObject({ status: "refused", refusal: {
    code: "edit-refused", condition: expect.stringContaining("beth"), remedy: { text: expect.stringContaining("beth") },
  } });
  await createExecaGitExec()("git", ["config", "arc.identity", "beth"], { cwd: h.f.root });
  expect(await edit(h.f.store, h.f.root, path)).toMatchObject({ status: "refused", refusal: {
    condition: `No file exists at ${path}.`, remedy: { text: expect.stringContaining(kind === "stored" ? "arc sync" : "Create the file") },
  } });
  if (kind === "stored") await projectionCommand({ store: h.f.store, checkout: h.f.root }, ["sync"]);
  else await writeFile(file, bytes);
  expect(await edit(h.f.store, h.f.root, path)).toMatchObject({ status: "ok", result: { path } });
});

it("refuses an archive path its ignore guard does not authorize and opens once the rule is restored", async () => {
  const h = await archived(), exclude = join(h.f.root, ".git/info/exclude"), rules = await readFile(exclude, "utf8");
  await writeFile(exclude, rules.replace(".arc/completed/\n", ""));
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "refused", refusal: { code: "edit-refused",
    condition: `The projection ignore guard does not permit changing ${h.path}.`,
    remedy: { text: "Repair the reported projection ignore rules and retry arc edit." } } });
  await writeFile(exclude, rules);
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
});

it("refuses an archive file still being saved and opens once the save settles", async () => {
  const h = await archived(), file = join(h.f.root, h.path), bytes = await readFile(file);
  await chmod(file, 0o644);
  await writeFile(file, "");
  // A modification time ahead of the clock keeps the emptied file inside the save window however slowly the command runs.
  const saving = new Date(Date.now() + 60_000);
  await utimes(file, saving, saving);
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "refused", refusal: { code: "edit-refused",
    condition: expect.stringContaining("is still being saved"), remedy: { text: "Let the editor finish saving, then retry arc edit." } } });
  await writeFile(file, bytes);
  const settled = new Date(Date.now() - 60_000);
  await utimes(file, settled, settled);
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
});

it("refuses an index made unusable after start and opens on the retry its start rebuilds", async () => {
  const h = await archived();
  expect(await edit(h.f.store, h.f.root, h.path, program => { program.hook("preAction", async () => {
    await writeFile(join(h.projected.location.stateDir, "index"), "not an index");
  }); })).toMatchObject({ status: "refused", refusal: { code: "projection-refused",
    condition: expect.stringContaining("Projection index is"),
    remedy: { text: "Retry arc edit; the next command start rebuilds an unusable index." } } });
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
});

it.each(["EPERM", "EIO"] as const)("keeps the opened intent when making the file writable fails with %s, then opens on retry", async code => {
  const h = await archived(), file = join(h.f.root, h.path);
  binding.chmodError = code;
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "refused", refusal: { code: "edit-refused",
    condition: expect.stringContaining(code), remedy: { text: expect.stringContaining(code === "EPERM"
      ? "Repair access to the file" : "its opened intent is retained") } } });
  expect(binding.chmodError).toBeNull();
  expect((await stat(file)).mode & 0o200).toBe(0);
  expect(await readProjectionIndex(h.projected.location, true, { groups: "all" }))
    .toMatchObject({ kind: "index", index: { entries: { [h.path]: { opened: true } } } });
  expect(await edit(h.f.store, h.f.root, h.path)).toMatchObject({ status: "ok" });
  expect((await stat(file)).mode & 0o200).toBe(0o200);
});
