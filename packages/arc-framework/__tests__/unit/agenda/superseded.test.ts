/** Declined reset offers retain their checkout explanation and authority boundary. */

import { describe, expect, it } from "vitest";
import { createAgendaFixtureInput } from "../../helpers/agenda-fixtures.js";
import { activeSessionInit, derivedFrameFromActive, dirtyState, sessionInitFixture, supersessionResult, worktreeSync } from "../../helpers/session-init-fixtures.js";
import { createSignalAgendaFixture } from "../../helpers/agenda-signal-fixtures.js";
import { compileSessionInitAgenda } from "../../../src/commands/agenda/compile.js";
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
    expect(renderSuperseded(value)).toEqual({ type: "render", surface: "superseded", text: head });
  });

  it("retains the head in the pending offer's declined orientation", async () => {
    const value = await input(true);
    expect(compileSyncPrefix(value)).toMatchObject([{ type: "offer", id: "superseded:reset", ask: "now" }]);
    expect(renderSuperseded(value)).toEqual({ type: "render", surface: "superseded", text: head });
  });

  it("omits the explanation without superseded-commit evidence", async () => {
    expect(renderSuperseded(createAgendaFixtureInput(await sessionInitFixture()))).toBeNull();
  });
});

it.each(["resume", "orient"] as const)("retains the explanation after the initial %s offer's bare decline", async row => {
  const active = row === "resume" ? activeSessionInit({ resolution: "single", path: ".arc/active/meta-work.md", sessionType: "execution" }) : activeSessionInit();
  const { input: value } = await createSignalAgendaFixture(undefined, {
    active: async () => active,
    derivedLocusState: async () => derivedFrameFromActive(active, "test-user", null, null),
    worktree: async () => worktreeSync({ state: "diverged", ahead: 1, behind: 2, branch: "feat/work" }),
    supersession: async () => supersessionResult({ superseded: true, supersededCommits: ["a".repeat(40)] }),
  }, false);
  const result = await compileSessionInitAgenda(value);
  if (!result.ok) throw new Error(JSON.stringify(result.refusal));
  const offerIndex = result.agenda.steps.findIndex(step => step.type === "offer" && step.id === "superseded:reset");
  expect(offerIndex).toBeGreaterThanOrEqual(0);
  expect(result.agenda.steps[offerIndex]).toMatchObject({ choices: expect.arrayContaining([{ kind: "bare", label: "Skip", decline: true }]) });
  const declinedTail = result.agenda.steps.slice(offerIndex + 1);
  expect(declinedTail).toContainEqual({ type: "render", surface: "superseded", text: head });
  expect(declinedTail.some(step => step.type === "exec")).toBe(false);
});
