/** Native resume dispatch emits a complete compiled agenda from an installed project. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { assertSessionInitAgenda } from "../../src/commands/agenda/schema.js";
import { cleanupTempDir, createTempRepo, git, runArcNoTty } from "./helpers.js";

describe("agenda work-unit resume command", () => {
  let repository: string | undefined;
  afterEach(async () => { if (repository !== undefined) await cleanupTempDir(repository); repository = undefined; });

  it("compiles a work-unit resume through the actual command adapter", async () => {
    repository = await createTempRepo("arc-agenda-resume-");
    const initialized = await runArcNoTty(["--no-input", "init", "--name", "agenda", "--identity", "agenda", "--tools", ""], repository);
    expect(initialized.exitCode, initialized.stdout + initialized.stderr).toBe(0);
    await git(repository, ["checkout", "-b", "feat/work"]);
    await mkdir(join(repository, ".arc/active"), { recursive: true });
    await writeFile(join(repository, ".arc/active/meta-work.md"), makeMetaFixture("work", {
      state: "Active", owner: "agenda", branch: "feat/work", workClass: "Heavy",
      taskList: "tasks-work.md", currentWorkflow: "process-task-loop", nextTask: "Implement behavior",
    }));
    await writeFile(join(repository, ".arc/active/tasks-work.md"), "# Tasks\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Implement behavior**\n");
    await git(repository, ["add", "."]);
    await git(repository, ["commit", "-m", "chore: initialize resume fixture"]);
    const head = (await git(repository, ["rev-parse", "HEAD"])).trim();
    await mkdir(join(repository, ".arc/user/agenda/work"), { recursive: true });
    await writeFile(join(repository, ".arc/user/agenda/work/SESSION-NOTES.md"), `# Session Notes\n\n**Commit at Handoff:** ${head.slice(0, 10)}\n`);

    const result = await runArcNoTty(["agenda", "session-init", "--next", "--json"], repository, { env: { FORCE_COLOR: undefined } });
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    const agenda: unknown = JSON.parse(result.stdout);
    assertSessionInitAgenda(agenda);
    expect(agenda.orientation).toEqual({ shape: "work-state" });
    expect(agenda.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "read", path: ".arc/active/meta-work.md" }),
      expect.objectContaining({ type: "read", path: ".arc/active/tasks-work.md", cursor: expect.any(Object) }),
    ]));
    expect(agenda.steps.at(-1)).toMatchObject({ type: "gate", kind: "proceed" });
  });
});
