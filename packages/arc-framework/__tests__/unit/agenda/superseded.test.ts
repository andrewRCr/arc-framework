/** Reset offers retain their authority boundary and do not repeat in orientation. */

import { describe, expect, it } from "vitest";
import { createAgendaFixtureInput } from "../../helpers/agenda-fixtures.js";
import { dirtyState, sessionInitFixture, supersessionResult, worktreeSync } from "../../helpers/session-init-fixtures.js";
import { compileSyncPrefix } from "../../../src/commands/agenda/prefix.js";
import { renderSuperseded } from "../../../src/commands/agenda/superseded.js";
import type { AgendaCompileInput } from "../../../src/commands/agenda/compile-input.js";

const head = "Local commits are superseded by rebased equivalents on `origin/feat/work`; dropping them loses nothing.";

async function input(dirty = false): Promise<AgendaCompileInput> {
  return createAgendaFixtureInput(await sessionInitFixture({
    worktree: async () => worktreeSync({ state: "diverged", ahead: 1, behind: 2, branch: "feat/work" }),
    supersession: async () => supersessionResult({ superseded: true, supersededCommits: ["a".repeat(40)] }),
    dirty: async () => dirtyState({ state: dirty ? "dirty" : "clean", fileCount: dirty ? 1 : 0 }),
  }));
}

describe("superseded reset orientation", () => {
  it.each([false, true])("renders only the explanation after decline with dirty=%s", async dirty => {
    const value = await input(dirty);
    value.answers.answered["superseded:reset"] = "decline";
    expect(compileSyncPrefix(value)).toEqual([]);
    expect(renderSuperseded(value)).toEqual({ type: "render", surface: "superseded", text: head });
  });

  it("renders the explanation on a row that runs only the notes channel", async () => {
    const value = await input(true);
    expect(compileSyncPrefix(value, "notes")).toEqual([]);
    expect(renderSuperseded(value, "notes")).toEqual({ type: "render", surface: "superseded", text: head });
  });

  it("does not duplicate a pending reset question with an orientation render", async () => {
    const value = await input(true);
    expect(compileSyncPrefix(value)).toMatchObject([{ type: "offer", id: "superseded:reset", ask: "now" }]);
    expect(renderSuperseded(value)).toBeNull();
  });

  it("omits the explanation without superseded-commit evidence", async () => {
    expect(renderSuperseded(createAgendaFixtureInput(await sessionInitFixture()))).toBeNull();
  });
});
