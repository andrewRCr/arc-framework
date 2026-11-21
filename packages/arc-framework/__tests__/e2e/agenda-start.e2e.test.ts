/** Native Start readiness resolves stored backlog records without changing checkout or refs. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertSessionInitAgenda } from "../../src/commands/agenda/schema.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import { cleanupTempDir, createTempRepo, git, runArcNoTty } from "./helpers.js";

const meta = { state: "Planning", owner: "agenda", branch: null, workClass: "Light", currentWorkflow: null,
  taskList: "tasks-demo.md" } as const;

describe("agenda Start entry", () => {
  let repository: string | undefined;
  afterEach(async () => {
    if (repository !== undefined) await cleanupTempDir(repository);
    repository = undefined;
  });

  it.each(["provisional", "planned"] as const)("reads a %s target through native local selection", async commitment => {
    repository = await createTempRepo("arc-agenda-start-");
    const initialized = await runArcNoTty(["--no-input", "init", "--name", "agenda", "--identity", "agenda", "--tools", ""], repository);
    expect(initialized.exitCode, initialized.stdout + initialized.stderr).toBe(0);
    const directory = join(repository, ".arc/backlog", commitment, "demo");
    const metaPath = join(directory, "meta-demo.md"), taskListPath = join(directory, "tasks-demo.md");
    await git(repository, ["add", "."]);
    await git(repository, ["commit", "-m", "chore: initialize Start fixture"]);
    const seeded = await seedWorkUnit(repository, "demo", { identity: "agenda", placement: { kind: "backlog", commitment }, meta,
      taskList: "# Tasks\n" });
    const head = await git(repository, ["rev-parse", "HEAD"]), refs = await git(repository, ["show-ref"]);
    const result = await runArcNoTty(["agenda", "session-init", "--start", "demo", "--json"], repository,
      { env: { FORCE_COLOR: undefined } });
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    const agenda: unknown = JSON.parse(result.stdout);
    assertSessionInitAgenda(agenda);
    expect(agenda.orientation).toEqual({ shape: "subject", subject: { kind: "work-unit", key: "demo" } });
    // The selected records are the readiness evidence, carried in the method's arguments; no checkout file is read.
    expect(agenda.steps.some(step => step.type === "read" && /meta-demo|tasks-demo/u.test(step.path))).toBe(false);
    const readiness = agenda.steps.at(-2);
    expect(readiness).toMatchObject({ type: "fragment", target: { kind: "method", name: "assess-start-readiness" }, args: {
      slug: "demo", metaPath, taskListPath, evidenceBackend: "store", metaVersion: seeded.meta.version,
      metaContent: makeMetaFixture("demo", meta), taskListStatus: "present", taskListVersion: seeded.taskList?.version,
      taskListContent: "# Tasks\n",
    } });
    if (readiness?.type !== "fragment") throw Error("Expected the readiness method");
    expect(JSON.parse(String(readiness.args.metaReference))).toEqual(seeded.meta.reference);
    expect(JSON.parse(String(readiness.args.taskListReference))).toEqual(seeded.taskList?.reference);
    expect(await readFile(join(repository, ".arc/system/methods/assess-start-readiness.md"), "utf8")).toContain("# Method: assess-start-readiness");
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "launch", autoProceed: false });
    expect(await git(repository, ["rev-parse", "HEAD"])).toBe(head);
    expect(await git(repository, ["show-ref"])).toBe(refs);
    expect(await git(repository, ["status", "--porcelain"])).toBe("");
  }, 120_000);
});
