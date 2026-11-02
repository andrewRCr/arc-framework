/** Cleanup orientation retains published authorization and outside-checkout boundaries. */
import { describe, expect, it } from "vitest";
import { createAgendaFixtureInput, frameWithRow, workUnitRow } from "../../helpers/agenda-fixtures.js";
import { sessionInitFixture, worktreeSync } from "../../helpers/session-init-fixtures.js";
import { StaleWorktreeSweepResultSchema } from "../../../src/lib/session-init/stale-worktree-sweep-schema.js";
import type { StaleWorktreeSweepResult } from "../../../src/lib/session-init/stale-worktree-sweep.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import type { OrphanBranchReport } from "../../../src/lib/session-init/orphan-branch-sweep.js";
import { missingRegistrationActions } from "../../../src/lib/session-init/missing-worktree-folders.js";
import { projectRenameMoveRemedy } from "../../../src/lib/session-init/lifecycle-residue-sweep.js";
import { projectSuccessorReadiness } from "../../../src/lib/work-unit/retirement-lifecycle-result.js";
import { deriveCurrentHuskAdvisory } from "../../../src/lib/session-init/current-husk-advisory.js";
import { compileCleanupOrientation } from "../../../src/commands/agenda/cleanup.js";
import { orderOrientationSurfaces } from "../../../src/commands/agenda/orientation.js";
import { type AgendaStep } from "../../../src/commands/agenda/schema.js";
import type { WorktreeMarkerReadResult } from "../../../src/lib/git/worktree-marker.js";

async function huskInput(kind: "current" | "legacy" | "manual-only", primary = true) {
  const original = workUnitRow(false, true);
  const row = { ...original, checkout: { ...original.checkout, path: "/repo/work" } };
  const base = frameWithRow(row);
  const frame = primary ? base : { ...base, roster: [row], primaryAvailability: { kind: "unsafe" as const, checkoutPath: null, reasons: ["primary is unavailable"] } };
  const marker: WorktreeMarkerReadResult = { kind: "present", marker: { spawnedByArc: true, wuName: "work",
    spawningIdentity: "andrew", createdAt: "2026-11-01T00:00:00Z", husk: { sha: "a".repeat(40),
      at: "2026-11-01T00:00:00Z", subject: { kind: "work-unit", name: "work" }, branch: "feat/work",
      ...(kind === "current" ? { authorization: "discard-confirmed", remoteRef: null,
        evidence: { kind: "git-transition", transition: "abandon", resultDigest: `sha256:${"b".repeat(64)}` } } : {}),
    } } };
  const husk = deriveCurrentHuskAdvisory({ worktreePath: "/repo/work", branch: null, head: "a".repeat(40), marker,
    stateOffBranch: kind === "manual-only" });
  if (husk === null) throw new Error("Expected a husk fixture");
  const envelope = await sessionInitFixture({ derivedLocusState: async () => frame,
    worktreeIdentity: async () => ({ kind: "linked", path: "/repo/work" }),
    worktree: async () => worktreeSync({ branch: null, state: "detached-head" }), currentHusk: async () => husk });
  return createAgendaFixtureInput(envelope, { signals: { next: true } });
}
function offers(steps: AgendaStep[]) { return steps.filter(step => step.type === "offer"); }

describe("agenda current husk cleanup", () => {
  it.each(["current", "legacy"] as const)("offers %s teardown from the primary and hands off", async kind => {
    const value = await huskInput(kind);
    const steps = orderOrientationSurfaces(compileCleanupOrientation(value));
    expect(steps).toEqual(expect.arrayContaining([expect.objectContaining({ type: "render", surface: "husk",
      text: expect.stringContaining(kind === "current" ? "discard-confirmed" : "legacy stamp") })]));
    const offer = offers(steps)[0];
    expect(offer).toMatchObject({ ask: "orientation", choices: [{ kind: "actions", accepts: [],
      actions: [{ argv: ["arc", "teardown", "work", "--husk", "/repo/work"], checkout: "/repo" }], then: { kind: "handoff" } }] });
  });

  it("keeps a husk teardown as text when no primary checkout resolves", async () => {
    const steps = orderOrientationSurfaces(compileCleanupOrientation(await huskInput("legacy", false)));
    expect(steps).toEqual([expect.objectContaining({ type: "render", surface: "husk", text: expect.stringContaining("arc teardown") })]);
  });

  it("renders only the manual-only reason without any cleanup offer", async () => {
    const steps = orderOrientationSurfaces(compileCleanupOrientation(await huskInput("manual-only")));
    expect(steps).toEqual([{ type: "render", surface: "husk", text: "**Husk:** pre-store-husk" }]);
  });
});

