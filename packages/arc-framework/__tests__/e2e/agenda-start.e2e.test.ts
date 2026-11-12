/** Native Start readiness resolves backlog artifacts without changing checkout or refs. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { assertSessionInitAgenda } from "../../src/commands/agenda/schema.js";
import { cleanupTempDir, createTempRepo, git, runArcNoTty } from "./helpers.js";

describe("agenda Start entry", () => {
  let repository: string | undefined;
  afterEach(async () => {
    if (repository !== undefined) await cleanupTempDir(repository);
    repository = undefined;
  });

  it.each(["provisional", "planned"])("reads a %s target through native local selection", async commitment => {
    repository = await createTempRepo("arc-agenda-start-");
    const initialized = await runArcNoTty(["--no-input", "init", "--name", "agenda", "--identity", "agenda", "--tools", ""], repository);
    expect(initialized.exitCode, initialized.stdout + initialized.stderr).toBe(0);
    const directory = join(repository, ".arc/backlog", commitment, "demo");
    await mkdir(directory, { recursive: true });
    const metaPath = join(directory, "meta-demo.md"), taskListPath = join(directory, "tasks-demo.md");
    await writeFile(metaPath, makeMetaFixture("demo", { state: "Planning", owner: "agenda", branch: null,
      workClass: "Light", currentWorkflow: null, taskList: "tasks-demo.md" }));
    await writeFile(taskListPath, "# Tasks\n");
    await git(repository, ["add", "."]);
    await git(repository, ["commit", "-m", "chore: initialize Start fixture"]);
    const head = await git(repository, ["rev-parse", "HEAD"]), refs = await git(repository, ["show-ref"]);
    const result = await runArcNoTty(["agenda", "session-init", "--start", "demo", "--json"], repository,
      { env: { FORCE_COLOR: undefined } });
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    const agenda: unknown = JSON.parse(result.stdout);
    assertSessionInitAgenda(agenda);
    expect(agenda.orientation).toEqual({ shape: "subject", subject: { kind: "work-unit", key: "demo" } });
    expect(agenda.steps.filter(step => step.type === "read")).toEqual(expect.arrayContaining([
      { type: "read", path: metaPath, readMode: { kind: "full" }, group: expect.any(Number) },
      { type: "read", path: taskListPath, readMode: { kind: "full" }, group: expect.any(Number) },
    ]));
    expect(agenda.steps.at(-2)).toEqual({ type: "fragment", target: { kind: "method", name: "assess-start-readiness" },
      args: { slug: "demo", metaPath, taskListPath } });
    expect(await readFile(join(repository, ".arc/system/methods/assess-start-readiness.md"), "utf8")).toContain("# Method: assess-start-readiness");
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "launch", autoProceed: false });
    expect(await git(repository, ["rev-parse", "HEAD"])).toBe(head);
    expect(await git(repository, ["show-ref"])).toBe(refs);
    expect(await git(repository, ["status", "--porcelain"])).toBe("");
  }, 120_000);
});
