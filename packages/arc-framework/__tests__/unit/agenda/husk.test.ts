/** A contextless current husk retains cleanup attention without starting work. */
import { describe, expect, it } from "vitest";
import { compileSessionInitAgenda } from "../../../src/commands/agenda/compile.js";
import { assertSessionInitAgenda } from "../../../src/commands/agenda/schema.js";
import { createAgendaFixtureInput, forRow, workUnitRow } from "../../helpers/agenda-fixtures.js";
import { configSessionInit, dirtyState, rosterResult, userSessionInit } from "../../helpers/session-init-fixtures.js";
import type { SessionInitProbeOverrides } from "../../helpers/session-init-fixtures.js";
import type { AgendaSignals } from "../../../src/commands/agenda/schema.js";

async function compile(probes: SessionInitProbeOverrides = {}, signals: AgendaSignals = {}) {
  const row = workUnitRow(false, true);
  const envelope = await forRow({ ...row, checkout: { ...row.checkout, path: "/repo/husk" } }, "present", false, probes);
  const input = createAgendaFixtureInput(envelope, { signals, read: {
    exists: async () => true, size: async () => 1000, read: async () => "",
    git: async () => { throw new Error("Unexpected husk history read"); },
  } });
  input.entry.cwd = "/repo/husk";
  const result = await compileSessionInitAgenda(input);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.refusal));
  assertSessionInitAgenda(result.agenda);
  return { agenda: result.agenda, envelope };
}

describe("contextless current husk", () => {
  it("explains that an unused next flag cannot proceed from a husk", async () => {
    const { agenda } = await compile({}, { next: true });
    expect(agenda.steps).toContainEqual({ type: "note", surface: "unconsumed-signal",
      text: "--next auto-proceeds only a work-unit resume." });
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "stop", autoProceed: false });
  });

  it("renders husk and checkout attention, leaves discovery workload quiet, and stops", async () => {
    const { agenda, envelope } = await compile({
      dirty: async () => dirtyState({ state: "dirty", fileCount: 3 }),
      roster: async () => rosterResult({ entries: [{ worktreePath: "/wt/other", branch: "feat/other",
        metaFilePath: "/wt/other/.arc/active/meta-other.md", class: "Heavy" }] }),
    });
    expect(envelope.inFlightComposition).toMatchObject({ heavy: 1 });
    expect(agenda.orientation).toEqual({ shape: "work-state" });
    expect(agenda.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "render", surface: "husk", text: expect.stringContaining("pending physical teardown") }),
      { type: "render", surface: "dirty", text: "**Uncommitted changes:** 3 file(s) dirty in working tree." },
    ]));
    expect(agenda.steps.filter(step => step.type === "render" || step.type === "note")
      .some(step => step.surface === "concurrent-workload")).toBe(false);
    expect(agenda.steps.filter(step => step.type === "read").some(step => /meta-|tasks-|SESSION-NOTES|process-task-loop/u.test(step.path))).toBe(false);
    expect(agenda.steps.filter(step => step.type === "exec" || step.type === "fragment")).toEqual([]);
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "stop", autoProceed: false });
  });

  it("ends at automatic notes synchronization before loading or orienting the husk", async () => {
    const config = configSessionInit(); config.settings["session.init_pull.notes"] = "always";
    const { agenda } = await compile({ config: async () => config,
      user: async () => userSessionInit({ state: "remote-ahead", shouldPromptToPull: true }),
    });
    expect(agenda.steps).toHaveLength(1);
    expect(agenda.steps[0]).toMatchObject({ type: "exec", id: "notes:pull", then: { kind: "recompile" } });
  });
});
