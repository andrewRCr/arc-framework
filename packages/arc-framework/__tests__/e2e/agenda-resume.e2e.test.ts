/** Native resume dispatch emits a complete compiled agenda from an installed project. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertSessionInitAgenda } from "../../src/commands/agenda/schema.js";
import { parseStampedFile } from "../../src/lib/store/projection/stamp.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import { cleanupTempDir, createTempRepo, git, runArcNoTty } from "./helpers.js";

const meta = { state: "Active", owner: "agenda", branch: "feat/work", workClass: "Heavy", taskList: "tasks-work.md",
  currentWorkflow: "process-task-loop", nextTask: "Implement behavior" } as const;
const taskList = "# Tasks\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Implement behavior**\n";

describe("agenda work-unit resume command", () => {
  let repository: string | undefined;
  afterEach(async () => { if (repository !== undefined) await cleanupTempDir(repository); repository = undefined; });

  it("compiles a work-unit resume through the actual command adapter", async () => {
    repository = await createTempRepo("arc-agenda-resume-");
    const initialized = await runArcNoTty(["--no-input", "init", "--name", "agenda", "--identity", "agenda", "--tools", ""], repository);
    expect(initialized.exitCode, initialized.stdout + initialized.stderr).toBe(0);
    await git(repository, ["add", "."]);
    await git(repository, ["commit", "-m", "chore: initialize resume fixture"]);
    await git(repository, ["checkout", "-b", "feat/work"]);
    await seedWorkUnit(repository, "work", { identity: "agenda", meta, taskList, branch: "feat/work", bind: repository });

    const result = await runArcNoTty(["agenda", "session-init", "--next", "--json"], repository, { env: { FORCE_COLOR: undefined } });
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    const agenda: unknown = JSON.parse(result.stdout);
    assertSessionInitAgenda(agenda);
    expect(agenda.orientation).toEqual({ shape: "work-state" });
    expect(agenda.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "read", path: ".arc/active/current/meta-work.md" }),
      expect.objectContaining({ type: "read", path: ".arc/active/current/tasks-work.md", cursor: expect.any(Object) }),
    ]));
    expect(agenda.steps.at(-1)).toMatchObject({ type: "gate", kind: "proceed" });
    const projected = async (path: string) => parseStampedFile(await readFile(join(repository!, path), "utf8")).content;
    expect(await projected(".arc/active/current/meta-work.md")).toBe(makeMetaFixture("work", meta));
    expect(await projected(".arc/active/current/tasks-work.md")).toBe(taskList);
  });
});
