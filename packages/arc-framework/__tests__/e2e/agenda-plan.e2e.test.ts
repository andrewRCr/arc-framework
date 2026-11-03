/** Native Plan entry reads real backlog directories without entering or changing them. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { assertSessionInitAgenda } from "../../src/commands/agenda/schema.js";
import { cleanupTempDir, createTempRepo, git, runArcNoTty } from "./helpers.js";

describe("agenda Plan entry", () => {
  let repository: string | undefined;
  afterEach(async () => {
    if (repository !== undefined) await cleanupTempDir(repository);
    repository = undefined;
  });

  it.each(["found", "bare", "missing", "ambiguous"])("compiles a %s stub through native lookup", async mode => {
    repository = await createTempRepo("arc-agenda-plan-");
    const initialized = await runArcNoTty(["--no-input", "init", "--name", "agenda", "--identity", "agenda", "--tools", ""], repository);
    expect(initialized.exitCode, initialized.stdout + initialized.stderr).toBe(0);
    if (mode === "found" || mode === "ambiguous") {
      const directories = mode === "ambiguous" ? ["demo", "cohort/demo"] : ["demo"];
      for (const directory of directories) {
        const path = join(repository, ".arc/backlog/planned", directory);
        await mkdir(path, { recursive: true });
        await writeFile(join(path, "meta-demo.md"), makeMetaFixture("demo", {
          state: "Planning", owner: "agenda", branch: "plan/demo", workClass: "Light", currentWorkflow: "draft-design",
        }));
      }
    }
    await git(repository, ["add", "."]);
    await git(repository, ["commit", "-m", "chore: initialize Plan fixture"]);
    const head = await git(repository, ["rev-parse", "HEAD"]);
    const refs = await git(repository, ["show-ref"]);
    const flags = mode === "bare" ? ["--plan"] : ["--plan", mode === "missing" ? "missing" : "demo"];
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
    if (mode === "found") {
      expect(agenda.steps.at(-1)).toEqual({ type: "fragment", target: {
        kind: "workflow", path: ".arc/system/workflows/arc/draft-design.md",
      }, args: { stub: "demo", onGroomingBranch: false } });
    } else {
      const value = mode === "bare" ? "" : mode === "missing" ? "missing" : "demo";
      const offer = agenda.steps.at(-1);
      expect(offer).toMatchObject({ type: "offer", id: `plan-stub:${value}`, choices: [
        { kind: "elicit", signal: "plan" }, { kind: "signal", signal: "plan", value: null, decline: true },
      ] });
      if (mode === "ambiguous") expect(offer).toMatchObject({ text: expect.stringContaining("Ambiguous backlog stub") });
    }
    expect(await git(repository, ["rev-parse", "HEAD"])).toBe(head);
    expect(await git(repository, ["show-ref"])).toBe(refs);
    expect(await git(repository, ["status", "--porcelain"])).toBe("");
  }, 120_000);
});
