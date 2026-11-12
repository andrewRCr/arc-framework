/** Orient composes discovery and standing routes after the full session prefix. */
import { describe, expect, it } from "vitest";
import { compileOrientDiscovery } from "../../../src/commands/agenda/orient.js";
import { safeProbe, toProbe } from "../../../src/commands/status/result-composition.js";
import { baseFrame, selectedRow, forRow, createAgendaFixtureInput } from "../../helpers/agenda-fixtures.js";
import { compileSessionInitAgenda } from "../../../src/commands/agenda/compile.js";
import { assertSessionInitAgenda } from "../../../src/commands/agenda/schema.js";
import type { AgendaCompileInput } from "../../../src/commands/agenda/compile-input.js";
import { createSignalAgendaFixture } from "../../helpers/agenda-signal-fixtures.js";
import { configSessionInit, rosterResult, worktreeSync } from "../../helpers/session-init-fixtures.js";

async function compile(input: AgendaCompileInput) {
  const result = await compileSessionInitAgenda(input);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw Error(JSON.stringify(result.refusal));
  assertSessionInitAgenda(result.agenda);
  return result.agenda;
}

describe("Orient discovery", () => {
  it("offers full-prefix sync, loads universal context and frames seeded discovery with workload", async () => {
    const config = configSessionInit(); config.settings["pm.mode"] = "arc-in-git"; config.settings["branch.protection"] = "full";
    const { input } = await createSignalAgendaFixture(undefined, { config: async () => config,
      worktree: async () => worktreeSync({ state: "remote-ahead", behind: 2 }),
      roster: async () => rosterResult({ entries: [{ worktreePath: "/wt/other", branch: "feat/other",
        metaFilePath: "/wt/other/.arc/active/meta-other.md", class: "Heavy" }] }),
    });
    input.signals = { seed: "target" };
    const agenda = await compile(input);
    expect(agenda.orientation).toEqual({ shape: "work-state" });
    expect(agenda.steps[0]).toMatchObject({ type: "offer", id: "worktree:pull" });
    expect(agenda.steps).toContainEqual(expect.objectContaining({ type: "read", path: ".arc/reference/briefs/AGENT-BRIEF.ARC.md" }));
    const discovery = { type: "fragment", target: { kind: "method", name: "discover-next-work" }, args: {
      pmMode: "arc-in-git", protection: "full", seed: "target",
    } };
    expect(agenda.steps).toContainEqual(discovery);
    const header = agenda.steps.findIndex(step => step.type === "render" && step.surface === "header");
    expect(agenda.steps.findIndex(step => step.type === "fragment")).toBeLessThan(header);
    expect(agenda.steps).toContainEqual({ type: "note", surface: "concurrent-workload", text: expect.stringContaining("1 Heavy") });
    expect(agenda.steps.some(step => step.type === "note" && step.surface === "unconsumed-signal")).toBe(false);
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "stop", autoProceed: false });
  });
});


it.each(["free-primary", "unmanaged-checkout", "retired"] as const)("compiles the remaining %s entry as Orient", async kind => {
  const row = selectedRow(baseFrame());
  const selected = kind === "retired" ? { ...row, kind, subject: { kind: "work-unit" as const, key: "retired" } } : { ...row, kind, subject: null };
  const input = createAgendaFixtureInput(await forRow(selected), { read: {
    exists: async () => true, size: async () => 1000, read: async () => "", git: async () => { throw Error("Unexpected Git read"); },
  } });
  const agenda = await compile(input);
  expect(agenda.orientation).toEqual({ shape: "work-state" });
  expect(agenda.steps).toContainEqual(expect.objectContaining({ type: "fragment", target: { kind: "method", name: "discover-next-work" } }));
  expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "stop", autoProceed: false });
});

it("leaves a seed unconsumed when configuration is unavailable at the discovery projection seam", async () => {
  const failed = toProbe(await safeProbe<ReturnType<typeof configSessionInit>>("config", async () => { throw Error("Configuration denied"); }));
  expect(failed).toMatchObject({ ok: false, error: { message: "Configuration denied" } });
  expect(compileOrientDiscovery(failed, { seed: "Concern" })).toEqual({ fragment: null, findings: [
    { type: "note", surface: "unconsumed-signal", text: "Entry seed 'Concern' was not consumed; starting fresh work from it means spawning or checking out a new worktree and entering there." },
  ] });
});
