/** Native checkout-only signals emit entry plans without executing work. */
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { assertSessionInitAgenda } from "../../src/commands/agenda/schema.js";
import { seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import { cleanupTempDir, createTempRepo, git, runArcNoTty } from "./helpers.js";

describe("agenda checkout-only entry", () => {
  let repository: string | undefined;
  afterEach(async () => {
    if (repository !== undefined) await cleanupTempDir(repository);
    repository = undefined;
  });

  it.each(["housekeep", "context"])("compiles --%s without executing or entering a work unit", async signal => {
    repository = await createTempRepo("arc-agenda-checkout-");
    const initialized = await runArcNoTty(["--no-input", "init", "--name", "agenda", "--identity", "agenda", "--tools", ""], repository);
    expect(initialized.exitCode, initialized.stdout + initialized.stderr).toBe(0);
    await git(repository, ["add", "."]);
    await git(repository, ["commit", "-m", "chore: initialize checkout fixture"]);
    if (signal === "context") {
      await git(repository, ["checkout", "-b", "feat/demo"]);
      await seedWorkUnit(repository, "demo", { identity: "agenda", branch: "feat/demo", bind: repository, meta: {
        state: "Active", owner: "agenda", branch: "feat/demo", currentWorkflow: "process-task-loop",
      } });
    }
    const head = await git(repository, ["rev-parse", "HEAD"]);
    const refs = await git(repository, ["show-ref"]);
    const worktrees = await git(repository, ["worktree", "list", "--porcelain"]);
    const result = await runArcNoTty(["agenda", "session-init", `--${signal}`, "--json"], repository,
      { env: { FORCE_COLOR: undefined } });
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    const agenda: unknown = JSON.parse(result.stdout);
    assertSessionInitAgenda(agenda);
    for (const step of agenda.steps) {
      if (step.type === "fragment" && step.target.kind === "workflow") {
        expect(await readFile(join(repository, step.target.path), "utf8")).toContain("# Workflow:");
      }
    }
    if (signal === "housekeep") {
      expect(agenda.orientation).toEqual({ shape: "subject", subject: { kind: "housekeep", key: null } });
      expect(agenda.steps.at(-1)).toEqual({ type: "fragment", target: {
        kind: "workflow", path: ".arc/system/workflows/arc/supplemental/drain-inbox.md",
      }, args: {} });
    } else {
      expect(agenda.orientation).toEqual({ shape: "checkout" });
      expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "stop", autoProceed: false });
      expect(agenda.steps.filter(step => step.type === "read").some(step => /meta-demo|tasks-demo|process-task-loop/u.test(step.path))).toBe(false);
      expect(agenda.steps.some(step => step.type === "fragment" || step.type === "exec")).toBe(false);
    }
    expect(await git(repository, ["rev-parse", "HEAD"])).toBe(head);
    expect(await git(repository, ["show-ref"])).toBe(refs);
    expect(await git(repository, ["worktree", "list", "--porcelain"])).toBe(worktrees);
    expect(await git(repository, ["status", "--porcelain"])).toBe("");
    if (signal === "context") {
      // The checkout holds the work unit `--context` leaves unentered: without the signal its meta is read.
      const resumed = await runArcNoTty(["agenda", "session-init", "--json"], repository, { env: { FORCE_COLOR: undefined } });
      expect(resumed.exitCode, resumed.stdout + resumed.stderr).toBe(0);
      const control: unknown = JSON.parse(resumed.stdout);
      assertSessionInitAgenda(control);
      expect(control.steps).toContainEqual(expect.objectContaining({ type: "read", path: ".arc/active/current/meta-demo.md" }));
    }
  }, 120_000);
});
