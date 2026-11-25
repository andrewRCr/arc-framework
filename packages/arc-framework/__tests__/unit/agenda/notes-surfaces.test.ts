/** Notes attention surfaces retain current facts without executing advisory commands. */
import { describe, expect, it } from "vitest";
import { createAgendaFixtureInput } from "../../helpers/agenda-fixtures.js";
import { activeSessionInit, configSessionInit, sessionInitFixture, userSessionInit, type SessionInitProbeOverrides } from "../../helpers/session-init-fixtures.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { compileNotesOrientation } from "../../../src/commands/agenda/notes.js";
import { orderOrientationSurfaces } from "../../../src/commands/agenda/orientation.js";
import { compileSyncState } from "../../../src/commands/agenda/sync-state.js";
import type { AgendaCompileInput } from "../../../src/commands/agenda/compile-input.js";
import type { AgendaSyncState } from "../../../src/commands/agenda/sync-state.js";

async function input(probes: SessionInitProbeOverrides = {}, policy: "manual" | "prompt" = "prompt"): Promise<AgendaCompileInput> {
  const config = configSessionInit(); config.settings["session.init_load.notes"] = policy;
  return createAgendaFixtureInput(await sessionInitFixture({ config: async () => config,
    active: async () => activeSessionInit({ resolution: "single", path: ".arc/active/meta-work.md", sessionType: "execution" }), ...probes,
  }));
}
function render(value: AgendaCompileInput, sync: AgendaSyncState = compileSyncState(value)) {
  return orderOrientationSurfaces(compileNotesOrientation(value, sync));
}
const retired = async () => ({ candidates: [SlugSchema.parse("shipped")] });

