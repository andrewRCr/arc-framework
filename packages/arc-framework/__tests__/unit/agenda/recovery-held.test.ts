/** Held branch-gone recovery reads context and orients without synchronizing or advancing. */
import { describe, expect, it } from "vitest";
import { compileSessionInitAgenda } from "../../../src/commands/agenda/compile.js";
import { assertSessionInitAgenda, type SessionInitAgenda, type AgendaAnswers, type AgendaSignals } from "../../../src/commands/agenda/schema.js";
import type { AgendaCompileInput } from "../../../src/commands/agenda/compile-input.js";
import { missingRegistrationActions } from "../../../src/lib/session-init/missing-worktree-folders.js";
import { baseFrame, frameWithRow, selectedRow, workUnitRow } from "../../helpers/agenda-fixtures.js";
import { createRecoveryAgendaFixture } from "../../helpers/agenda-recovery-fixtures.js";
import { configSessionInit, userSessionInit, worktreeSync, rosterResult } from "../../helpers/session-init-fixtures.js";

async function compile(input: AgendaCompileInput): Promise<SessionInitAgenda> {
  const result = await compileSessionInitAgenda(input);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error("Expected held recovery");
  assertSessionInitAgenda(result.agenda);
  return result.agenda;
}

describe("held recovery context", () => {
  it("reads the selected work unit's manifest and stops without scheduling any synchronization", async () => {
    const input = await createRecoveryAgendaFixture({ kind: "main-fallback", remoteEvidence: "exact", baseBranch: "main" }, false, {
      user: async () => userSessionInit({ loadNeeded: true }),
      config: async () => configSessionInit({ settings: { ...configSessionInit().settings, "session.init_load.notes": "always" } }),
    });
    input.answers.answered["branch-gone:main-fallback"] = "decline";
    const agenda = await compile(input);
    expect(input.envelope.loadSet?.ok).toBe(true);
    if (!input.envelope.loadSet?.ok) throw new Error("Expected a manifest");
    expect(agenda.steps.filter(step => step.type === "read").map(step => step.path))
      .toEqual(input.envelope.loadSet.value.entries.map(entry => entry.path));
    expect(agenda.steps.some(step => step.type === "exec" || step.type === "offer")).toBe(false);
    expect(agenda.orientation).toEqual({ shape: "work-state" });
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "stop", autoProceed: false });
  });

  it("reads universal context on an otherwise Orient row and runs no discovery or route", async () => {
    const base = baseFrame();
    const work = workUnitRow();
    const other = { ...work, checkout: { ...work.checkout, primary: false, path: "/repo/work" } };
    const frame = { ...base, roster: [...base.roster, other] };
    const row = selectedRow(frame);
    const input = await createRecoveryAgendaFixture({ kind: "resolved", remoteEvidence: "exact",
      candidate: { branch: "feat/work", proposedAction: "switch", worktreePath: "/repo/work" } }, false, {
      derivedLocusState: async () => frame,
      worktree: async () => worktreeSync({ branch: row.checkout.branch, state: "branch-gone" }),
      roster: async () => rosterResult({ entries: [{ worktreePath: "/repo/work", branch: "feat/work",
        metaFilePath: ".arc/active/meta-work.md", class: "Heavy" }] }),
    });
    const agenda = await compile(input);
    expect(input.envelope.inFlightComposition).toMatchObject({ heavy: 1 });
    expect(agenda.steps).not.toEqual(expect.arrayContaining([expect.objectContaining({ surface: "concurrent-workload" })]));
    if (!input.envelope.loadSet?.ok) throw new Error("Expected universal context");
    expect(agenda.steps.filter(step => step.type === "read").map(step => step.path))
      .toEqual(input.envelope.loadSet.value.entries.map(entry => entry.path));
    expect(agenda.steps.some(step => step.type === "fragment" || step.type === "offer" || step.type === "exec")).toBe(false);
    expect(agenda.orientation).toEqual({ shape: "work-state" });
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "stop", autoProceed: false });
  });


  it("preserves the complete held explanation across carried recovery decisions", async () => {
    const path = "/wt/recover elsewhere";
    const remedies = missingRegistrationActions("/wt/missing", { locked: true });
    const recorded: AgendaAnswers[] = [
      { answered: {}, done: [] },
      { answered: { "branch-gone:resolved": "decline" }, done: [] },
      { answered: { "branch-gone:resolved": "accept" }, done: [] },
      { answered: {}, done: ["branch-gone:resolved"] },
    ];
    const texts: string[] = [];
    for (const answers of recorded) {
      const input = await createRecoveryAgendaFixture({ kind: "resolved", remoteEvidence: "exact",
        candidate: { branch: "feat/recover", proposedAction: "switch", worktreePath: path },
        missingFolders: [{ worktreePath: "/wt/missing", branch: "feat/missing", actions: remedies }],
      }, true);
      input.answers = answers;
      const agenda = await compile(input);
      const render = agenda.steps.find(step => step.type === "render" && step.surface === "branch-gone");
      expect(render).toMatchObject({ type: "render", surface: "branch-gone" });
      if (render?.type !== "render") throw new Error("Expected held recovery guidance");
      expect(render.text).toContain("**Branch gone:** `feat/work`'s upstream was deleted on `origin`; recovery was not completed.");
      expect(render.text).toContain("Re-run branch-gone recovery or pick a branch manually before sync, commit, or push.");
      if (!input.envelope.recovery?.ok) throw new Error("Expected recovery guidance");
      expect(render.text).toContain(input.envelope.recovery.value.recommendedPromptText);
      expect(render.text).toContain(`Continue recovery in checkout \`${path}\`.`);
      for (const remedy of remedies) expect(render.text).toContain(remedy.text);
      texts.push(render.text);
    }
    expect(new Set(texts).size).toBe(1);
  });


  it.each(["absent", "failed"] as const)("keeps the baseline branch-gone line when recovery is %s", async state => {
    const input = await createRecoveryAgendaFixture({ kind: "main-fallback", remoteEvidence: "exact", baseBranch: "main" }, false,
      state === "absent" ? { roster: async () => { throw new Error("Roster unavailable"); } }
        : { recovery: async () => { throw new Error("Recovery probe denied"); } });
    const agenda = await compile(input);
    expect(agenda.steps).toEqual(expect.arrayContaining([{ type: "render", surface: "branch-gone",
      text: "**Branch gone:** `feat/work`'s upstream was deleted on `origin`; recovery was not completed. "
        + "Re-run branch-gone recovery or pick a branch manually before sync, commit, or push.",
    }]));
    if (state === "failed") expect(agenda.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "render", surface: "degraded-slot", text: expect.stringContaining("Recovery probe denied") }),
    ]));
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "stop", autoProceed: false });
  });


  it("orients a held transient by its subject", async () => {
    const base = selectedRow(baseFrame());
    const row = { ...base, kind: "transient" as const,
      checkout: { ...base.checkout, branch: "errand/concern" },
      subject: { kind: "partial-errand" as const, key: "concern", claimId: null } };
    const input = await createRecoveryAgendaFixture({ kind: "unproven", remoteEvidence: "pending-fetch", candidates: [] }, false, {
      derivedLocusState: async () => frameWithRow(row),
      worktree: async () => worktreeSync({ branch: row.checkout.branch, state: "branch-gone" }),
    });
    const agenda = await compile(input);
    expect(agenda.orientation).toEqual({ shape: "subject", subject: { kind: "partial-errand", key: "concern" } });
    expect(agenda.steps.some(step => step.type === "fragment" || step.type === "exec" || step.type === "offer")).toBe(false);
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "stop", autoProceed: false });
  });


  it.each([{ seed: "source", next: true }, { start: "target" }] as AgendaSignals[])(
    "orders other orientation surfaces and suppresses unused intent under held recovery: %j", async signals => {
      const input = await createRecoveryAgendaFixture({ kind: "resolved", remoteEvidence: "exact", candidate: {
        proposedAction: "external", branch: "feat/external", worktreePath: "/wt/external",
      } }, true, {
        user: async () => userSessionInit({ state: "remote-ahead", shouldPromptToPull: true }),
        hooksPath: async () => { throw new Error("Hooks probe denied"); },
      });
      input.signals = signals;
      const agenda = await compile(input);
      const surfaces = agenda.steps.filter(step => step.type === "render" || step.type === "note").map(step => step.surface);
      expect(surfaces).toEqual(["header", "degraded-slot", "branch-gone", "notes-behind", "dirty"]);
      expect(agenda.steps.some(step => step.type === "exec" || step.type === "offer" || step.type === "fragment")).toBe(false);
      expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "stop", autoProceed: false });
    },
  );


  it("shows checkout history for absent session notes even when the skipped channel recommends a load", async () => {
    const input = await createRecoveryAgendaFixture({ kind: "unproven", remoteEvidence: "pending-fetch", candidates: [] }, false, {
      user: async () => userSessionInit({ loadNeeded: true }),
    });
    input.read.exists = async path => !path.endsWith("/SESSION-NOTES.md");
    const agenda = await compile(input);
    expect(agenda.steps).toEqual(expect.arrayContaining([expect.objectContaining({ type: "render", surface: "notes-history",
      text: expect.stringContaining("abc123 Recent fixture work") })]));
    expect(agenda.steps.some(step => step.type === "exec" || step.type === "offer")).toBe(false);
  });

});
