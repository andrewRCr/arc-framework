/** The root hook binds a command's projection to its ARC root or, without one, its Git work tree's top level, and
 * binds none outside any work tree. */
import { Command } from "commander";
import { realpathSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { registerProjectionHooks } from "../../../../src/lib/store/projection/command-hooks.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { commitAll, createTempRepoCore, makeTempRoot, removeGitBackedDirs } from "../../../helpers/temp-repo.js";

const directories: string[] = [];
const original = process.cwd();
afterEach(async () => { process.chdir(original); await removeGitBackedDirs(directories.splice(0)); });

/** Run one command through the native root hook from the directory, returning its projection start and diagnostics. */
async function runFrom(cwd: string): Promise<{ start: string | undefined; checkout: string | undefined; stderr: string }> {
  const errors: string[] = [];
  const program = new Command("arc").exitOverride();
  program.command("probe").action(() => undefined);
  registerProjectionHooks(program, { writeError: text => { errors.push(text); } });
  process.chdir(cwd);
  try { await program.parseAsync(["probe"], { from: "user" }); }
  finally { process.chdir(original); }
  const state = projectionProcessState();
  return { start: state.start?.kind, checkout: state.command?.checkout, stderr: errors.join("") };
}

describe("native projection binding", () => {
  it("runs a command outside any Git work tree with no projection and no diagnostic", async () => {
    const outside = await makeTempRoot("arc-hook-unprojected-");
    directories.push(outside);
    expect(await runFrom(outside)).toMatchObject({ start: "no-projection", stderr: "" });
  });

  it("binds a subdirectory of a repository where ARC is not installed to the repository's top level", async () => {
    const root = await createTempRepoCore({ prefix: "arc-hook-unprojected-repo-" });
    directories.push(root);
    await commitAll(root, "chore: start the repository");
    const nested = join(root, "nested");
    await mkdir(nested);
    const fromNested = await runFrom(nested);
    expect(fromNested.checkout).toBe(realpathSync(root));
    expect(fromNested.stderr).not.toContain("Git directory is missing");
    expect(fromNested.start).toBe((await runFrom(root)).start);
  });
});