describe("agenda notes orientation", () => {
  it("renders both pending load and retired subdirectories under manual policy", async () => {
    const value = await input({ user: async () => userSessionInit({ loadNeeded: true }), retiredSubdirs: retired }, "manual");
    const steps = render(value);
    expect(steps.map(step => step.type === "render" ? step.surface : step.type)).toEqual(["notes-load-pending", "retired-subdirs"]);
    expect(steps[0]).toMatchObject({ text: expect.stringContaining("arc user load") });
    expect(steps[1]).toMatchObject({ text: expect.stringContaining("`shipped`") });
    expect(steps.every(step => step.type === "render")).toBe(true);
  });

  it.each(["disk lag", "retired subdirectories"])("retains %s after a declined prompted load", async concern => {
    const value = await input(concern === "disk lag" ? { user: async () => userSessionInit({ loadNeeded: true }) } : { retiredSubdirs: retired });
    value.answers.answered["notes:load"] = "decline";
    expect(render(value)).toEqual([expect.objectContaining({ type: "render", surface: concern === "disk lag" ? "notes-load-pending" : "retired-subdirs" })]);
  });

  it("retains retired reconciliation after a declined notes pull", async () => {
    const value = await input({ user: async () => userSessionInit({ state: "remote-ahead", refState: "remote-ahead", shouldPromptToPull: true }), retiredSubdirs: retired });
    value.answers.answered["notes:pull"] = "decline";
    const steps = render(value);
    expect(steps).toEqual(expect.arrayContaining([{ type: "render", surface: "retired-subdirs", text: expect.stringContaining("arc user load") }]));
    expect(steps.some(step => step.type === "exec" || step.type === "offer")).toBe(false);
  });

  it.each(["local-subset", "equal", "mixed-uncontested"] as const)("renders non-contested %s divergence as reconciling", async contentRelation => {
    const value = await input({ user: async () => userSessionInit({ state: "conflict", refState: "diverged", contentRelation,
      summary: "Notes diverged without a contested entry", detailLines: [] }) });
    expect(render(value)).toEqual([{ type: "render", surface: "notes-reconciling",
      text: "**Notes reconciling:** local and remote notes diverged without contested entries; expected residue will reconcile at the next paired push. No pull action is needed." }]);
  });

  it("retains the summary and detail lines of contested notes", async () => {
    const value = await input({ user: async () => userSessionInit({ state: "conflict", refState: "diverged", contentRelation: "conflicting",
      summary: "Contested notes", detailLines: ["First contested entry", "Second contested entry"] }) });
    expect(render(value)).toEqual([{ type: "render", surface: "notes-conflict", text: "Contested notes\nFirst contested entry\nSecond contested entry" }]);
  });

  it.each(["local-ahead", "remote-subset"] as const)("renders local-ahead notes for %s", async relation => {
    const value = await input({ user: async () => userSessionInit(relation === "local-ahead" ? { refState: "local-ahead" }
      : { refState: "diverged", contentRelation: "remote-subset" }) });
    expect(render(value)).toEqual([{ type: "render", surface: "local-ahead-notes",
      text: "**Local-ahead notes:** local user-notes ref is ahead of remote. Push (or `arc sync`) when ready; non-blocking." }]);
  });

  it("renders behind notes only while their pull channel is unsynced", async () => {
    const value = await input({ user: async () => userSessionInit({ state: "remote-ahead", refState: "remote-ahead", shouldPromptToPull: true, summary: "Remote notes are ahead" }) });
    expect(render(value)).toEqual([{ type: "render", surface: "notes-behind", text: "Remote notes are ahead" }]);
    expect(render(value, { unsettled: [], unsynced: new Set() })).toEqual([]);
  });

  it("renders the remote-unavailable notes summary", async () => {
    const value = await input({ user: async () => userSessionInit({ state: "remote-unavailable", refState: "remote-unavailable", summary: "Notes remote unavailable" }) });
    expect(render(value)).toEqual([{ type: "render", surface: "notes-remote-unavailable", text: "Notes remote unavailable" }]);
  });

  it.each(["expected", "caution"] as const)("renders notes/disk drift in its %s register", async register => {
    const drift = register === "expected" ? { direction: "mixed" as const, missingFiles: [], extraFiles: ["work/SESSION-NOTES.md"], modifiedFiles: ["USER-INBOX.md"] }
      : { direction: "missing" as const, missingFiles: ["work/SESSION-NOTES.md", "other/SESSION-NOTES.md"], extraFiles: [], modifiedFiles: [] };
    const value = await input({ user: async () => userSessionInit({ refState: "same", notesDrift: drift }) });
    expect(render(value)).toEqual([{ type: "render", surface: "notes-drift", text: register === "expected"
      ? "**Notes/disk drift:** expected with live sibling sessions or a fresh seed (mixed); converges at next save or handoff — lag, not loss."
      : "**Notes/disk drift:** on-disk user files diverge from the latest note (missing); inspect with `arc user status` before relying on session notes — no auto-load (may carry local edits)." }]);
  });

  it("renders notes lag and the compaction nudge with its exact marker", async () => {
    const value = await input({ partialPushMarker: async () => ({ markers: [{ machineId: "laptop", lastAttemptedCommit: "b".repeat(40), attemptTimestamp: "2026-11-01T00:00:00Z" }] }),
      compactionAdvisory: async () => ({ historyCommitCount: 501, threshold: 500, shouldSuggest: true,
        nudge: { shouldNudge: true, markerPath: ".arc/user/andrew/.internal/compact", today: "2026-11-01" } }),
    });
    const steps = render(value);
    expect(steps.map(step => step.type === "render" ? step.surface : step.type)).toEqual(["notes-lag", "notes-compaction"]);
    expect(steps[0]).toMatchObject({ text: expect.stringContaining("`bbbbbbbbbb` attempted 2026-11-01T00:00:00Z by machine `laptop`") });
    expect(steps[1]).toMatchObject({ text: "**Notes compaction:** user-notes history has 501 commit(s) (threshold 500); run `arc user compact` when ready.",
      marker: { path: ".arc/user/andrew/.internal/compact", value: "2026-11-01" } });
    expect(steps.every(step => step.type === "render")).toBe(true);
  });

  it.each(["below threshold", "already nudged"])("omits compaction when %s", async condition => {
    const value = await input({ compactionAdvisory: async () => ({ historyCommitCount: condition === "below threshold" ? 500 : 501, threshold: 500,
      shouldSuggest: condition !== "below threshold", nudge: { shouldNudge: condition !== "already nudged", markerPath: ".arc/user/andrew/.internal/compact", today: "2026-11-01" } }) });
    expect(render(value)).toEqual([]);
  });
});
