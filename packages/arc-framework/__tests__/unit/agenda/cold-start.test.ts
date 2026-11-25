/** Cold-start asks before scaffolding and continues declined entry through Orient. */
import { describe, expect, it } from "vitest";
import { compileSessionInitAgenda } from "../../../src/commands/agenda/compile.js";
import { assertSessionInitAgenda } from "../../../src/commands/agenda/schema.js";
import type { AgendaCompileInput } from "../../../src/commands/agenda/compile-input.js";
import { baseFrame, selectedRow, forRow, createAgendaFixtureInput } from "../../helpers/agenda-fixtures.js";
import { worktreeSync, rosterResult, type SessionInitProbeOverrides } from "../../helpers/session-init-fixtures.js";

async function fixture(probes: SessionInitProbeOverrides = {}) {
  const row = selectedRow(baseFrame());
  const envelope = await forRow({ ...row, kind: "unmanaged-checkout", subject: null,
    checkout: { ...row.checkout, path: "/repo/cold", primary: false, branch: "feat/cold" } }, "absent", false, probes);
  return createAgendaFixtureInput(envelope, { entry: { ...createAgendaFixtureInput(envelope).entry, cwd: "/repo/cold" }, read: {
    exists: async () => true, size: async () => 1000, read: async () => "", git: async () => { throw Error("Unexpected Git read"); },
  } });
}
async function compile(input: AgendaCompileInput) {
  const result = await compileSessionInitAgenda(input);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw Error(JSON.stringify(result.refusal));
  assertSessionInitAgenda(result.agenda);
  return result.agenda;
}

describe("cold-start entry", () => {
  it("runs the advisory and scaffold question before the Orient prefix", async () => {
    const input = await fixture({ worktree: async () => worktreeSync({ branch: "feat/cold", state: "remote-ahead", behind: 2 }) });
    const agenda = await compile(input);
    expect(agenda.orientation).toEqual({ shape: "work-state" });
    expect(agenda.steps[0]).toEqual({ type: "fragment", target: { kind: "workflow", path: ".arc/system/workflows/arc/work-unit-lifecycle/in-flight-scope-check.md" }, args: {} });
    expect(agenda.steps[1]).toEqual({ type: "offer", id: "cold-start:scaffold", ask: "now", text: expect.any(String), choices: [
      { kind: "actions", label: "Scaffold here", accepts: ["cold-start:scaffold"], actions: [
        { text: "arc start --here", argv: ["arc", "start", "--here"] },
      ], then: { kind: "recompile", argv: ["arc", "agenda", "session-init", "--json", "--answered", "cold-start:scaffold=accept"] } },
      { kind: "bare", label: "Orient without scaffolding", decline: true },
    ] });
    expect(agenda.steps.findIndex(step => step.type === "offer" && step.id === "worktree:pull")).toBeGreaterThan(1);
    expect(agenda.steps.findIndex(step => step.type === "read")).toBeGreaterThan(1);
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "stop", autoProceed: false });
  });
});


it.each([
  { seed: "#42", origin: true }, { seed: "draft-feature.md", origin: false },
  { seed: "A named concern", origin: false }, { seed: "-leading", origin: false },
])("shows the disposition and literal start input for $seed", async ({ seed, origin }) => {
  const input = await fixture(); input.signals = { seed };
  const agenda = await compile(input);
  const offer = agenda.steps[1];
  if (offer?.type !== "offer") throw Error("Expected scaffold offer");
  expect(offer.text).toContain(seed);
  expect(offer.text).toContain(origin ? "Origin" : "passed through for planning");
  const accept = offer.choices[0];
  expect(accept).toMatchObject({ kind: "actions", actions: [{ argv: ["arc", "start", "--here",
    ...(seed.startsWith("-") ? [`--from=${seed}`] : ["--from", seed])] }],
    then: { kind: "recompile", argv: ["arc", "agenda", "session-init", "--json", "--answered", "cold-start:scaffold=accept"] } });
  expect(agenda.signals).toEqual({ seed });
});


it.each(["accept", "decline"] as const)("enters Orient without re-running an answered %s scaffold question", async answer => {
  const input = await fixture(); input.answers.answered["cold-start:scaffold"] = answer;
  const agenda = await compile(input);
  expect(agenda.steps.some(step => step.type === "fragment" && step.target.kind === "workflow")).toBe(false);
  expect(agenda.steps.some(step => step.type === "offer" && step.id === "cold-start:scaffold")).toBe(false);
  expect(agenda.steps).toContainEqual(expect.objectContaining({ type: "fragment", target: { kind: "method", name: "discover-next-work" } }));
  expect(agenda.steps).toContainEqual(expect.objectContaining({ type: "note", surface: "answered", text: expect.stringContaining(`cold-start:scaffold: ${answer}`) }));
  expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "stop", autoProceed: false });
});

it("keeps workload advice on the declined path after the immediate scaffold offer", async () => {
  const input = await fixture({ roster: async () => rosterResult({ entries: [{ worktreePath: "/wt/other", branch: "feat/other",
    metaFilePath: "/wt/other/.arc/active/meta-other.md", class: "Heavy" }] }) });
  const agenda = await compile(input);
  expect(agenda.steps[1]).toMatchObject({ type: "offer", choices: expect.arrayContaining([{ kind: "bare", label: "Orient without scaffolding", decline: true }]) });
  expect(agenda.steps).toContainEqual({ type: "note", surface: "concurrent-workload", text: expect.stringContaining("1 Heavy") });
});
