/** Native Plan entry reads backlog stubs without entering or changing them. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertSessionInitAgenda, type SessionInitAgenda } from "../../src/commands/agenda/schema.js";
import { useInRepoStore } from "../helpers/in-repo-store-override.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import { cleanupTempDir, createTempRepo, git, runArcNoTty } from "./helpers.js";

const stub = { state: "Planning", owner: "agenda", branch: "plan/demo", workClass: "Light", currentWorkflow: "draft-design" } as const;
const pickerChoices = [{ kind: "elicit", signal: "plan" }, { kind: "signal", signal: "plan", value: null, decline: true }];

describe("agenda Plan entry", () => {
  let repository: string | undefined;
  afterEach(async () => {
    if (repository !== undefined) await cleanupTempDir(repository);
    repository = undefined;
  });

  /** Install a fixture, let `arrange` add its stubs, then compile `--plan` with `flags`, asserting nothing changed. */
  async function compilePlan(arrange: (root: string) => Promise<void>, flags: string[]): Promise<SessionInitAgenda> {
    repository = await createTempRepo("arc-agenda-plan-");
    const initialized = await runArcNoTty(["--no-input", "init", "--name", "agenda", "--identity", "agenda", "--tools", ""], repository);
    expect(initialized.exitCode, initialized.stdout + initialized.stderr).toBe(0);
    await arrange(repository);
    const head = await git(repository, ["rev-parse", "HEAD"]);
    const refs = await git(repository, ["show-ref"]);
    const result = await runArcNoTty(["agenda", "session-init", ...flags, "--json"], repository,
      { env: { FORCE_COLOR: undefined } });
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    const agenda: unknown = JSON.parse(result.stdout);
    assertSessionInitAgenda(agenda);
    for (const step of agenda.steps) {
      if (step.type === "fragment" && step.target.kind === "workflow") {
        expect(await readFile(join(repository, step.target.path), "utf8")).toContain("# Workflow:");
      }
    }
    expect(await git(repository, ["rev-parse", "HEAD"])).toBe(head);
    expect(await git(repository, ["show-ref"])).toBe(refs);
    expect(await git(repository, ["status", "--porcelain"])).toBe("");
    return agenda;
  }

  it.each(["found", "bare", "missing"])("compiles a %s stub through native lookup", async mode => {
    const agenda = await compilePlan(async root => {
      await git(root, ["add", "."]);
      await git(root, ["commit", "-m", "chore: initialize Plan fixture"]);
      if (mode === "found") {
        await seedWorkUnit(root, "demo", { identity: "agenda", placement: { kind: "backlog", commitment: "planned" }, meta: stub });
      }
    }, mode === "bare" ? ["--plan"] : ["--plan", mode === "missing" ? "missing" : "demo"]);
    if (mode === "found") {
      expect(agenda.steps.at(-1)).toEqual({ type: "fragment", target: {
        kind: "workflow", path: ".arc/system/workflows/arc/draft-design.md",
      }, args: { stub: "demo", onGroomingBranch: false } });
    } else {
      expect(agenda.steps.at(-1)).toMatchObject({ type: "offer", id: `plan-stub:${mode === "bare" ? "" : "missing"}`,
        choices: pickerChoices });
    }
  }, 120_000);

  // Two stubs of one slug exist only as backlog directories: on the store a second `demo` work unit's write refuses.
  // The directory lookup's uniqueness refusal leaves with the in-repo implementation; the store's ambiguous lookup, a
  // work unit and a cohort sharing a name, is compiled in process with the Plan signal's own cases.
  it("compiles an ambiguous stub through native lookup", async () => {
    useInRepoStore();
    const agenda = await compilePlan(async root => {
      for (const directory of ["demo", "cohort/demo"]) {
        const path = join(root, ".arc/backlog/planned", directory);
        await mkdir(path, { recursive: true });
        await writeFile(join(path, "meta-demo.md"), makeMetaFixture("demo", stub));
      }
      await git(root, ["add", "."]);
      await git(root, ["commit", "-m", "chore: initialize Plan fixture"]);
    }, ["--plan", "demo"]);
    expect(agenda.steps.at(-1)).toMatchObject({ type: "offer", id: "plan-stub:demo", choices: pickerChoices,
      text: expect.stringContaining("Ambiguous backlog stub") });
  }, 120_000);
});
