/** Checkout state renders use probe facts and the path's unsynced decisions. */
import { describe, expect, it } from "vitest";
import { createAgendaFixtureInput, forRow, workUnitRow } from "../../helpers/agenda-fixtures.js";
import { baseBranchSync, baseDistance, configSessionInit, dirtyState, passiveWorktreeSync, sessionInitFixture, worktreeSync, type SessionInitProbeOverrides } from "../../helpers/session-init-fixtures.js";
import { compileCheckoutOrientation } from "../../../src/commands/agenda/checkout.js";
import { orderOrientationSurfaces } from "../../../src/commands/agenda/orientation.js";
import { compileSyncState } from "../../../src/commands/agenda/sync-state.js";
import type { AgendaCompileInput } from "../../../src/commands/agenda/compile-input.js";
import type { AgendaSyncState } from "../../../src/commands/agenda/sync-state.js";

async function input(probes: SessionInitProbeOverrides = {}): Promise<AgendaCompileInput> {
  return createAgendaFixtureInput(await sessionInitFixture(probes));
}
function render(value: AgendaCompileInput, sync: AgendaSyncState = compileSyncState(value)) {
  return orderOrientationSurfaces(compileCheckoutOrientation(value, sync));
}

describe("agenda checkout orientation", () => {
  it.each([
    { value: { state: "diverged", ahead: 2, behind: 3 }, id: "worktree-diverged", text: "**Reconcile required:** `feat/work` diverged from `origin/feat/work` (2 ahead, 3 behind).\nManual rebase or merge needed before pushing. Carried forward — commit/push requests will be flagged." },
    { value: { state: "local-ahead", ahead: 2 }, id: "local-ahead", text: "**Local-ahead:** 2 unpushed commit(s) on `feat/work`." },
    { value: { state: "no-upstream" }, id: "no-upstream", text: "**New branch:** `feat/work` has no upstream — will be set on first push." },
    { value: { state: "detached-head", branch: null }, id: "detached-head", text: "**Detached HEAD:** check out a branch before push/sync." },
    { value: { state: "no-remote" }, id: "no-remote", text: "**No remote:** `origin` not configured. Set up a remote before push/sync." },
  ] as const)("renders $id from its worktree state", async ({ value, id, text }) => {
    const result = render(await input({ worktree: async () => worktreeSync({ branch: "feat/work", ...value }) }));
    expect(result).toEqual([{ type: "render", surface: id, text }]);
  });

  it("renders a behind worktree only while that channel is unsynced", async () => {
    const value = await input({ worktree: async () => worktreeSync({ state: "remote-ahead", behind: 3 }) });
    expect(render(value)).toEqual([{ type: "render", surface: "worktree-behind", text: expect.stringMatching(/3.*pull when ready/u) }]);
    expect(render(value, { unsettled: [], unsynced: new Set() })).toEqual([]);
  });

  it.each(["unreachable", "pending-fetch"] as const)("distinguishes %s worktree evidence", async evidence => {
    const value = await input({ worktree: async () => passiveWorktreeSync({ state: "remote-unavailable", ...(evidence === "unreachable" ? { failureReason: "network" } : {}) }) });
    expect(render(value)).toEqual([{ type: "render", surface: "worktree-remote-unavailable",
      text: expect.stringContaining(evidence === "unreachable" ? "network" : "origin advanced to a commit not yet present locally") }]);
  });

  it("suppresses detached-head while a current husk is available to render", async () => {
    const value = createAgendaFixtureInput(await forRow(workUnitRow(false, true), "present"));
    expect(render(value)).toEqual([]);
  });

  it("keeps worktree, base drift and dirty surfaces in table order", async () => {
    const value = await input({ worktree: async () => worktreeSync({ state: "local-ahead", ahead: 2 }),
      baseDistance: async () => baseDistance({ verdict: "reconcile", state: "diverged", ahead: 1, behind: 3,
        register: { kind: "calm", text: "Base changed; inspect advisory." } }),
      dirty: async () => dirtyState({ state: "dirty", fileCount: 4 }),
    });
    const base = value.envelope.baseDistance;
    if (!base.ok) throw new Error("Expected base-distance facts");
    const steps = render(value);
    expect(steps.map(step => step.type === "render" ? step.surface : step.type)).toEqual(["local-ahead", "base-drift", "dirty"]);
    expect(steps[1]).toEqual({ type: "render", surface: "base-drift", text: base.value.recommendedPromptText });
    expect(steps[2]).toEqual({ type: "render", surface: "dirty", text: "**Uncommitted changes:** 4 file(s) dirty in working tree." });
  });

  it.each(["manual", "prompt"] as const)("renders stale base under %s without a question or action", async policy => {
    const config = configSessionInit(); config.settings["session.init_pull.base"] = policy;
    const value = await input({ config: async () => config, baseBranchSync: async () => baseBranchSync({ state: "remote-ahead", behind: 3 }) });
    expect(render(value)).toEqual([{ type: "render", surface: "stale-base", text: "Local base `main` is behind `origin/main` by 3 commit(s) — fast-forward available." }]);
    if (policy === "prompt") expect(render(value, { unsettled: [], unsynced: new Set() })).toEqual([]);
  });

  it("retains an explicit base refresh remedy only as text", async () => {
    const value = await input({ baseBranchSync: async () => baseBranchSync({ state: "remote-unavailable", remoteEvidence: "pending-fetch",
      unavailableReason: "base-object-pending-fetch", refreshRemedy: { text: "Refresh the base explicitly.", argv: ["arc", "base", "sync", "--json"] },
    }) });
    const base = value.envelope.baseBranchSync;
    if (!base.ok) throw new Error("Expected base-sync facts");
    expect(render(value)).toEqual([{ type: "render", surface: "stale-base", text: base.value.recommendedPromptText }]);
    expect(render(value).some(step => step.type === "offer" || step.type === "exec")).toBe(false);
  });
});
