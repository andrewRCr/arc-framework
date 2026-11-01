/** Native agenda input refusals retain a reachable corrected invocation. */

import { afterEach, describe, expect, it } from "vitest";
import { appendAgendaOption, buildAgendaArgv } from "../../src/commands/agenda/argv.js";
import { assertSessionInitAgenda } from "../../src/commands/agenda/schema.js";
import { cleanupTempDir, createTempRepo, git, runArcNoTty } from "./helpers.js";

describe("agenda command input", () => {
  let repository: string | undefined;
  afterEach(async () => {
    if (repository !== undefined) await cleanupTempDir(repository);
    repository = undefined;
  });

  it("emits one typed refusal and reaches normal dispatch after the conflict is removed", async () => {
    repository = await createTempRepo("arc-agenda-input-");
    const initialized = await runArcNoTty(["--no-input", "init", "--name", "agenda", "--identity", "agenda", "--tools", ""], repository);
    expect(initialized.exitCode, JSON.stringify(initialized)).toBe(0);
    await git(repository, ["add", "."]);
    await git(repository, ["commit", "-m", "chore: initialize fixture"]);

    const refused = await runArcNoTty(["agenda", "session-init", "--errand", "--housekeep", "--json"], repository);
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toBe("");
    expect(JSON.parse(refused.stdout)).toEqual({
      code: "invalid-input", flags: ["--errand", "--housekeep"], row: null,
      remedy: expect.stringContaining("Choose only one"),
    });

    const repaired = await runArcNoTty(["agenda", "session-init", "--json"], repository);
    expect(repaired.exitCode).toBe(1);
    expect(repaired.stderr).toBe("");
    expect(JSON.parse(repaired.stdout)).toMatchObject({ code: "row-not-compiled", row: "orient" });
  });

  it("prints an asserted stop agenda with literal intent and accumulated decisions", async () => {
    repository = await createTempRepo("arc-agenda-stop-");
    const initialized = await runArcNoTty(["--no-input", "init", "--name", "agenda", "--identity", "agenda", "--tools", ""], repository);
    expect(initialized.exitCode, JSON.stringify(initialized)).toBe(0);
    const answers = { answered: { "notes:pull": "decline", "worktree:pull": "accept" } as const,
      done: ["notes:load", "fragment:read-load-set"] };
    const argv = buildAgendaArgv({ plan: true, seed: "--context" }, answers, { elicit: "plan" });
    appendAgendaOption(argv, "--plan", "--housekeep");
    const result = await runArcNoTty(argv.slice(1), repository, { env: { FORCE_COLOR: undefined } });
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    const agenda: unknown = JSON.parse(result.stdout);
    assertSessionInitAgenda(agenda);
    expect(agenda.signals).toEqual({ plan: "--housekeep", seed: "--context" });
    expect(agenda.answers).toEqual(answers);
    expect(agenda.orientation).toEqual({ shape: "none" });
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "stop", autoProceed: false });

    const readable = await runArcNoTty(argv.slice(1).filter(value => value !== "--json"), repository,
      { env: { FORCE_COLOR: undefined } });
    expect(readable.exitCode, readable.stdout + readable.stderr).toBe(0);
    expect(readable.stdout).toContain("Session Init");
    expect(readable.stdout).toContain("locus");
    expect(readable.stdout).toContain("stop");
  });

});