async function sweepInput(overrides: Partial<StaleWorktreeSweepResult>, linked = false, orphans: OrphanBranchReport[] = []) {
  const sweep = StaleWorktreeSweepResultSchema.parse({ remoteEvidence: "exact", missingFolders: [], worktrees: [],
    renameMoves: [], retirements: [], warnings: [], ...overrides });
  const original = workUnitRow();
  const row = { ...original, checkout: { ...original.checkout, primary: !linked, path: linked ? "/repo/work" : "/repo" } };
  return createAgendaFixtureInput(await sessionInitFixture({ derivedLocusState: async () => frameWithRow(row),
    worktreeIdentity: async () => linked ? { kind: "linked", path: "/repo/work" } : { kind: "primary" },
    sweep: async () => sweep, orphanBranchSweep: async () => ({ remoteEvidence: "exact", orphans }) }), { signals: { next: true, seed: "-literal seed" } });
}
function actionableRetirement(candidates: string[] = []) {
  const pending = { status: "pending" as const };
  return { status: "actionable" as const, worktreePath: "/repo/old", lifecycle: {
    subject: { slug: "old", branch: "feat/old" }, transition: "abandon" as const,
    cleanup: { branch: pending, worktree: pending, userWorkspace: pending },
    successorReadiness: projectSuccessorReadiness(candidates, true),
  }, teardown: { text: "arc teardown old", argv: ["arc", "teardown", "old"] as const } };
}

describe("agenda retirement cleanup", () => {
  it("offers the published teardown and unique successor independently", async () => {
    const steps = orderOrientationSurfaces(compileCleanupOrientation(await sweepInput({ retirements: [actionableRetirement(["next"])] })));
    const choices = offers(steps)[0]?.choices;
    expect(steps[0]).toMatchObject({ type: "render", surface: "retirements", text: expect.stringContaining("**Landed retirement cleanup:** 1") });
    expect(choices).toEqual([
      { kind: "actions", label: "arc teardown old", accepts: [], actions: [{ text: "arc teardown old", argv: ["arc", "teardown", "old"] }],
        then: { kind: "recompile", argv: ["arc", "agenda", "session-init", "--json", "--", "-literal seed"] } },
      { kind: "actions", label: "arc start next", accepts: [], actions: [{ text: "arc start next", argv: ["arc", "start", "next"] }], then: { kind: "handoff" } },
    ]);
  });

  it("renders several ready successors without selecting a default", async () => {
    const steps = orderOrientationSurfaces(compileCleanupOrientation(await sweepInput({ retirements: [actionableRetirement(["next", "other"])] })));
    expect(steps[0]).toMatchObject({ type: "render", surface: "retirements", text: expect.stringContaining("Ready successors: `next`, `other`; no default selected") });
    expect(offers(steps)[0]?.choices).toHaveLength(1);
  });

  it("renders a blocked retirement and its reason with no offer", async () => {
    const steps = orderOrientationSurfaces(compileCleanupOrientation(await sweepInput({ retirements: [{ status: "blocked", worktreePath: "/repo/old",
      subject: { slug: "old", branch: "feat/old" }, reason: "uncommitted" }] })));
    expect(steps).toEqual([{ type: "render", surface: "retirements", text: "**Landed retirement cleanup:** 1 work unit(s) have authoritative cleanup residue:\n- `old` (`feat/old`) — uncommitted; surfaced without an action" }]);
  });
});


