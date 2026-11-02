/** Native branch-gone compilation plans recovery without performing it. */
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { assertSessionInitAgenda } from "../../src/commands/agenda/schema.js";
import { cleanupTempDir, createTempRepo, git, runArcNoTty } from "./helpers.js";

describe("agenda branch-gone recovery command", () => {
  const directories: string[] = [];
  afterEach(async () => {
    for (const directory of directories.splice(0).reverse()) await cleanupTempDir(directory);
  });

  it.each(["feat/recover", "--dry-run", "-"])("plans literal recovery for %s while preserving checkout and code refs", async destination => {
    const repository = await createTempRepo("arc-agenda-recovery-");
    directories.push(repository);
    const remote = await mkdtemp(join(tmpdir(), "arc-agenda-recovery-origin-"));
    directories.push(remote);
    await git(remote, ["init", "--bare", "-b", "main"]);
    const initialized = await runArcNoTty(["--no-input", "init", "--name", "agenda", "--identity", "agenda", "--tools", ""], repository);
    expect(initialized.exitCode, initialized.stdout + initialized.stderr).toBe(0);
    await git(repository, ["add", "."]);
    await git(repository, ["commit", "-m", "chore: initialize recovery fixture"]);
    await git(repository, ["remote", "add", "origin", remote]);
    await git(repository, ["push", "-u", "origin", "main"]);
    await git(repository, ["checkout", "-b", "feat/gone"]);
    await mkdir(join(repository, ".arc/active"), { recursive: true });
    await writeFile(join(repository, ".arc/active/meta-gone.md"), makeMetaFixture("gone", {
      state: "Active", owner: "agenda", branch: "feat/gone", workClass: "Light", currentWorkflow: "process-task-loop",
    }));
    await git(repository, ["add", ".arc/active/meta-gone.md"]);
    await git(repository, ["commit", "-m", "chore: initialize current work unit"]);
    await git(repository, ["push", "-u", "origin", "feat/gone"]);
    await git(repository, ["checkout", "-b", "feat/recover"]);
    await writeFile(join(repository, "recover.txt"), "Unmerged destination work\n");
    await git(repository, ["add", "recover.txt"]);
    await git(repository, ["commit", "-m", "feat: add destination work"]);
    await git(repository, ["push", "origin", `HEAD:refs/heads/${destination}`]);
    const destinationHead = await git(repository, ["rev-parse", "HEAD"]);
    await git(repository, ["checkout", "main"]);
    await git(repository, ["checkout", "feat/gone"]);
    await git(repository, ["push", "origin", "--delete", "feat/gone"]);
    await git(repository, ["branch", "-D", "feat/recover"]);
    if (destination === "-") await git(repository, ["update-ref", "refs/heads/-", destinationHead]);
    const before = await git(repository, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads", "refs/remotes"]);
    const head = await git(repository, ["rev-parse", "HEAD"]);
    const previous = await git(repository, ["rev-parse", "--symbolic-full-name", "@{-1}"]);
    expect(previous).toBe("refs/heads/main");

    const result = await runArcNoTty(["agenda", "session-init", "--json"], repository, { env: { FORCE_COLOR: undefined } });
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    const agenda: unknown = JSON.parse(result.stdout);
    assertSessionInitAgenda(agenda);
    if (destination === "-") {
      expect(agenda.steps.filter(step => step.type === "exec" || step.type === "offer")).toEqual([]);
      expect(agenda.steps).toEqual(expect.arrayContaining([expect.objectContaining({
        type: "render", surface: "branch-gone", text: expect.stringContaining("recover the literal branch `-` manually"),
      })]));
      expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "stop", autoProceed: false });
    } else {
      expect(agenda.steps).toEqual([{ type: "exec", id: "branch-gone:resolved", actions: [
        { argv: ["git", "fetch", "origin", "--", destination], text: `git fetch origin -- ${destination}` },
        { argv: ["git", "switch", "--", destination], text: `git switch -- ${destination}` },
      ], then: { kind: "recompile", argv: ["arc", "agenda", "session-init", "--json", "--done", "branch-gone:resolved"] } }]);
    }
    expect(await git(repository, ["branch", "--show-current"])).toBe("feat/gone");
    expect(await git(repository, ["rev-parse", "HEAD"])).toBe(head);
    expect(await git(repository, ["rev-parse", "--symbolic-full-name", "@{-1}"])).toBe(previous);
    expect(await git(repository, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads", "refs/remotes"])).toBe(before);
    expect(await git(repository, ["status", "--porcelain"])).toBe("");
  }, 120_000);
});
