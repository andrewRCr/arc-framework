/** The projection's one configuration read over real repositories, global configuration isolated. */
import { execFile } from "node:child_process";
import { appendFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempRepoCore, removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import type { GitExec } from "../../../../src/lib/git/exec.js";
import { slugifyIdentity } from "../../../../src/lib/git/identity.js";
import { createExecaGitExec } from "../../../../src/lib/git/process-executor.js";
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
  environment = { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: "1" };
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
  it("returns identity, the in-flight view keys, and the object format in one Git call", async () => {
    const cwd = await repository("sha256");
    await git(cwd, "config", "arc.identity", "andrew");
    await git(cwd, "config", "arc.inflightView", "cohort");
    await git(cwd, "config", "--add", "arc.inflightPin", "alpha");
    await git(cwd, "config", "--add", "arc.inflightPin", "beta");
    const { exec, calls } = counting();
    expect(await readProjectionConfiguration(exec, cwd)).toEqual({
      objectFormat: "sha256",
      identity: { status: "identified", identity: "andrew" },
      view: { setting: "cohort", pins: ["alpha", "beta"] },
    });
    expect(calls).toEqual([["config", "--null", "--get-regexp", "^(arc\\.|user\\.name$|extensions\\.objectformat$)"]]);
  });

  it("takes user.name slugified, by the identity owner's rule, where no arc.identity is set", async () => {
    const cwd = await repository();
    await git(cwd, "config", "user.name", "Ada Q. Lovelace");
    expect((await readProjectionConfiguration(counting().exec, cwd)).identity)
      .toEqual({ status: "identified", identity: slugifyIdentity("Ada Q. Lovelace") });
    expect(slugifyIdentity("Ada Q. Lovelace")).toBe("ada-q-lovelace");
  });

  it("returns the no-identity verdict naming the remedy for an invalid arc.identity", async () => {
    const cwd = await repository();
    await git(cwd, "config", "arc.identity", "Not A Slug");
    expect((await readProjectionConfiguration(counting().exec, cwd)).identity).toEqual({
      status: "no-identity", cause: "invalid",
      remedy: { text: expect.stringContaining("git config --local arc.identity <identity>") },
    });
  });

  it("reads a repository with no matching key as SHA-1, with no identity and the default view", async () => {
    const cwd = await repository();
    await git(cwd, "config", "--unset", "user.name");
    expect(await readProjectionConfiguration(counting().exec, cwd)).toEqual({
      objectFormat: "sha1",
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
    expect((await readProjectionConfiguration(counting().exec, cwd)).identity)
      .toEqual({ status: "identified", identity: "andrew" });
  });

  it("takes the local values over the global ones, as git config --get returns them", async () => {
    const cwd = await repository();
    await writeFile(globalConfig, "[user]\n\tname = Global Person\n[arc]\n\tidentity = global-person\n");
    await git(cwd, "config", "user.name", "Local Person");
    await git(cwd, "config", "arc.identity", "local-person");
    const get = async (key: string): Promise<string> =>
      (await run("git", ["config", "--get", key], { cwd, env: environment })).stdout.trim();
    expect((await readProjectionConfiguration(counting().exec, cwd)).identity)
      .toEqual({ status: "identified", identity: await get("arc.identity") });
    await git(cwd, "config", "--unset", "arc.identity");
    await writeFile(globalConfig, "[user]\n\tname = Global Person\n");
    expect((await readProjectionConfiguration(counting().exec, cwd)).identity)
      .toEqual({ status: "identified", identity: slugifyIdentity(await get("user.name")) });
    expect(await get("user.name")).toBe("Local Person");
  });
});
