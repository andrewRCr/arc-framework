/** Cache authorization stays bound to the guarded roots and native Git matching semantics. */
import { appendFile, lstat, mkdir, readFile, realpath, rename, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createTempRepoCore, removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { createExecaGitExec, createExecaGitExecInput } from "../../../../src/lib/git/process-executor.js";
import type { GitExecInput } from "../../../../src/lib/git/exec.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { readProjectionConfiguration } from "../../../../src/lib/store/projection/configuration.js";
import { checkIgnores, type IgnoreCheck } from "../../../../src/lib/store/projection/ignore-check.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

async function fixture(pattern = ".arc/user/*/\n") {
  const cwd = await createTempRepoCore({ prefix: "arc-ignore-basis-" });
  directories.push(cwd);
  const globalConfig = join(cwd, "isolated-config");
  await writeFile(globalConfig, "");
  const environment = { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: "1" };
  const git = createExecaGitExec(undefined, environment);
  const native = createExecaGitExecInput(undefined, undefined, environment);
  await git("git", ["config", "core.excludesFile", ""], { cwd });
  await git("git", ["config", "core.ignoreCase", "true"], { cwd });
  await mkdir(join(cwd, ".git/info"), { recursive: true });
  await writeFile(join(cwd, ".git/info/exclude"), ".arc/active/\n.arc/backlog/\n.arc/completed/\n.arc/system/.local/\n");
  await writeFile(join(cwd, ".gitignore"), pattern);
  let configurationReads = 0;
  const selection = async () => {
    configurationReads++;
    return (await readProjectionConfiguration(git, cwd, environment)).ignoreRules;
  };
  let calls = 0;
  const counted: GitExecInput = async (...args) => { calls++; return native(...args); };
  const guard = { root: cwd, identity: SlugSchema.parse("andrew"), exec: counted,
    fs: { lstat, realpath, readFile: (path: string) => readFile(path, "utf8") } };
  const check = async (last: IgnoreCheck | null = null, overrides: Partial<typeof guard> = {}) => checkIgnores({
    guard: { ...guard, ...overrides }, records: last?.kind === "passed" ? last.records : null,
    recordedGuard: last?.kind === "passed" ? last.basis : null,
    ignoreRules: await selection(), readIgnoreRules: selection, reference: 9_000_000_000_000_000_000n, format: "sha1",
  });
  return { cwd, git, native, guard, check, selection, calls: () => calls, configurationReads: () => configurationReads };
}

it("refuses a new personal root and cannot confuse a later pass with the old projected identity", async () => {
  const h = await fixture(".arc/user/andrew/\n");
  const first = await h.check();
  expect(first.kind).toBe("passed");
  const alice = { identity: SlugSchema.parse("alice") };
  expect(await h.check(first, alice)).toMatchObject({ kind: "refused", reason: "not-ignored" });
  await writeFile(join(h.cwd, ".gitignore"), ".arc/user/alice/\n");
  const repaired = await h.check(null, alice);
  expect(repaired.kind).toBe("passed");
  expect(await h.check(repaired)).toMatchObject({ kind: "refused", reason: "not-ignored" });
});

it("invalidates a case-policy-only change, while an unchanged cached pass adds no guard or confirmation call", async () => {
  const h = await fixture(".ARC/USER/*/\n");
  const first = await h.check();
  expect(first.kind).toBe("passed");
  const calls = h.calls();
  const configurationReads = h.configurationReads();
  expect(await h.check(first)).toEqual({ kind: "unchanged" });
  expect(h.calls()).toBe(calls);
  expect(h.configurationReads()).toBe(configurationReads + 1);
  await h.git("git", ["config", "core.ignoreCase", "false"], { cwd: h.cwd });
  expect(await h.check(first)).toMatchObject({ kind: "refused", reason: "not-ignored" });
  await h.git("git", ["config", "core.ignoreCase", "true"], { cwd: h.cwd });
  expect((await h.check()).kind).toBe("passed");
});

it("pins the captured case setting instead of accepting a different live setting, then permits retry", async () => {
  const h = await fixture(".ARC/USER/*/\n");
  await h.git("git", ["config", "core.ignoreCase", "false"], { cwd: h.cwd });
  const captured = await h.selection();
  await h.git("git", ["config", "core.ignoreCase", "true"], { cwd: h.cwd });
  const result = await checkIgnores({ guard: h.guard, records: null, recordedGuard: null,
    ignoreRules: captured, readIgnoreRules: h.selection, reference: null, format: "sha1" });
  expect(result.kind).toBe("refused");
  expect((await h.check()).kind).toBe("passed");
});

it("refuses a case setting changed during a fresh guard and succeeds after repair", async () => {
  const h = await fixture(".ARC/USER/*/\n");
  let changed = false;
  const exec: GitExecInput = async (...args) => {
    const result = await h.native(...args);
    if (!changed) {
      changed = true;
      await h.git("git", ["config", "core.ignoreCase", "false"], { cwd: h.cwd });
    }
    return result;
  };
  expect(await h.check(null, { exec })).toMatchObject({ kind: "refused", reason: "guard-failed" });
  await h.git("git", ["config", "core.ignoreCase", "true"], { cwd: h.cwd });
  expect((await h.check()).kind).toBe("passed");
});

it("rejects an earlier Git-invalid case value despite a later valid value and permits repair", async () => {
  const h = await fixture();
  const first = await h.check();
  expect(first.kind).toBe("passed");
  const config = join(h.cwd, ".git/config");
  const original = await readFile(config);
  await appendFile(config, "\n[core]\n\tignoreCase = invalid-boolean\n\tignoreCase = true\n");
  expect(await h.check(first)).toMatchObject({ kind: "refused", reason: "guard-failed" });
  await writeFile(config, original);
  expect((await h.check()).kind).toBe("passed");
});

it("retains a valueless true occurrence in a fresh passing basis", async () => {
  const h = await fixture(".ARC/USER/*/\n");
  const first = await h.check();
  expect(first.kind).toBe("passed");
  await appendFile(join(h.cwd, ".git/config"), "\n[core]\n\tignoreCase\n");
  expect((await h.check(first)).kind).toBe("passed");
});

it.each([null, 9_000_000_000_000_000_000n])("invalidates a same-inode .gitignore symlink replacement at reference %s", async (reference) => {
  const h = await fixture();
  const first = await h.check();
  if (first.kind !== "passed") throw new Error("expected initial pass");
  const original = join(h.cwd, "saved-ignore");
  const gitignore = join(h.cwd, ".gitignore");
  await rename(gitignore, original);
  await symlink(original, gitignore);
  const checked = await checkIgnores({ guard: h.guard, records: first.records, recordedGuard: first.basis,
    ignoreRules: await h.selection(), readIgnoreRules: h.selection, reference, format: "sha1" });
  expect(checked).toMatchObject({ kind: "refused", reason: "not-ignored" });
  await rename(gitignore, join(dirname(gitignore), "saved-link"));
  await rename(original, gitignore);
  expect((await h.check()).kind).toBe("passed");
});

it("cannot authorize a linked .gitignore through a relative excludes selection naming that same path", async () => {
  const h = await fixture();
  await h.git("git", ["config", "core.excludesFile", ".gitignore"], { cwd: h.cwd });
  const first = await h.check();
  expect(first.kind).toBe("passed");
  const gitignore = join(h.cwd, ".gitignore");
  const original = join(h.cwd, "saved-ignore");
  await rename(gitignore, original);
  await symlink(original, gitignore);
  expect(await h.check(first)).toMatchObject({ kind: "refused", reason: "not-ignored" });
  await rename(gitignore, join(h.cwd, "saved-link"));
  await rename(original, gitignore);
  expect((await h.check()).kind).toBe("passed");
});
