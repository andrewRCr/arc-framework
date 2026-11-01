/** Native agenda input refusals retain a reachable corrected invocation. */

import { afterEach, describe, expect, it } from "vitest";
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
    expect(JSON.parse(repaired.stdout)).toMatchObject({ code: "row-not-compiled" });
  });
});
