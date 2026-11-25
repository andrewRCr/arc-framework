/** Entry synchronization uses published recommendations and literal actions. */

import { describe, expect, it } from "vitest";
import { activeSessionInit, baseBranchSync, configSessionInit, sessionInitFixture, supersessionResult, userSessionInit, worktreeSync } from "../../helpers/session-init-fixtures.js";
import { projectUserReferenceSessionResult } from "../../../src/lib/user-reference-reconcile.js";
import { createAgendaFixtureInput } from "../../helpers/agenda-fixtures.js";
import { compileSyncPrefix } from "../../../src/commands/agenda/prefix.js";
import type { AgendaCompileInput } from "../../../src/commands/agenda/compile-input.js";
import type { SessionInitProbeResult } from "../../../src/commands/status.js";

function input(envelope: SessionInitProbeResult): AgendaCompileInput {
  return createAgendaFixtureInput(envelope, { signals: { seed: "source" },
    answers: { answered: { "old:question": "decline" }, done: ["old:exec"] } });
}

describe("agenda synchronization prefix", () => {
  it("offers the worktree's published prompt and recompiles after its literal pull", async () => {
    const envelope = await sessionInitFixture({ worktree: async () => worktreeSync({ state: "remote-ahead", behind: 2 }) });
    if (!envelope.worktree.ok) throw new Error("Expected a healthy worktree fixture");
    expect(compileSyncPrefix(input(envelope))).toEqual([{
      type: "offer", id: "worktree:pull", ask: "now", text: envelope.worktree.value.recommendedPromptText,
      choices: [{ kind: "actions", label: expect.any(String), accepts: ["worktree:pull"],
        actions: [{ text: "git pull --ff-only", argv: ["git", "pull", "--ff-only"] }],
        then: { kind: "recompile", argv: ["arc", "agenda", "session-init", "--json", "source",
          "--answered", "old:question=decline", "--answered", "worktree:pull=accept", "--done", "old:exec"] } },
      { kind: "bare", label: expect.any(String), decline: true }],
    }]);
  });

  it("emits no worktree step for a quiet recommendation", async () => {
    expect(compileSyncPrefix(input(await sessionInitFixture()))).toEqual([]);
  });

  it("runs only notes channels on an explicit-intent row", async () => {
    const envelope = await sessionInitFixture({ worktree: async () => worktreeSync({ state: "remote-ahead", behind: 2 }) });
    expect(compileSyncPrefix(input(envelope), "notes")).toEqual([]);
  });

  it("keeps a base-sync prompt separate after a worktree offer", async () => {
    const envelope = await sessionInitFixture({
      worktree: async () => worktreeSync({ state: "remote-ahead", behind: 2 }),
      baseBranchSync: async () => baseBranchSync({ state: "remote-ahead", behind: 3 }),
    });
    const steps = compileSyncPrefix(input(envelope));
    expect(steps.map(step => "id" in step ? step.id : step.type)).toEqual(["worktree:pull", "base-sync:pull"]);
    if (!envelope.baseBranchSync.ok) throw new Error("Expected a healthy base fixture");
    expect(steps[1]).toMatchObject({ type: "offer", ask: "now", text: envelope.baseBranchSync.value.recommendedPromptText,
      choices: [{ kind: "actions", accepts: ["base-sync:pull"],
        actions: [{ argv: ["git", "fetch", "origin", "main:main"] }], then: { kind: "recompile" } },
      { kind: "bare", decline: true }],
    });
  });

  it("ends at the automatic base sync before an otherwise prompted worktree", async () => {
    const config = configSessionInit();
    config.settings["session.init_pull.base"] = "always";
    const envelope = await sessionInitFixture({ config: async () => config,
      worktree: async () => worktreeSync({ state: "remote-ahead", behind: 2 }),
      baseBranchSync: async () => baseBranchSync({ state: "remote-ahead", behind: 3 }),
    });
    expect(compileSyncPrefix(input(envelope))).toEqual([{
      type: "exec", id: "base-sync:pull", actions: [{ text: expect.any(String), argv: ["git", "fetch", "origin", "main:main"] }],
      then: { kind: "recompile", argv: ["arc", "agenda", "session-init", "--json", "source",
        "--answered", "old:question=decline", "--done", "old:exec", "--done", "base-sync:pull"] },
    }]);
  });


  it("applies the published user-reference command after all sync offers and recompiles", async () => {
    const references = projectUserReferenceSessionResult({ status: "ready", ref: "main", remoteEvidence: "exact",
      transitions: [{ subject: "before", outcome: { kind: "rename", targetSlug: "after" } }],
    }, { userInbox: { path: "USER-INBOX.md",
      content: "# User Inbox\n\n## Work Unit\n\n### `[ ]` **Concern**\n\n- _WU_Target:_ `before`\n" } }, "/repo");
    const envelope = await sessionInitFixture({
      active: async () => activeSessionInit({ resolution: "single", path: ".arc/active/meta-work.md", sessionType: "execution" }),
      userReferenceReconcile: async () => references,
      worktree: async () => worktreeSync({ state: "remote-ahead", behind: 2 }),
      baseBranchSync: async () => baseBranchSync({ state: "remote-ahead", behind: 3 }),
    });
    const steps = compileSyncPrefix(input(envelope));
    expect(steps.map(step => "id" in step ? step.id : step.type))
      .toEqual(["worktree:pull", "base-sync:pull", "user-references:apply"]);
    expect(steps.at(-1)).toMatchObject({ type: "exec", id: "user-references:apply",
      actions: [{ argv: references.recommendedCommand, text: "arc user reconcile-references --apply --json", checkout: "/repo" }],
      then: { kind: "recompile", argv: expect.arrayContaining(["--done", "user-references:apply"]) },
    });
  });


  it.each(["pull", "load"] as const)("ends at an automatic notes %s before base synchronization", async action => {
    const config = configSessionInit();
    config.settings["session.init_pull.notes"] = "always";
    config.settings["session.init_load.notes"] = "always";
    config.settings["session.init_pull.base"] = "always";
    const envelope = await sessionInitFixture({ config: async () => config,
      user: async () => userSessionInit(action === "pull"
        ? { state: "remote-ahead", refState: "remote-ahead", shouldPromptToPull: true }
        : { state: "clean", refState: "same", loadNeeded: true }),
      baseBranchSync: async () => baseBranchSync({ state: "remote-ahead", behind: 3 }),
    });
    expect(compileSyncPrefix(input(envelope))).toMatchObject([{
      type: "exec", id: `notes:${action}`, actions: [{ argv: ["arc", "user", action] }], then: { kind: "recompile" },
    }]);
    expect(compileSyncPrefix(input(envelope))).toHaveLength(1);
  });


  it("orders superseded reset, notes load, and base offers when no automatic sync is pending", async () => {
    const envelope = await sessionInitFixture({
      worktree: async () => worktreeSync({ state: "diverged", ahead: 1, behind: 2, branch: "feat/work" }),
      supersession: async () => supersessionResult({ superseded: true, supersededCommits: ["a".repeat(40)] }),
      user: async () => userSessionInit({ loadNeeded: true }),
      baseBranchSync: async () => baseBranchSync({ state: "remote-ahead", behind: 3 }),
    });
    const steps = compileSyncPrefix(input(envelope));
    expect(steps.map(step => "id" in step ? step.id : step.type))
      .toEqual(["superseded:reset", "notes:load", "base-sync:pull"]);
    expect(steps[0]).toMatchObject({ type: "offer", ask: "now",
      choices: [{ kind: "actions", actions: [{ argv: ["git", "reset", "--hard", "origin/feat/work"] }],
        then: { kind: "recompile" } }, { kind: "bare", decline: true }],
    });
    expect(steps.every(step => step.type === "offer")).toBe(true);
  });


  it.each(["pull", "load"] as const)("combines worktree pull with notes %s under one recompile", async action => {
    const envelope = await sessionInitFixture({
      worktree: async () => worktreeSync({ state: "remote-ahead", behind: 2 }),
      user: async () => userSessionInit(action === "pull"
        ? { state: "remote-ahead", refState: "remote-ahead", shouldPromptToPull: true }
        : { loadNeeded: true }),
    });
    const steps = compileSyncPrefix(input(envelope));
    expect(steps).toHaveLength(1);
    const offer = steps[0];
    expect(offer).toMatchObject({ type: "offer", ask: "now", id: `worktree:pull+notes:${action}` });
    if (offer?.type !== "offer" || !envelope.worktree.ok) throw new Error("Expected a combined offer");
    const expectedText = action === "pull" ? envelope.recommendedCombinedPrompt
      : `${envelope.worktree.value.recommendedPromptText}\nNotes: local notes are current but disk lags the latest note. Load?`;
    expect(offer.text).toBe(expectedText);
    expect(offer.choices).toHaveLength(4);
    const actions = offer.choices.filter(choice => choice.kind === "actions");
    expect(actions).toHaveLength(3);
    expect(actions.map(choice => choice.accepts)).toEqual(action === "pull"
      ? [["worktree:pull", `notes:${action}`], ["worktree:pull"], [`notes:${action}`]]
      : [["worktree:pull"], [`notes:${action}`], ["worktree:pull", `notes:${action}`]]);
    for (const choice of actions) {
      const worktreeAccepted = choice.accepts.includes("worktree:pull");
      const notesAccepted = choice.accepts.includes(`notes:${action}`);
      expect(choice.actions.map(command => command.argv)).toEqual([
        ...(worktreeAccepted ? [["git", "pull", "--ff-only"]] : []),
        ...(notesAccepted ? [["arc", "user", action]] : []),
      ]);
      expect(choice.then).toEqual({ kind: "recompile", argv: ["arc", "agenda", "session-init", "--json", "source",
        "--answered", "old:question=decline", "--answered", `worktree:pull=${worktreeAccepted ? "accept" : "decline"}`,
        "--answered", `notes:${action}=${notesAccepted ? "accept" : "decline"}`, "--done", "old:exec"] });
    }
    expect(offer.choices.filter(choice => choice.kind === "bare"))
      .toEqual([{ kind: "bare", label: expect.any(String), decline: true }]);
  });

  it("keeps the base prompt separate beside a combined worktree/notes offer", async () => {
    const envelope = await sessionInitFixture({
      worktree: async () => worktreeSync({ state: "remote-ahead", behind: 2 }),
      user: async () => userSessionInit({ state: "remote-ahead", refState: "remote-ahead", shouldPromptToPull: true }),
      baseBranchSync: async () => baseBranchSync({ state: "remote-ahead", behind: 3 }),
    });
    expect(compileSyncPrefix(input(envelope)).map(step => "id" in step ? step.id : step.type))
      .toEqual(["worktree:pull+notes:pull", "base-sync:pull"]);
  });

});
