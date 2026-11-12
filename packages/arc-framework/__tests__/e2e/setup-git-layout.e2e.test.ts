/** Setup refuses a separate Git directory and remains usable after a normal clone. */

import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempRepo, git, runArcNoTty } from "./helpers.js";

type SetupCommand = "init" | "join";
const CASE_TIMEOUT_MS = 60_000;

function args(command: SetupCommand, reconfigure = false): string[] {
  if (command === "init") {
    return ["--no-input", "init", "--yes",
      ...(reconfigure ? ["--reconfigure"] : ["--name", "layout-fixture", "--identity", "new-user"])];
  }
  return ["--no-input", "join", "--contributor", "--tools", "",
    ...(reconfigure ? ["--reconfigure"] : ["--identity", "new-user"])];
}

describe("setup Git directory layout", () => {
  const fixtures: string[] = [];

  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map((root) => cleanupTempDir(root)));
  });

  async function fixture(installed: boolean): Promise<string> {
    const root = await createTempRepo("arc-setup-git-layout-");
    fixtures.push(root);
    await writeFile(join(root, "README.md"), "Layout fixture\n");
    if (installed) {
      const init = await runArcNoTty(["--no-input", "init", "--yes", "--name", "layout-fixture",
        "--identity", "existing-user"], root);
      expect(init.exitCode, init.stdout + init.stderr).toBe(0);
    }
    await git(root, ["add", "-A"]);
    await git(root, ["commit", "-m", "fixture"]);
    return root;
  }

  async function separate(root: string): Promise<string> {
    const metadata = join(root, "git-metadata");
    await git(root, ["init", "--separate-git-dir", metadata]);
    return metadata;
  }

  async function assertRefusal(root: string, command: SetupCommand, reconfigure = false): Promise<void> {
    const before = await git(root, ["config", "--local", "--list"]);
    const result = await runArcNoTty(args(command, reconfigure), root);
    const output = result.stdout + result.stderr;
    expect(result.exitCode, output).toBe(1);
    expect(output).toContain("git.setup-layout-unsupported");
    expect(output).toContain("--separate-git-dir");
    expect(output).toContain("normal clone");
    expect(await git(root, ["config", "--local", "--list"])).toBe(before);
    await expect(access(join(root, ".arc/user/new-user"))).rejects.toMatchObject({ code: "ENOENT" });
  }

  async function cloneAndRetry(root: string, command: SetupCommand, reconfigure = false): Promise<void> {
    const clone = join(root, "normal-clone");
    await git(root, ["clone", "--no-local", root, clone]);
    await git(clone, ["config", "user.name", "Test User"]);
    await git(clone, ["config", "user.email", "test@example.com"]);
    if (reconfigure) await git(clone, ["config", "arc.identity", "existing-user"]);
    const result = await runArcNoTty(args(command, reconfigure), clone);
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    await expect(access(join(clone, ".arc/system/arc-config.yml"))).resolves.toBeUndefined();
    if (!reconfigure) {
      expect(await git(clone, ["config", "--get", "arc.identity"])).toBe("new-user");
    }
  }

  it.each(["init", "join"] as const)("refuses %s before writes and succeeds after a normal clone", async (command) => {
    const root = await fixture(command === "join");
    const metadata = await separate(root);

    await assertRefusal(root, command);
    await expect(access(join(metadata, ".arc"))).rejects.toMatchObject({ code: "ENOENT" });
    if (command === "init") {
      await expect(access(join(root, ".arc"))).rejects.toMatchObject({ code: "ENOENT" });
    }
    await cloneAndRetry(root, command);
  }, CASE_TIMEOUT_MS);

  it.each(["init", "join"] as const)("refuses %s --reconfigure and succeeds after a normal clone", async (command) => {
    const root = await fixture(true);
    await separate(root);

    await assertRefusal(root, command, true);
    await cloneAndRetry(root, command, true);
  }, CASE_TIMEOUT_MS);

  it("refuses join from a linked checkout whose primary uses a separate Git directory", async () => {
    const root = await fixture(true);
    await separate(root);
    const linked = join(root, "linked");
    await git(root, ["worktree", "add", "-b", "linked", linked]);

    await assertRefusal(linked, "join");
  }, CASE_TIMEOUT_MS);

  it("allows join from a linked checkout with a normal primary", async () => {
    const root = await fixture(true);
    const linked = join(root, "linked");
    await git(root, ["worktree", "add", "-b", "linked", linked]);

    const result = await runArcNoTty(args("join"), linked);
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(await git(linked, ["config", "--get", "arc.identity"])).toBe("new-user");
  }, CASE_TIMEOUT_MS);
});
