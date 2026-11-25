/** Checkout-only signals preserve local context while leaving work-unit execution untouched. */
import { describe, expect, it } from "vitest";
import { compileSessionInitAgenda } from "../../../src/commands/agenda/compile.js";
import { assertSessionInitAgenda } from "../../../src/commands/agenda/schema.js";
import type { AgendaSignals } from "../../../src/commands/agenda/schema.js";
import type { AgendaCompileInput } from "../../../src/commands/agenda/compile-input.js";
import { activeSessionInit, derivedFrameFromActive, rosterResult } from "../../helpers/session-init-fixtures.js";
import { resolveTaskListCursor } from "../../../src/lib/task-list/cursor.js";
import { createSignalAgendaFixture } from "../../helpers/agenda-signal-fixtures.js";

async function compile(input: AgendaCompileInput) {
  const result = await compileSessionInitAgenda(input);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.refusal));
  assertSessionInitAgenda(result.agenda);
  return result.agenda;
}

describe("checkout-only signal entry", () => {
  it("loads universal context and stops without entering the current work unit", async () => {
    const active = activeSessionInit({ resolution: "single", path: ".arc/active/meta-work.md", sessionType: "execution",
      taskListPath: ".arc/active/tasks-work.md" });
    const cursor = resolveTaskListCursor("# Tasks\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Implement behavior**\n");
    const { input } = await createSignalAgendaFixture(undefined, { active: async () => active,
      derivedLocusState: async () => derivedFrameFromActive(active, "test-user", null, cursor, null, true),
      taskCursor: async () => cursor,
    });
    input.signals = { context: true };
    const agenda = await compile(input);
    expect(agenda.orientation).toEqual({ shape: "checkout" });
    const reads = agenda.steps.filter(step => step.type === "read");
    expect(reads.some(step => step.path.endsWith("AGENT-BRIEF.ARC.md"))).toBe(true);
    expect(reads.some(step => step.path.endsWith("DEV-RULES.ARC.md"))).toBe(true);
    expect(reads.some(step => /meta-work|tasks-work|SESSION-NOTES|process-task-loop/u.test(step.path))).toBe(false);
    expect(agenda.steps.filter(step => step.type === "exec" || step.type === "offer" || step.type === "fragment")).toEqual([]);
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "stop", autoProceed: false });
  });

  it("hands Housekeep to the shipped owning workflow without arguments", async () => {
    const { input } = await createSignalAgendaFixture();
    input.signals = { housekeep: true };
    const agenda = await compile(input);
    expect(agenda.orientation).toEqual({ shape: "subject", subject: { kind: "housekeep", key: null } });
    expect(agenda.steps.at(-1)).toEqual({ type: "fragment", target: {
      kind: "workflow", path: ".arc/system/workflows/arc/supplemental/drain-inbox.md",
    }, args: {} });
  });

  it.each<AgendaSignals>([{ errand: "Concern" }, { plan: true }, { housekeep: true }, { context: true }])("keeps checkout failures and suppresses unused discovery surfaces for %j", async signals => {
    const unavailable = async (): Promise<never> => { throw new Error("Unused discovery probe denied"); };
    const { input } = await createSignalAgendaFixture(undefined, {
      dirty: async () => { throw new Error("Checkout dirty probe denied"); },
      domainRules: async () => { throw new Error("Domain inspection denied"); },
      sweep: unavailable, workUnitState: unavailable,
      roster: async () => rosterResult({ entries: [{ worktreePath: "/wt/other", branch: "feat/other",
        metaFilePath: "/wt/other/.arc/active/meta-other.md", class: "Heavy" }] }),
    });
    expect(input.envelope.inFlightComposition).toMatchObject({ heavy: 1 });
    expect(input.envelope.domainRules).toMatchObject({ ok: false });
    expect(input.envelope.sweep).toMatchObject({ ok: false });
    expect(input.envelope.workUnitState).toMatchObject({ ok: false });
    input.signals = signals;
    const agenda = await compile(input);
    const surfaces = agenda.steps.filter(step => step.type === "render" || step.type === "note");
    expect(surfaces).toEqual(expect.arrayContaining([
      expect.objectContaining({ surface: "degraded-slot", text: expect.stringContaining("Checkout dirty probe denied") }),
      expect.objectContaining({ surface: "degraded-slot", text: expect.stringContaining("Domain inspection denied") }),
    ]));
    expect(surfaces.some(step => step.text.includes("Unused discovery probe denied"))).toBe(false);
    expect(surfaces.filter(step => ["domain-rules", "concurrent-workload", "reminder", "in-flight-work-units",
      "housekeep", "retirements"].includes(step.surface))).toEqual([]);
    expect(agenda.steps.filter(step => step.type === "fragment").map(step => step.target))
      .not.toContainEqual({ kind: "method", name: "discover-next-work" });
  });

});