function renameMove(from: string) {
  const worktree = { path: from, head: "a".repeat(40), branch: "feat/new-name", detached: false, primary: false, folderPresent: true };
  const move = projectRenameMoveRemedy(worktree, { kind: "present", marker: { spawnedByArc: true, wuName: "new-name",
    createdFor: { kind: "work-unit", name: "new-name" }, spawningIdentity: "andrew", createdAt: "2026-11-01T00:00:00Z",
    renameMovePending: { oldSlug: "old-name", newSlug: "new-name", branch: worktree.branch, head: worktree.head, from,
      to: "/repo/new path$(literal)'suffix" },
  } }, [worktree]);
  if (move === null) throw new Error("Expected a rename move fixture");
  return move;
}

describe("agenda deferred rename moves", () => {
  it("offers the published doubled-force arguments from outside the source checkout", async () => {
    const move = renameMove("/repo/old path;literal");
    const steps = orderOrientationSurfaces(compileCleanupOrientation(await sweepInput({ renameMoves: [move] })));
    expect(steps[0]).toMatchObject({ type: "render", surface: "rename-moves", text: expect.stringContaining(move.remedy.text) });
    expect(offers(steps)[0]).toMatchObject({ ask: "orientation", choices: [{ kind: "actions", actions: [{ argv: move.remedy.argv }], then: { kind: "recompile" } }] });
  });

  it("renders the published remedy as text when currently in its source checkout", async () => {
    const move = renameMove("/repo/work");
    const steps = orderOrientationSurfaces(compileCleanupOrientation(await sweepInput({ renameMoves: [move] }, true)));
    expect(steps).toEqual([{ type: "render", surface: "rename-moves", text: expect.stringContaining(move.remedy.text) }]);
  });
});

function huskReport(subject: { kind: "work-unit"; name: string } | { kind: "branch"; ref: string } | { kind: "errand"; slug: string }, linked = false) {
  const key = subject.kind === "work-unit" ? subject.name : subject.kind === "branch" ? subject.ref : subject.slug;
  const argv = subject.kind === "work-unit" ? ["arc", "teardown", subject.name, ...(linked ? ["--husk", `/repo/${key}`] : [])]
    : subject.kind === "branch" && !linked ? ["arc", "teardown", "--branch", subject.ref] : undefined;
  return { kind: "husk" as const, worktreePath: `/repo/${key}`, branch: null, stampedBranch: `feat/${key}`, completedWorkUnit: null,
    subject, stamp: { kind: "legacy" as const, authorization: "merged-preserved" as const }, decision: { action: "removable" as const },
    actions: argv === undefined ? [{ text: `No exact husk cleanup driver serves ${key}; cleanup is manual.` }] : [{ text: argv.join(" "), argv }],
  };
}

