/** The shipped pre-commit hook selects its cohort check only for a staged cohort record or planned meta, so a commit
 * that only deletes ARC state selects nothing and passes the hook. */
import { execa } from "execa";
import { access, chmod, cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import { environmentForGitCwd } from "../../src/lib/git/process-executor.js";
import { cleanupTempDir, commitAll, createTempRepo } from "../helpers/integration.js";

const SHIPPED = resolve(dirname(fileURLToPath(import.meta.url)), "../../arc/system/.internal");
const INSTALLED = ".arc/system/.internal";
const META = ".arc/backlog/planned/group/meta-unit.md";
const COHORT = ".arc/backlog/planned/group/cohort-group.md";
const COHORT_CHECK = "Cohort-consistency validation";
const cleanup: string[] = [];

afterEach(async () => { await Promise.all(cleanup.splice(0).map((dir) => cleanupTempDir(dir))); });

async function git(root: string, ...args: string[]) {
  return execa("git", args, { cwd: root, reject: false, env: environmentForGitCwd(root), extendEnv: false });
}

it("uses the fixture worktree and index when the caller has Git selectors", async () => {
  const fixture = await createTempRepo("arc-pre-commit-fixture-");
  cleanup.push(fixture);
  const caller = await createTempRepo("arc-pre-commit-caller-");
  cleanup.push(caller);
  const args = ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-path", "index"];
  const expected = await git(fixture, ...args);
  expect(expected.exitCode).toBe(0);

  try {
    const alternateIndex = join(caller, "alternate-index");
    vi.stubEnv("GIT_DIR", join(caller, ".git"));
    vi.stubEnv("GIT_WORK_TREE", caller);
    vi.stubEnv("GIT_INDEX_FILE", alternateIndex);
    const result = await git(fixture, ...args);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(expected.stdout);

    const { root } = await repository();
    const tracked = await git(root, "ls-tree", "-r", "--name-only", "HEAD", "--", META, COHORT);
    expect(tracked.exitCode).toBe(0);
    expect(tracked.stdout.split(/\r?\n/u)).toEqual([COHORT, META]);
    expect((await git(caller, "rev-parse", "--verify", "HEAD")).exitCode).not.toBe(0);
    await expect(access(alternateIndex)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    vi.unstubAllEnvs();
  }
});

/** A feature branch tracking a planned meta and its cohort record, with the shipped hooks installed over a CLI that
 * records each call and succeeds. */
async function repository(): Promise<{ root: string; calls: () => Promise<string[]> }> {
  const root = await createTempRepo("arc-pre-commit-deletion-");
  cleanup.push(root);
  for (const folder of ["githooks", "scripts"]) {
    await cp(join(SHIPPED, folder), join(root, INSTALLED, folder), { recursive: true });
    for (const name of await readdir(join(root, INSTALLED, folder))) await chmod(join(root, INSTALLED, folder, name), 0o755);
  }
  const log = join(root, "arc-calls.log");
  const cli = join(root, "node_modules/.bin/arc");
  await mkdir(dirname(cli), { recursive: true });
  await writeFile(cli, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log.replaceAll("'", "'\\''")}'\nexit 0\n`);
  await chmod(cli, 0o755);
  await writeFile(join(root, ".gitignore"), "node_modules/\narc-calls.log\n");
  for (const path of [META, COHORT]) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), "# Planned\n");
  }
  await commitAll(root, "chore: track planned state");
  await git(root, "switch", "-c", "feat/remove-state");
  await git(root, "config", "core.hooksPath", `${INSTALLED}/githooks`);
  return { root, calls: async () => (await readFile(log, "utf8").catch(() => "")).trim().split("\n").filter(Boolean) };
}

it("selects the cohort check for a staged planned meta", async () => {
  const { root } = await repository();
  await writeFile(join(root, META), "# Planned, revised\n");
  await git(root, "add", META);
  const result = await git(root, "commit", "-m", "docs: revise the planned meta");
  expect(result.stdout + result.stderr).toContain(COHORT_CHECK);
});

it("selects nothing for a commit that only deletes the state, which passes the hook", async () => {
  const { root, calls } = await repository();
  await git(root, "rm", "-r", "-q", ".arc/backlog");
  const result = await git(root, "commit", "-m", "chore: remove tracked state");
  expect(result.exitCode).toBe(0);
  expect(result.stdout + result.stderr).not.toContain(COHORT_CHECK);
  expect(await calls()).toContain("check pre-commit");
  expect((await git(root, "ls-tree", "-r", "--name-only", "HEAD", "--", ".arc/backlog/")).stdout).toBe("");
});
