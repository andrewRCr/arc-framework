/** Excludes paths retain the filesystem traversal Git performs through a symlink followed by a parent component. */
import { lstat, mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { createExecaGitExec, createExecaGitExecInput } from "../../../../src/lib/git/process-executor.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { readProjectionConfiguration } from "../../../../src/lib/store/projection/configuration.js";
import { checkIgnores } from "../../../../src/lib/store/projection/ignore-check.js";
import { guardProjectionIgnores } from "../../../../src/lib/store/projection/ignore-guard.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });
const RULE = ".arc/completed/\n";

async function fixture(mode: "tilde" | "home-default" | "xdg-default" | "absolute") {
  const base = await mkdtemp(join(tmpdir(), "arc-ignore-spelling-"));
  directories.push(base);
  const root = join(base, "repo"), home = join(base, "home"), globalConfigPath = join(base, "global");
  await mkdir(root);
  await mkdir(join(home, "actual", "nested"), { recursive: true });
  await symlink(join(home, "actual", "nested"), join(home, "link"), process.platform === "win32" ? "junction" : "dir");
  await writeFile(globalConfigPath, "");
  const environment: NodeJS.ProcessEnv = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(base, "xdg"),
    GIT_CONFIG_GLOBAL: globalConfigPath, GIT_CONFIG_NOSYSTEM: "1" };
  let source = `${home}/link/../ignore`, normalized = join(home, "ignore");
  if (mode === "home-default") {
    environment.HOME = `${home}/link/..`;
    delete environment.XDG_CONFIG_HOME;
    source = `${environment.HOME}/.config/git/ignore`;
    normalized = join(home, ".config", "git", "ignore");
  }
  if (mode === "xdg-default") {
    environment.XDG_CONFIG_HOME = `${home}/link/..`;
    source = `${environment.XDG_CONFIG_HOME}/git/ignore`;
    normalized = join(home, "git", "ignore");
  }
  await mkdir(dirname(source), { recursive: true });
  await mkdir(dirname(normalized), { recursive: true });
  await writeFile(normalized, RULE);
  await writeFile(source, "");
  const git = createExecaGitExec(undefined, environment);
  await git("git", ["init", "-q"], { cwd: root });
  await writeFile(join(root, ".gitignore"), ".arc/user/*/\n");
  await writeFile(join(root, ".git/info/exclude"), ".arc/active/\n.arc/backlog/\n.arc/system/.local/\n");
  if (mode === "tilde" || mode === "absolute") {
    await git("git", ["config", "core.excludesFile", mode === "tilde" ? "~/link/../ignore" : source], { cwd: root });
  }
  const guard = { root, identity: SlugSchema.parse("andrew"), exec: createExecaGitExecInput(undefined, undefined, environment),
    fs: { lstat, realpath, readFile: (path: string) => readFile(path, "utf8") } };
  const selection = async () => (await readProjectionConfiguration(git, root, environment)).ignoreRules;
  const check = async (records: Parameters<typeof checkIgnores>[0]["records"] = null, recordedGuard: Parameters<typeof checkIgnores>[0]["recordedGuard"] = null) =>
    checkIgnores({ guard, records, recordedGuard, ignoreRules: await selection(), readIgnoreRules: selection,
      reference: 9_000_000_000_000_000_000n, format: "sha1" });
  return { root, source, guard, selection, check };
}

it.each(["tilde", "home-default", "xdg-default"] as const)("preserves %s traversal and agrees with live Git, then permits repair", async (mode) => {
  const h = await fixture(mode);
  expect(await h.selection()).toMatchObject({ kind: "path", path: h.source, values: mode === "tilde" ? ["~/link/../ignore"] : [] });
  const live = await guardProjectionIgnores(h.guard);
  expect(await h.check()).toMatchObject({ kind: live.kind });
  await writeFile(h.source, RULE);
  expect(await guardProjectionIgnores(h.guard)).toMatchObject({ kind: "passed" });
  expect(await h.check()).toMatchObject({ kind: "passed" });
});

it("invalidates a cached pass when the actual matched source behind symlink/.. changes, then permits repair", async () => {
  const h = await fixture("absolute");
  await writeFile(h.source, RULE);
  const first = await h.check();
  if (first.kind !== "passed") throw new Error("expected an initial pass");
  await writeFile(h.source, "");
  expect(await guardProjectionIgnores(h.guard)).toMatchObject({ kind: "refused", reason: "not-ignored" });
  expect(await h.check(first.records, first.basis)).toMatchObject({ kind: "refused", reason: "not-ignored" });
  await writeFile(h.source, RULE);
  expect(await h.check()).toMatchObject({ kind: "passed" });
});
