/** Transient resumes preserve their exact marker subject and owning workflow. */
import { describe, expect, it } from "vitest";
import { compileTransientFragment } from "../../../src/commands/agenda/transient.js";
import { compileSessionInitAgenda } from "../../../src/commands/agenda/compile.js";
import { assertSessionInitAgenda } from "../../../src/commands/agenda/schema.js";
import type { AgendaCompileInput } from "../../../src/commands/agenda/compile-input.js";
import { supersessionResult, worktreeSync, rosterResult } from "../../helpers/session-init-fixtures.js";
import { createTransientAgendaFixture } from "../../helpers/agenda-transient-fixtures.js";

async function compile(input: AgendaCompileInput) {
  const result = await compileSessionInitAgenda(input);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.refusal));
  assertSessionInitAgenda(result.agenda);
  return result.agenda;
}

describe("transient session entry", () => {
  it.each(["errand", "partial-errand", "groom", "housekeep"] as const)("resumes the selected %s subject", async kind => {
    const { input, row } = await createTransientAgendaFixture(kind);
    expect(row.kind).toBe("transient");
    const agenda = await compile(input);
    const subject = { kind, key: row.subject?.key };
    expect(agenda.orientation).toEqual({ shape: "subject", subject });
    const path = kind === "groom" ? ".arc/system/workflows/arc/draft-design.md"
      : `.arc/system/workflows/arc/supplemental/${kind === "housekeep" ? "drain-inbox" : "run-errand"}.md`;
    expect(agenda.steps.at(-1)).toEqual({ type: "fragment", target: { kind: "workflow", path }, args: {
      subjectKind: kind, subjectKey: row.subject?.key, generation: row.markerGeneration, ...(kind === "errand" || kind === "partial-errand" ? { mode: "resume" } : {}),
    } });
    if (kind === "partial-errand") expect(row.identity).toBeNull();
    expect(agenda.steps.filter(step => step.type === "read").some(step => /meta-|tasks-|SESSION-NOTES|process-task-loop/u.test(step.path))).toBe(false);
  });

  it("retains partial grooming on the base without treating the set key as a new stub", async () => {
    const { input, row } = await createTransientAgendaFixture("groom", {}, true);
    expect(row).toMatchObject({ kind: "transient", checkout: { branch: "main" }, identity: { protection: "partial" } });
    const agenda = await compile(input);
    expect(agenda.steps.at(-1)).toMatchObject({ type: "fragment", args: {
      subjectKind: "groom", subjectKey: "groom-demo", generation: row.markerGeneration,
    } });
    expect(agenda.steps.at(-1)).not.toHaveProperty("args.stub");
  });

  it("preserves a null marker generation at the fragment projection seam", () => {
    expect(compileTransientFragment({ kind: "groom", key: "groom-demo", claimId: "c".repeat(32) }, null))
      .toEqual({ type: "fragment", target: { kind: "workflow", path: ".arc/system/workflows/arc/draft-design.md" }, args: {
        subjectKind: "groom", subjectKey: "groom-demo", generation: null,
      } });
  });


  it.each(["worktree:pull", "superseded:reset"] as const)("offers the full prefix's %s", async id => {
    const { input } = await createTransientAgendaFixture("errand", {
      worktree: async () => worktreeSync({ branch: "chore/selected", behind: 2,
        state: id === "worktree:pull" ? "remote-ahead" : "diverged", ahead: id === "worktree:pull" ? 0 : 1 }),
      ...(id === "superseded:reset" ? { supersession: async () => supersessionResult({ superseded: true, supersededCommits: ["a".repeat(40)] }) } : {}),
    });
    const agenda = await compile(input);
    expect(agenda.steps[0]).toMatchObject({ type: "offer", id, ask: "now" });
    expect(agenda.steps.at(-1)).toMatchObject({ type: "fragment", args: { mode: "resume" } });
    expect(agenda.orientation).toEqual({ shape: "subject", subject: { kind: "errand", key: "selected" } });
  });


  it("limits degradation to checkout dependencies and suppresses discovery workload", async () => {
    const { input } = await createTransientAgendaFixture("groom", {
      dirty: async () => { throw new Error("Checkout inspection denied"); },
      domainRules: async () => { throw new Error("Unused domain inspection denied"); },
      roster: async () => rosterResult({ entries: [{ worktreePath: "/wt/other", branch: "feat/other",
        metaFilePath: "/wt/other/.arc/active/meta-other.md", class: "Heavy" }] }),
    });
    expect(input.envelope.inFlightComposition).toMatchObject({ heavy: 1 });
    expect(input.envelope.domainRules).toMatchObject({ ok: false });
    const agenda = await compile(input);
    const surfaces = agenda.steps.filter(step => step.type === "render" || step.type === "note");
    expect(surfaces.filter(step => step.surface === "concurrent-workload")).toEqual([]);
    expect(surfaces).toEqual(expect.arrayContaining([
      expect.objectContaining({ surface: "degraded-slot", text: expect.stringContaining("Checkout inspection denied") }),
    ]));
    expect(surfaces.some(step => step.text.includes("Unused domain inspection denied"))).toBe(false);
  });

});
