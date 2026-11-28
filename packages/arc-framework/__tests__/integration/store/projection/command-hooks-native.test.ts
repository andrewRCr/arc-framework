/** The root hook binds a command's projection to its ARC root, and binds none where ARC is not installed. */
import { Command } from "commander";
import { lstat, mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { registerProjectionHooks } from "../../../../src/lib/store/projection/command-hooks.js";
import { PROJECTION_STATE_FOLDER } from "../../../../src/lib/store/projection/location.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { commitAll, createTempRepoCore, makeTempRoot, removeGitBackedDirs } from "../../../helpers/temp-repo.js";

const directories: string[] = [];
const original = process.cwd();
afterEach(async () => { process.chdir(original); await removeGitBackedDirs(directories.splice(0)); });

/** Run one command through the native root hook from the directory, returning its projection start and diagnostics. */
async function runFrom(cwd: string): Promise<{ start: string | undefined; stderr: string }> {
  const errors: string[] = [];
  const program = new Command("arc").exitOverride();
  program.command("probe").action(() => undefined);
  registerProjectionHooks(program, { writeError: text => { errors.push(text); } });
  process.chdir(cwd);
  try { await program.parseAsync(["probe"], { from: "user" }); }
  finally { process.chdir(original); }
  return { start: projectionProcessState().start?.kind, stderr: errors.join("") };
}

async function repository(): Promise<string> {
  const root = await createTempRepoCore({ prefix: "arc-hook-unprojected-repo-" });
  directories.push(root);
  await commitAll(root, "chore: start the repository");
  return root;
}

describe("native projection binding", () => {
  it("runs a command outside any Git work tree with no projection and no diagnostic", async () => {
    const outside = await makeTempRoot("arc-hook-unprojected-");
    directories.push(outside);
    expect(await runFrom(outside)).toMatchObject({ start: "no-projection", stderr: "" });
  });

  it.each([
    ["at its top level", repository],
    ["in a subdirectory", async () => {
      const nested = join(await repository(), "nested");
      await mkdir(nested);
      return nested;
    }],
  ])("runs a command in a repository where ARC is not installed, %s, with no projection and no diagnostic",
    async (_place, place) => {
      expect(await runFrom(await place())).toMatchObject({ start: "no-projection", stderr: "" });
    });

  it("keeps a nested repository separate from an enclosing project that still tracks ARC state", async () => {
    const parent = await repository();
    const active = join(parent, ".arc", "active");
    await mkdir(active, { recursive: true });
    await writeFile(join(active, "meta-example.md"), "tracked\n");
    await commitAll(parent);

    const subdir = join(parent, "src");
    await mkdir(subdir);
    await expect(runFrom(subdir)).rejects.toMatchObject({ refusal: { code: "tracked-state" } });

    const child = join(parent, "child");
    await rename(await repository(), child);
    const nested = join(child, "src");
    await mkdir(nested);
    expect(await runFrom(nested)).toEqual({ start: "no-projection", stderr: "" });
    for (const root of [child, parent]) {
      await expect(lstat(join(root, ".git", PROJECTION_STATE_FOLDER))).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it("reports an installed ARC root outside any Git repository as missing its Git directory", async () => {
    const root = await makeTempRoot("arc-hook-installed-");
    directories.push(root);
    await mkdir(join(root, ".arc", "system"), { recursive: true });
    await writeFile(join(root, ".arc", "system", "arc-config.yml"), "branch.base: main\n");
    const result = await runFrom(root);
    expect(result.start).toBe("skipped");
    expect(result.stderr).toContain("The worktree's Git directory is missing.");
  });
});