describe("agenda stale worktree cleanup", () => {
  it("offers each removable report's teardown or published actions once", async () => {
    const action = { text: "arc teardown branched", argv: ["arc", "teardown", "branched"] as const };
    const steps = orderOrientationSurfaces(compileCleanupOrientation(await sweepInput({ worktrees: [
      { kind: "branched", branch: "feat/branched", worktreePath: "/repo/branched", decision: { action: "removable" }, teardown: action,
        actions: [{ ...action, argv: [...action.argv] }] },
      { kind: "detached", branch: null, workUnit: "detached", worktreePath: "/repo/detached", decision: { action: "removable" },
        actions: [{ text: "arc teardown detached", argv: ["arc", "teardown", "detached"] }] },
      huskReport({ kind: "work-unit", name: "husk" }), huskReport({ kind: "branch", ref: "feat/adopted" }),
    ] })));
    expect(steps[0]).toMatchObject({ type: "render", surface: "stale-worktrees", text: expect.stringContaining("**Stale worktrees:** 4") });
    const choices = offers(steps)[0]?.choices;
    expect(choices).toHaveLength(4);
    expect(choices?.flatMap(choice => choice.kind === "actions" ? choice.actions.map(item => item.argv) : [])).toEqual([
      ["arc", "teardown", "branched"], ["arc", "teardown", "detached"], ["arc", "teardown", "husk"], ["arc", "teardown", "--branch", "feat/adopted"],
    ]);
    expect(choices?.every(choice => choice.kind === "actions" && choice.then.kind === "recompile")).toBe(true);
  });

  it("keeps a blocked report's published teardown as text", async () => {
    const steps = orderOrientationSurfaces(compileCleanupOrientation(await sweepInput({ worktrees: [{ kind: "branched", branch: "feat/blocked",
      worktreePath: "/repo/blocked", decision: { action: "blocked", reason: "locked" }, teardown: { text: "arc teardown blocked", argv: ["arc", "teardown", "blocked"] } }] })));
    expect(steps[0]).toMatchObject({ type: "render", surface: "stale-worktrees", text: expect.stringContaining("locked") });
    expect(offers(steps)).toEqual([]);
  });

  it("renders external, manual-only, outside and errand husks without cleanup choices", async () => {
    const work = huskReport({ kind: "work-unit", name: "old" });
    const steps = orderOrientationSurfaces(compileCleanupOrientation(await sweepInput({ worktrees: [
      { kind: "branched", branch: "other", worktreePath: "/repo/external", decision: { action: "external" } },
      { ...work, stamp: { kind: "manual-only", reason: "pre-store-husk" }, decision: { action: "blocked", reason: "pre-store-husk" },
        actions: [{ text: "Inspect the pre-store-husk; cleanup requires a manual decision." }] },
      { ...work, worktreePath: "/repo/outside", decision: { action: "outside", reason: "untrusted-marker" }, actions: undefined },
      huskReport({ kind: "errand", slug: "reserved" }),
    ] })));
    expect(steps[0]).toMatchObject({ type: "render", surface: "stale-worktrees", text: expect.stringContaining("externally-managed") });
    expect(steps[0]).toMatchObject({ text: expect.stringContaining("pre-store-husk") });
    expect(steps[0]).toMatchObject({ text: expect.stringContaining("untrusted") });
    expect(steps[0]).toMatchObject({ text: expect.stringContaining("reserved") });
    expect(offers(steps)).toEqual([]);
  });
});


describe("agenda missing checkout registrations", () => {
  it("renders every published remedy as text, including teardown argv and owner-held unlocks", async () => {
    const unlocked = missingRegistrationActions("/repo/gone", { locked: false, workUnitName: "gone" });
    const locked = missingRegistrationActions("/repo/locked path", { locked: true, workUnitName: "locked" });
    const steps = orderOrientationSurfaces(compileCleanupOrientation(await sweepInput({ missingFolders: [
      { worktreePath: "/repo/gone", branch: "feat/gone", outcome: "missing", actions: unlocked },
      { worktreePath: "/repo/locked path", branch: "feat/locked", outcome: "locked", actions: locked },
    ] })));
    expect(steps).toEqual([{ type: "render", surface: "missing-folders", text: expect.stringContaining(unlocked[0]!.text) }]);
    expect(steps[0]).toMatchObject({ text: expect.stringContaining(locked[0]!.text) });
    expect(offers(steps)).toEqual([]);
  });
});

it("keeps cleanup silent when a failed roster leaves the sweep absent", async () => {
  const envelope = await sessionInitFixture({ roster: async () => { throw new Error("Roster unavailable"); } });
  expect(orderOrientationSurfaces(compileCleanupOrientation(createAgendaFixtureInput(envelope)))).toEqual([]);
});


