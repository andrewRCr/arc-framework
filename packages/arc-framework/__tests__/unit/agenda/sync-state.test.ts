/** Sync decisions suppress repeat work and retain unsettled channel facts. */
import { describe, expect, it } from "vitest";
import { createAgendaFixtureInput } from "../../helpers/agenda-fixtures.js";
import { activeSessionInit, baseBranchSync, configSessionInit, sessionInitFixture, userSessionInit, worktreeSync } from "../../helpers/session-init-fixtures.js";
import { projectUserReferenceSessionResult } from "../../../src/lib/user-reference-reconcile.js";
import { compileSyncPrefix } from "../../../src/commands/agenda/prefix.js";
import { compileSyncState } from "../../../src/commands/agenda/sync-state.js";

async function prompted() {
  return createAgendaFixtureInput(await sessionInitFixture({
    worktree: async () => worktreeSync({ state: "remote-ahead", behind: 2 }),
    user: async () => userSessionInit({ state: "remote-ahead", refState: "remote-ahead", shouldPromptToPull: true }),
  }));
}

describe("agenda synchronization decisions", () => {
  it("prunes an answered worktree pull, and offers nothing for the notes pull the probe publishes", async () => {
    const value = await prompted();
    value.answers.answered["worktree:pull"] = "decline";
    expect(compileSyncPrefix(value)).toEqual([]);
  });

  it("omits an accepted worktree pull and reports it still pending", async () => {
    const value = await prompted();
    value.answers.answered = { "worktree:pull": "accept" };
    expect(compileSyncPrefix(value)).toEqual([]);
    expect(compileSyncState(value).unsettled).toEqual([
      { type: "note", surface: "sync-unsettled", text: expect.stringContaining("worktree:pull") },
    ]);
    expect([...compileSyncState(value).unsynced]).toContain("worktree:pull");
  });

  it.each(["base-sync:pull", "user-references:apply"])("omits a completed %s before constructing it", async id => {
    const references = projectUserReferenceSessionResult({ status: "ready", ref: "main", remoteEvidence: "exact",
      transitions: [{ subject: "before", outcome: { kind: "rename", targetSlug: "after" } }],
    }, { userInbox: { path: "USER-INBOX.md",
      content: "# User Inbox\n\n## Work Unit\n\n### `[ ]` **Concern**\n\n- _WU_Target:_ `before`\n" } }, "/repo");
    const value = createAgendaFixtureInput(await sessionInitFixture({
      active: async () => activeSessionInit({ resolution: "single", path: ".arc/active/meta-work.md", sessionType: "execution" }),
      ...(id === "base-sync:pull" ? { baseBranchSync: async () => baseBranchSync({ state: "remote-ahead", behind: 3 }) } : {}),
      ...(id === "user-references:apply" ? { userReferenceReconcile: async () => references } : {}),
    }));
    value.answers.done.push(id);
    expect(compileSyncPrefix(value)).toEqual([]);
    expect(compileSyncState(value).unsettled).toMatchObject([{ type: "note", surface: "sync-unsettled", text: expect.stringContaining(id) }]);
  });

  it("marks pending offers and skipped row channels unsynced", async () => {
    const value = await prompted();
    expect(compileSyncState(value).unsynced.has("worktree:pull")).toBe(true);
    expect(compileSyncState(value, "none").unsynced.has("worktree:pull")).toBe(true);
  });

  it("marks manual policies unsynced", async () => {
    const config = configSessionInit();
    config.settings["session.init_pull.worktree"] = "manual";
    config.settings["session.init_pull.base"] = "manual";
    const value = createAgendaFixtureInput(await sessionInitFixture({ config: async () => config }));
    expect([...compileSyncState(value).unsynced]).toEqual(expect.arrayContaining(["worktree:pull", "base-sync:pull"]));
  });

  it("does not mark channels settled by this session unsynced", async () => {
    const value = createAgendaFixtureInput(await sessionInitFixture());
    value.answers = { answered: { "worktree:pull": "accept" }, done: ["base-sync:pull"] };
    expect([...compileSyncState(value, "none").unsynced]).toEqual([]);
    expect(compileSyncState(value).unsettled).toEqual([]);
  });
});
