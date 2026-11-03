/** Branch-gone entry compiles only the recovery actions its evidence permits. */
import { describe, expect, it } from "vitest";
import { compileSessionInitAgenda } from "../../../src/commands/agenda/compile.js";
import { assertSessionInitAgenda, type SessionInitAgenda } from "../../../src/commands/agenda/schema.js";
import type { AgendaCompileInput } from "../../../src/commands/agenda/compile-input.js";
import { resolveCascade } from "../../../src/lib/session-init/branch-gone-cascade.js";
import { createRecoveryAgendaFixture as input } from "../../helpers/agenda-recovery-fixtures.js";

const candidate = { branch: "feat/recover", proposedAction: "switch" } as const;
async function compile(value: AgendaCompileInput): Promise<SessionInitAgenda> {
  const result = await compileSessionInitAgenda(value);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error("Expected a compiled recovery");
  assertSessionInitAgenda(result.agenda);
  return result.agenda;
}

describe("branch-gone recovery agenda", () => {
  it("switches a free resolved destination and carries its execution into the recompile", async () => {
    const agenda = await compile(await input({ kind: "resolved", remoteEvidence: "exact", candidate }));
    expect(agenda.steps).toEqual([{ type: "exec", id: "branch-gone:resolved", actions: [
      { argv: ["git", "switch", "--", candidate.branch], text: `git switch -- ${candidate.branch}` },
    ], then: { kind: "recompile", argv: ["arc", "agenda", "session-init", "--json", "--done", "branch-gone:resolved"] } }]);
  });

  it("offers rather than automatically switching on a dirty tree", async () => {
    const value = await input({ kind: "resolved", remoteEvidence: "exact", candidate }, true);
    const agenda = await compile(value);
    expect(agenda.steps).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: "exec" })]));
    expect(agenda.steps).toEqual(expect.arrayContaining([{
      type: "offer", id: "branch-gone:resolved", ask: "now",
      text: value.envelope.recovery?.ok ? value.envelope.recovery.value.recommendedPromptText : "invalid fixture",
      choices: [
        { kind: "actions", label: `Switch to ${candidate.branch}`, accepts: ["branch-gone:resolved"], actions: [
          { argv: ["git", "switch", "--", candidate.branch], text: `git switch -- ${candidate.branch}` },
        ], then: { kind: "recompile", argv: ["arc", "agenda", "session-init", "--json", "--answered", "branch-gone:resolved=accept"] } },
        { kind: "bare", label: "Stay here", decline: true },
      ],
    }]));
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "stop", autoProceed: false });
  });


  it("offers continuation in an occupied destination without a switch action", async () => {
    const path = "/wt/recover elsewhere";
    const agenda = await compile(await input({ kind: "resolved", remoteEvidence: "exact",
      candidate: { ...candidate, worktreePath: path } }, true));
    expect(agenda.steps).toEqual(expect.arrayContaining([expect.objectContaining({
      type: "offer", id: "branch-gone:resolved", choices: [
        { kind: "bare", label: `Continue in checkout ${path}` },
        { kind: "bare", label: "Stay here", decline: true },
      ],
    })]));
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "stop", autoProceed: false });
  });


  it("offers the published removable-worktree teardown and records no answer", async () => {
    const value = await input({ kind: "resolved", remoteEvidence: "exact", candidate: {
      proposedAction: "removable", branch: "feat/old", worktreePath: "/wt/old", workUnitName: "old",
    } });
    const agenda = await compile(value);
    expect(agenda.steps).toEqual(expect.arrayContaining([expect.objectContaining({
      type: "offer", id: "branch-gone:resolved", ask: "now", choices: [
        { kind: "actions", label: "arc teardown old", accepts: ["branch-gone:resolved"], actions: [
          { argv: ["arc", "teardown", "old"], text: "arc teardown old" },
        ], then: { kind: "recompile", argv: ["arc", "agenda", "session-init", "--json"] } },
        { kind: "bare", label: "Stay here", decline: true },
      ],
    })]));
  });


  it("offers each ambiguous local candidate by its published disposition", async () => {
    const agenda = await compile(await input({ kind: "surface", remoteEvidence: "exact", candidates: [
      { ...candidate, worktreePath: "/wt/recover" },
      { proposedAction: "removable", branch: "feat/old", worktreePath: "/wt/old", workUnitName: "old" },
      { proposedAction: "external", branch: "feat/external", worktreePath: "/wt/external" },
    ] }));
    expect(agenda.steps).toEqual(expect.arrayContaining([expect.objectContaining({
      type: "offer", id: "branch-gone:surface", ask: "now", choices: [
        { kind: "bare", label: "Continue in checkout /wt/recover" },
        { kind: "actions", label: "arc teardown old", accepts: ["branch-gone:surface"], actions: [
          { argv: ["arc", "teardown", "old"], text: "arc teardown old" },
        ], then: { kind: "recompile", argv: ["arc", "agenda", "session-init", "--json"] } },
        { kind: "bare", label: "Recover manually in checkout /wt/external" },
        { kind: "bare", label: "Stay here", decline: true },
      ],
    })]));
  });

  it("offers each proven free recent branch as a separate switch choice", async () => {
    const branches = [candidate.branch, "feat/other"];
    const agenda = await compile(await input({ kind: "surface", remoteEvidence: "exact", candidates:
      branches.map(branch => ({ branch, proposedAction: "switch" })) }));
    const offer = agenda.steps.find(step => step.type === "offer");
    expect(offer).toMatchObject({ type: "offer", id: "branch-gone:surface", ask: "now" });
    if (offer?.type !== "offer") throw new Error("Expected a recovery offer");
    expect(offer.choices).toEqual([
      ...branches.map(branch => ({ kind: "actions", label: `Switch to ${branch}`, accepts: ["branch-gone:surface"],
        actions: [{ argv: ["git", "switch", "--", branch], text: `git switch -- ${branch}` }],
        then: { kind: "recompile", argv: ["arc", "agenda", "session-init", "--json", "--answered", "branch-gone:surface=accept"] },
      })),
      { kind: "bare", label: "Stay here", decline: true },
    ]);
  });


  it("offers a free base fallback with its own recovery question", async () => {
    const agenda = await compile(await input({ kind: "main-fallback", remoteEvidence: "exact", baseBranch: "main" }));
    expect(agenda.steps).toEqual(expect.arrayContaining([expect.objectContaining({
      type: "offer", id: "branch-gone:main-fallback", ask: "now", choices: [
        { kind: "actions", label: "Switch to main", accepts: ["branch-gone:main-fallback"], actions: [
          { argv: ["git", "switch", "--", "main"], text: "git switch -- main" },
        ], then: { kind: "recompile", argv: ["arc", "agenda", "session-init", "--json", "--answered", "branch-gone:main-fallback=accept"] } },
        { kind: "bare", label: "Stay here", decline: true },
      ],
    })]));
  });


  it("offers only the published refresh while advertised branch evidence is pending", async () => {
    const pending = resolveCascade({ worktreeCandidates: [], recentBranchCandidates: [candidate],
      pendingBranchCount: 1, baseBranch: "main", evidence: { remoteEvidence: "pending-fetch" } });
    const agenda = await compile(await input(pending));
    expect(agenda.steps).toEqual(expect.arrayContaining([expect.objectContaining({
      type: "offer", id: "branch-gone:pending", ask: "now", choices: [
        { kind: "actions", label: "Refresh live in-flight branch evidence.", accepts: ["branch-gone:pending"], actions: [
          { argv: ["arc", "active", "in-flight", "--json"], text: "Refresh live in-flight branch evidence." },
        ], then: { kind: "recompile", argv: ["arc", "agenda", "session-init", "--json", "--answered", "branch-gone:pending=accept"] } },
        { kind: "bare", label: "Stay here", decline: true },
      ],
    })]));
  });

});