describe("agenda orphan branch cleanup", () => {
  it("offers shipped and merged reports using their published commands", async () => {
    const teardown = { text: "arc teardown shipped", argv: ["arc", "teardown", "shipped"] as const };
    const steps = orderOrientationSurfaces(compileCleanupOrientation(await sweepInput({}, false, [
      { branch: "feat/shipped", merged: false, shippedWorkUnit: SlugSchema.parse("shipped"), teardown, actions: [{ ...teardown, argv: [...teardown.argv] }] },
      { branch: "fix/adopted", merged: true, shippedWorkUnit: null, actions: [{ text: "git branch -D fix/adopted", argv: ["git", "branch", "-D", "fix/adopted"] }] },
    ])));
    expect(steps[0]).toMatchObject({ type: "render", surface: "branch-orphans", text: expect.stringContaining("**Branch orphans:** 2") });
    expect(offers(steps)[0]?.choices).toMatchObject([
      { kind: "actions", actions: [{ argv: teardown.argv }], then: { kind: "recompile" } },
      { kind: "actions", actions: [{ argv: ["git", "branch", "-D", "fix/adopted"] }], then: { kind: "recompile" } },
    ]);
  });

  it("keeps unmerged and evidence-unavailable orphan branches as text", async () => {
    const steps = orderOrientationSurfaces(compileCleanupOrientation(await sweepInput({}, false, [
      { branch: "feat/keep", merged: false, shippedWorkUnit: null, actions: [{ text: "Branch feat/keep is kept for its owner. Its owner may run git branch -D feat/keep after preserving its work." }] },
      { branch: "fix/unknown", merged: null, shippedWorkUnit: null, blockingReason: "evidence-unavailable" },
    ])));
    expect(steps).toEqual([{ type: "render", surface: "branch-orphans", text: expect.stringContaining("not merged; surfaced, not removed") }]);
    expect(steps[0]).toMatchObject({ text: expect.stringContaining("remote evidence unavailable; no cleanup authority") });
    expect(steps[0]).toMatchObject({ text: expect.stringContaining("Branch feat/keep is kept for its owner.") });
  });
});

describe("agenda linked cleanup residues", () => {
  it("replaces the primary lists with one combined surface and retains only eligible remedies", async () => {
    const other = huskReport({ kind: "work-unit", name: "other" }, true);
    const steps = orderOrientationSurfaces(compileCleanupOrientation(await sweepInput({ worktrees: [
      other, huskReport({ kind: "branch", ref: "fix/adopted" }, true), huskReport({ kind: "errand", slug: "reserved" }, true),
      { ...other, worktreePath: "/repo/dirty", decision: { action: "blocked", reason: "uncommitted" }, actions: undefined },
      { ...other, worktreePath: "/repo/moved", decision: { action: "blocked", reason: "head-moved" }, actions: undefined },
      { kind: "branched", branch: "feat/ended", worktreePath: "/repo/ended", decision: { action: "removable" },
        teardown: { text: "arc teardown ended", argv: ["arc", "teardown", "ended"] } },
    ] }, true, [
      { branch: "fix/merged", merged: true, shippedWorkUnit: null, actions: [{ text: "git branch -D fix/merged", argv: ["git", "branch", "-D", "fix/merged"] }] },
      { branch: "fix/keep", merged: false, shippedWorkUnit: null },
    ])));
    expect(steps.filter(step => step.type === "render").map(step => step.surface)).toEqual(["cleanup-residues"]);
    expect(steps[0]).toMatchObject({ text: expect.stringContaining("**Cleanup residues:** 8") });
    expect(steps[0]).toMatchObject({ text: expect.stringContaining("— dirty; surfaced, not removed") });
    const choices = offers(steps)[0]?.choices;
    expect(choices?.flatMap(choice => choice.kind === "actions" ? choice.actions.map(action => action.argv) : [])).toEqual([
      ["arc", "teardown", "other", "--husk", "/repo/other"], ["arc", "teardown", "ended"], ["git", "branch", "-D", "fix/merged"],
    ]);
    expect(choices?.every(choice => choice.kind === "actions" && choice.then.kind === "recompile")).toBe(true);
    expect(steps.every(step => !("marker" in step))).toBe(true);
  });
});
