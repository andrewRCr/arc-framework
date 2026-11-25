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
  it.each(["worktree:pull", "notes:pull"])("prunes the answered %s channel before combining offers", async id => {
    const value = await prompted();
    value.answers.answered[id] = "decline";
    const other = id === "worktree:pull" ? "notes:pull" : "worktree:pull";
    const steps = compileSyncPrefix(value);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ type: "offer", id: other });
    if (steps[0]?.type !== "offer") throw new Error("Expected remaining channel offer");
    expect(steps[0].text).toBe(other === "notes:pull"
      ? value.envelope.user.ok && value.envelope.user.value !== null && "state" in value.envelope.user.value
        ? value.envelope.user.value.recommendedPromptText : "invalid fixture"
      : value.envelope.worktree.ok ? value.envelope.worktree.value.recommendedPromptText : "invalid fixture");
  });

  it("omits a fully answered pair and reports an accepted but still pending pull", async () => {
    const value = await prompted();
    value.answers.answered = { "worktree:pull": "accept", "notes:pull": "accept" };
    expect(compileSyncPrefix(value)).toEqual([]);
    expect(compileSyncState(value).unsettled).toEqual(expect.arrayContaining([
      { type: "note", surface: "sync-unsettled", text: expect.stringContaining("worktree:pull") },
      { type: "note", surface: "sync-unsettled", text: expect.stringContaining("notes:pull") },
    ]));
    expect(compileSyncState(value).unsettled).toHaveLength(2);
    expect([...compileSyncState(value).unsynced]).toEqual(expect.arrayContaining(["worktree:pull", "notes:pull"]));
  });

  it.each(["done", "declined"])("never repeats an automatic notes pull recorded as %s", async record => {
    const config = configSessionInit(); config.settings["session.init_pull.notes"] = "always";
    const value = createAgendaFixtureInput(await sessionInitFixture({ config: async () => config,
      user: async () => userSessionInit({ state: "remote-ahead", refState: "remote-ahead", shouldPromptToPull: true }),
    }));
    if (record === "done") value.answers.done.push("notes:pull");
    else value.answers.answered["notes:pull"] = "decline";
    expect(compileSyncPrefix(value)).toEqual([]);
    expect(compileSyncState(value).unsettled).toHaveLength(record === "done" ? 1 : 0);
    expect(compileSyncState(value).unsynced.has("notes:pull")).toBe(true);
  });

  it.each(["notes:load", "base-sync:pull", "user-references:apply"])("omits a completed %s before constructing it", async id => {
    const references = projectUserReferenceSessionResult({ status: "ready", ref: "main", remoteEvidence: "exact",
      transitions: [{ subject: "before", outcome: { kind: "rename", targetSlug: "after" } }],
    }, { userInbox: { path: "USER-INBOX.md",
      content: "# User Inbox\n\n## Work Unit\n\n### `[ ]` **Concern**\n\n- _WU_Target:_ `before`\n" } }, "/repo");
    const value = createAgendaFixtureInput(await sessionInitFixture({
      active: async () => activeSessionInit({ resolution: "single", path: ".arc/active/meta-work.md", sessionType: "execution" }),
      ...(id === "notes:load" ? { user: async () => userSessionInit({ loadNeeded: true }) } : {}),
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
    expect(compileSyncState(value, "notes").unsynced.has("worktree:pull")).toBe(true);
  });

  it("marks manual policies unsynced", async () => {
    const config = configSessionInit();
    config.settings["session.init_pull.worktree"] = "manual";
    config.settings["session.init_pull.notes"] = "manual";
    config.settings["session.init_load.notes"] = "manual";
    config.settings["session.init_pull.base"] = "manual";
    const value = createAgendaFixtureInput(await sessionInitFixture({ config: async () => config }));
    expect([...compileSyncState(value).unsynced]).toEqual(expect.arrayContaining([
      "worktree:pull", "notes:pull", "notes:load", "base-sync:pull",
    ]));
  });

  it("does not mark channels settled by this session unsynced", async () => {
    const value = createAgendaFixtureInput(await sessionInitFixture());
    value.answers = { answered: { "worktree:pull": "accept" }, done: ["notes:pull", "notes:load", "base-sync:pull"] };
    expect([...compileSyncState(value, "notes").unsynced]).toEqual([]);
    expect(compileSyncState(value).unsettled).toEqual([]);
  });
});
