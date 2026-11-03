/** Unreadable npm proof fails through the typed guard boundary and leaves recovery work available after repair. */
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createTempRepoCore, removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { prepareSwap, SWAP_WRITER } from "../../../helpers/store/projection/swap-fixture.js";
import { createExecaGitExec, createExecaGitExecInput } from "../../../../src/lib/git/process-executor.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { PERSONAL_NPM_IGNORE, PERSONAL_NPM_IGNORE_CONTENT } from "../../../../src/lib/personal-npm-ignore.js";
import { readProjectionConfiguration } from "../../../../src/lib/store/projection/configuration.js";
import { checkIgnores, type IgnoreCheck } from "../../../../src/lib/store/projection/ignore-check.js";
import { guardProjectionIgnores } from "../../../../src/lib/store/projection/ignore-guard.js";
import { PROJECTION_INDEX_FILE, readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { sweepAsideFolder } from "../../../../src/lib/store/projection/sweep.js";

const access = vi.hoisted(() => ({ policy: "", denied: false, revokeAfterRead: false }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const readFile = (async (...args: Parameters<typeof actual.readFile>) => {
    if (args[0] === access.policy && access.denied) {
      throw Object.assign(new Error(`EACCES: permission denied, open '${access.policy}'`), {
        code: "EACCES", path: access.policy, syscall: "open",
      });
    }
    const bytes = await actual.readFile(...args);
    if (args[0] === access.policy && args[1] === "utf8" && access.revokeAfterRead) access.denied = true;
    return bytes;
  }) as typeof actual.readFile;
  return { ...actual, readFile, default: { ...actual, readFile } };
});

const directories: string[] = [];
function resetMockDefaults(): void {
  vi.resetAllMocks();
  access.policy = "";
  access.denied = false;
  access.revokeAfterRead = false;
}
beforeEach(resetMockDefaults);
afterEach(async () => {
  resetMockDefaults();
  await removeGitBackedDirs(directories.splice(0));
});

async function fixture(root?: string) {
  const cwd = root ?? await createTempRepoCore({ prefix: "arc-ignore-read-failure-" });
  directories.push(cwd);
  const globalConfig = join(cwd, "isolated-config");
  await writeFile(globalConfig, "");
  const env = { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: "1" };
  const git = createExecaGitExec(undefined, env);
  await git("git", ["config", "core.excludesFile", ""], { cwd });
  await git("git", ["config", "core.ignoreCase", "false"], { cwd });
  await writeFile(join(cwd, ".git/info/exclude"), ".arc/active/\n.arc/backlog/\n.arc/completed/\n.arc/system/.local/\n");
  await writeFile(join(cwd, ".gitignore"), ".arc/user/*/\n");
  await mkdir(join(cwd, ".arc/user"), { recursive: true });
  const policy = join(cwd, PERSONAL_NPM_IGNORE);
  await writeFile(policy, PERSONAL_NPM_IGNORE_CONTENT);
  const guard = { root: cwd, identity: SlugSchema.parse("andrew"), exec: createExecaGitExecInput(undefined, undefined, env),
    fs: { lstat, realpath, readFile: (path: string) => readFile(path, "utf8") } };
  const selection = async () => (await readProjectionConfiguration(git, cwd, env)).ignoreRules;
  const check = async (last: IgnoreCheck | null = null) => checkIgnores({
    guard, ignoreRules: await selection(), readIgnoreRules: selection, format: "sha1", reference: null,
    records: last?.kind === "passed" ? last.records : null,
    recordedGuard: last?.kind === "passed" ? last.basis : null,
  });
  access.policy = policy;
  return { cwd, guard, check, selection };
}

function expectReadRefusal(result: IgnoreCheck | Awaited<ReturnType<typeof guardProjectionIgnores>>): void {
  expect(result).toMatchObject({ kind: "refused", reason: "guard-failed", failure: expect.stringContaining("EACCES"),
    remedy: expect.stringContaining(PERSONAL_NPM_IGNORE) });
  if (result.kind !== "refused") throw new Error("expected refusal");
  expect(result.remedy).toMatch(/read/iu);
  expect(result.remedy).toMatch(/retry/iu);
}

it("returns a read-access repair from the standalone guard and permits retry", async () => {
  const h = await fixture();
  access.denied = true;
  expectReadRefusal(await guardProjectionIgnores(h.guard));
  access.denied = false;
  expect(await guardProjectionIgnores(h.guard)).toMatchObject({ kind: "passed" });
});

it.each(["fresh", "cached", "after-guard"])("refuses an unreadable policy during %s observation and permits repaired retry", async (phase) => {
  const h = await fixture();
  const first = phase === "cached" ? await h.check() : null;
  if (first !== null) expect(first.kind).toBe("passed");
  access.denied = phase !== "after-guard";
  access.revokeAfterRead = phase === "after-guard";
  expectReadRefusal(await h.check(first));
  access.denied = false;
  access.revokeAfterRead = false;
  expect(await h.check(first)).toMatchObject({ kind: phase === "cached" ? "unchanged" : "passed" });
});

it("keeps pending copies and index bytes intact through unreadable-policy refusal, then recovers after repair", async () => {
  const prepared = await prepareSwap();
  const h = await fixture(prepared.seeded.checkout);
  class Stop extends Error {}
  await expect(prepared.swap({ hooks: { afterMove: async () => { throw new Stop(); } } })).rejects.toBeInstanceOf(Stop);
  const read = await readProjectionIndex(prepared.seeded.location, true);
  if (read.kind !== "index") throw new Error("expected the stopped index");
  const entry = read.index.entries[prepared.path];
  if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("expected a pending copy");
  const copy = join(h.cwd, entry.copies[0].name);
  const savedCopy = await readFile(copy);
  const indexPath = join(prepared.seeded.location.stateDir, PROJECTION_INDEX_FILE);
  const savedIndex = await readFile(indexPath);
  const sweep = async () => sweepAsideFolder({
    checkout: h.cwd, location: prepared.seeded.location, index: read.index, guard: h.guard,
    ignoreRules: await h.selection(), readIgnoreRules: h.selection, format: "sha1",
    writer: { ...SWAP_WRITER, processInstance: "after-read-repair" },
    takeIn: async () => { throw new Error("unchanged copy must not be taken in"); },
  });
  access.denied = true;
  const refused = await sweep();
  expectReadRefusal(refused.ignores);
  expect(refused.index).toBe(read.index);
  expect(refused.swept).toEqual([]);
  expect(await readFile(indexPath)).toEqual(savedIndex);
  expect(await readFile(copy)).toEqual(savedCopy);
  access.denied = false;
  const repaired = await sweep();
  expect(repaired.ignores.kind).toBe("passed");
  expect(repaired.swept.map(({ outcome }) => outcome.kind)).toEqual(["linked-back"]);
  expect(await readFile(prepared.file)).toEqual(savedCopy);
});
