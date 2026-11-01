/** The projection's one configuration read over real repositories, global configuration isolated. */
import { execFile } from "node:child_process";
import { appendFile, lstat, mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempRepoCore, removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import type { GitExec } from "../../../../src/lib/git/exec.js";
import { slugifyIdentity } from "../../../../src/lib/git/identity.js";
import { createExecaGitExec, createExecaGitExecInput } from "../../../../src/lib/git/process-executor.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { guardProjectionIgnores } from "../../../../src/lib/store/projection/ignore-guard.js";
import { checkIgnores } from "../../../../src/lib/store/projection/ignore-check.js";
import {
  parseConfigurationRecords, readProjectionConfiguration,
} from "../../../../src/lib/store/projection/configuration.js";

const run = promisify(execFile);
const directories: string[] = [];
let environment: NodeJS.ProcessEnv;
let globalConfig: string;
beforeEach(async () => {
  const home = await mkdtemp(join(tmpdir(), "arc-projection-config-home-"));
  directories.push(home);
  globalConfig = join(home, "gitconfig");
  await writeFile(globalConfig, "");
  environment = { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: "1", XDG_CONFIG_HOME: join(home, "xdg") };
});
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

async function repository(objectFormat?: "sha1" | "sha256"): Promise<string> {
  const cwd = await createTempRepoCore({ prefix: "arc-projection-config-", ...(objectFormat ? { objectFormat } : {}) });
  directories.push(cwd);
  return cwd;
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await run("git", args, { cwd, env: environment });
}

/** A Git executor under the isolated configuration, recording each call's arguments. */
function counting(): { exec: GitExec; calls: string[][] } {
  const native = createExecaGitExec(undefined, environment);
  const calls: string[][] = [];
  return { calls, exec: async (cmd, args, options) => { calls.push(args); return native(cmd, args, options); } };
}

describe("the one configuration read", () => {
  it.each(["local", "global"])("invalidates a cached pass for an earlier Git-invalid %s path and permits repair", async (scope) => {
    const cwd = await repository();
    const source = join(dirname(globalConfig), "valid-ignore");
    await writeFile(source, ".arc/completed/\n");
    await writeFile(join(cwd, ".git/info/exclude"), ".arc/active/\n.arc/backlog/\n.arc/system/.local/\n");
    await writeFile(join(cwd, ".gitignore"), ".arc/user/*/\n");
    await git(cwd, "config", "core.excludesFile", source);
    const selection = async () => (await readProjectionConfiguration(counting().exec, cwd, environment)).excludesFile;
    const guard = { root: cwd, identity: SlugSchema.parse("andrew"),
      exec: createExecaGitExecInput(undefined, undefined, environment),
      fs: { lstat, realpath, readFile: (path: string) => readFile(path, "utf8") } };
    const base = { guard, reference: 9_000_000_000_000_000_000n, format: "sha1" as const, readExcludesFile: selection };
    const first = await checkIgnores({ ...base, excludesFile: await selection(), records: null, recordedExcludesFile: null });
    if (first.kind !== "passed") throw new Error("expected an initial pass");
    const configPath = scope === "global" ? globalConfig : join(cwd, ".git/config");
    const original = await readFile(configPath);
    await git(cwd, "config", `--${scope}`, "--add", "core.excludesFile", "~arc-user-that-does-not-exist/ignore");
    if (scope === "local") await git(cwd, "config", "--add", "core.excludesFile", source);
    expect(await guardProjectionIgnores(guard)).toMatchObject({ kind: "refused", reason: "guard-failed" });
    expect(await checkIgnores({ ...base, excludesFile: await selection(), records: first.records, recordedExcludesFile: first.excludesFile }))
      .toMatchObject({ kind: "refused", reason: "guard-failed" });
    await writeFile(configPath, original);
    expect(await checkIgnores({ ...base, excludesFile: await selection(), records: null, recordedExcludesFile: null }))
      .toMatchObject({ kind: "passed" });
  });
  it("refuses a pass when an earlier excludes value changes during the guard and permits a fresh retry", async () => {
    const cwd = await repository();
    const source = join(dirname(globalConfig), "valid-ignore");
    await writeFile(source, ".arc/completed/\n");
    await writeFile(join(cwd, ".git/info/exclude"), ".arc/active/\n.arc/backlog/\n.arc/system/.local/\n");
    await writeFile(join(cwd, ".gitignore"), ".arc/user/*/\n");
    await git(cwd, "config", "core.excludesFile", source);
    const selection = async () => (await readProjectionConfiguration(counting().exec, cwd, environment)).excludesFile;
    const native = createExecaGitExecInput(undefined, undefined, environment);
    let changed = false;
    const guard = { root: cwd, identity: SlugSchema.parse("andrew"), exec: async (...args: Parameters<typeof native>) => {
      const result = await native(...args);
      if (!changed && args[0].includes("check-ignore")) {
        changed = true;
        await git(cwd, "config", "--global", "--add", "core.excludesFile", source);
      }
      return result;
    }, fs: { lstat, realpath, readFile: (path: string) => readFile(path, "utf8") } };
    const check = async () => checkIgnores({ guard, reference: null, format: "sha1", readExcludesFile: selection,
      excludesFile: await selection(), records: null, recordedExcludesFile: null });
    expect(await check()).toMatchObject({ kind: "refused", reason: "guard-failed" });
    expect(await check()).toMatchObject({ kind: "passed" });
  });
  it.each(["local", "global"])("refuses an earlier valueless %s occurrence before cache reuse and permits repair", async (scope) => {
    const cwd = await repository();
    const source = join(dirname(globalConfig), "valid-ignore");
    await writeFile(source, ".arc/completed/\n");
    await writeFile(join(cwd, ".git/info/exclude"), ".arc/active/\n.arc/backlog/\n.arc/system/.local/\n");
    await writeFile(join(cwd, ".gitignore"), ".arc/user/*/\n");
    await git(cwd, "config", "core.excludesFile", source);
    const selection = async () => (await readProjectionConfiguration(counting().exec, cwd, environment)).excludesFile;
    const base = { guard: { root: cwd, identity: SlugSchema.parse("andrew"),
      exec: createExecaGitExecInput(undefined, undefined, environment),
      fs: { lstat, realpath, readFile: (path: string) => readFile(path, "utf8") } },
      reference: 9_000_000_000_000_000_000n, format: "sha1" as const, readExcludesFile: selection };
    const first = await checkIgnores({ ...base, excludesFile: await selection(), records: null, recordedExcludesFile: null });
    if (first.kind !== "passed") throw new Error("expected an initial pass");
    if (scope === "global") await writeFile(globalConfig, "[core]\n\texcludesFile\n");
    else {
      await appendFile(join(cwd, ".git/config"), "\n[core]\n\texcludesFile\n");
      await git(cwd, "config", "--add", "core.excludesFile", source);
    }
    const invalid = await selection();
    expect(await checkIgnores({ ...base, excludesFile: invalid, records: first.records, recordedExcludesFile: first.excludesFile }))
      .toMatchObject({ kind: "refused", reason: "guard-failed" });
    expect(invalid).toMatchObject({ kind: "invalid", remedy: { text: expect.stringContaining("--show-origin") } });
    if (scope === "global") await writeFile(globalConfig, "");
    else await git(cwd, "config", "--replace-all", "core.excludesFile", source);
    expect(await checkIgnores({ ...base, excludesFile: await selection(), records: null, recordedExcludesFile: null }))
      .toMatchObject({ kind: "passed" });
  });
  it.each(["xdg", "home", "tilde"])("pins the same %s excludes file Git selects from the invocation environment", async (mode) => {
    const cwd = await repository();
    const home = join(dirname(globalConfig), "home");
    environment.HOME = home;
    if (mode !== "xdg") delete environment.XDG_CONFIG_HOME;
    const expected = mode === "xdg" ? `${environment.XDG_CONFIG_HOME}/git/ignore`
      : mode === "home" ? `${home}/.config/git/ignore` : `${home}/personal-ignore`;
    await mkdir(dirname(expected), { recursive: true });
    await writeFile(expected, ".arc/completed/\n");
    await writeFile(join(cwd, ".git/info/exclude"), ".arc/active/\n.arc/backlog/\n.arc/system/.local/\n");
    await writeFile(join(cwd, ".gitignore"), ".arc/user/*/\n");
    if (mode === "tilde") await git(cwd, "config", "core.excludesFile", "~/personal-ignore");
    const configured = await readProjectionConfiguration(counting().exec, cwd, environment);
    expect(configured.excludesFile).toEqual({ kind: "path", path: expected, values: mode === "tilde" ? ["~/personal-ignore"] : [] });
    if (configured.excludesFile.kind !== "path") throw new Error("expected a valid source");
    const guard = { root: cwd, identity: SlugSchema.parse("andrew"),
      exec: createExecaGitExecInput(undefined, undefined, environment),
      fs: { lstat, realpath, readFile: (path: string) => readFile(path, "utf8") } };
    for (const verdict of [await guardProjectionIgnores(guard),
      await guardProjectionIgnores({ ...guard, excludesFile: configured.excludesFile.path })]) {
      expect(verdict).toMatchObject({ kind: "passed" });
      if (verdict.kind !== "passed") throw new Error("expected a passing guard");
      const sources = await Promise.all(verdict.ignoreFiles.map((path) => realpath(path).catch(() => null)));
      expect(sources).toContain(await realpath(expected));
    }
  });
  it("returns identity, the in-flight view keys, and the object format in one Git call", async () => {
    const cwd = await repository("sha256");
    await git(cwd, "config", "arc.identity", "andrew");
    await git(cwd, "config", "arc.inflightView", "cohort");
    await git(cwd, "config", "--add", "arc.inflightPin", "alpha");
    await git(cwd, "config", "--add", "arc.inflightPin", "beta");
    await git(cwd, "config", "core.excludesFile", "/tmp/projection-excludes");
    const { exec, calls } = counting();
    expect(await readProjectionConfiguration(exec, cwd, environment)).toEqual({
      objectFormat: "sha256",
      excludesFile: { kind: "path", path: "/tmp/projection-excludes", values: ["/tmp/projection-excludes"] },
      identity: { status: "identified", identity: "andrew" },
      view: { setting: "cohort", pins: ["alpha", "beta"] },
    });
    expect(calls).toEqual([["config", "--null", "--get-regexp", "^(arc\\.|user\\.name$|extensions\\.objectformat$|core\\.excludesfile$)"]]);
  });

  it("takes user.name slugified, by the identity owner's rule, where no arc.identity is set", async () => {
    const cwd = await repository();
    await git(cwd, "config", "user.name", "Ada Q. Lovelace");
    expect((await readProjectionConfiguration(counting().exec, cwd, environment)).identity)
      .toEqual({ status: "identified", identity: slugifyIdentity("Ada Q. Lovelace") });
    expect(slugifyIdentity("Ada Q. Lovelace")).toBe("ada-q-lovelace");
  });

  it("returns the no-identity verdict naming the remedy for an invalid arc.identity", async () => {
    const cwd = await repository();
    await git(cwd, "config", "arc.identity", "Not A Slug");
    expect((await readProjectionConfiguration(counting().exec, cwd, environment)).identity).toEqual({
      status: "no-identity", cause: "invalid",
      remedy: { text: expect.stringContaining("git config --local arc.identity <identity>") },
    });
  });

  it("reads a repository with no matching key as SHA-1, with no identity and the default view", async () => {
    const cwd = await repository();
    await git(cwd, "config", "--unset", "user.name");
    expect(await readProjectionConfiguration(counting().exec, cwd, environment)).toEqual({
      objectFormat: "sha1",
      excludesFile: { kind: "path", path: `${environment.XDG_CONFIG_HOME}/git/ignore`, values: [] },
      identity: { status: "no-identity", cause: "unset", remedy: { text: expect.stringContaining("arc.identity") } },
      view: { setting: null, pins: [] },
    });
  });

  it("parses a key set with no value as that key with no value, and the record after it intact", async () => {
    const cwd = await repository();
    await appendFile(join(cwd, ".git", "config"), "[arc]\n\tflag\n\tidentity = andrew\n");
    const { stdout } = await run("git", ["config", "--null", "--get-regexp", "^arc\\."], { cwd, env: environment });
    const records = parseConfigurationRecords(stdout);
    expect(records.get("arc.flag")).toEqual([null]);
    expect(records.get("arc.identity")).toEqual(["andrew"]);
    expect((await readProjectionConfiguration(counting().exec, cwd, environment)).identity)
      .toEqual({ status: "identified", identity: "andrew" });
  });

  it("takes the local values over the global ones, as git config --get returns them", async () => {
    const cwd = await repository();
    await writeFile(globalConfig, "[user]\n\tname = Global Person\n[arc]\n\tidentity = global-person\n");
    await git(cwd, "config", "user.name", "Local Person");
    await git(cwd, "config", "arc.identity", "local-person");
    const get = async (key: string): Promise<string> =>
      (await run("git", ["config", "--get", key], { cwd, env: environment })).stdout.trim();
    expect((await readProjectionConfiguration(counting().exec, cwd, environment)).identity)
      .toEqual({ status: "identified", identity: await get("arc.identity") });
    await git(cwd, "config", "--unset", "arc.identity");
    await writeFile(globalConfig, "[user]\n\tname = Global Person\n");
    expect((await readProjectionConfiguration(counting().exec, cwd, environment)).identity)
      .toEqual({ status: "identified", identity: slugifyIdentity(await get("user.name")) });
    expect(await get("user.name")).toBe("Local Person");
  });
});
