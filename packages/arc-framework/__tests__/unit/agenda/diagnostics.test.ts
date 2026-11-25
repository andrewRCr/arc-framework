/** Universal configuration diagnostics survive checkout-scoped entry and resume. */
import { describe, expect, it } from "vitest";
import { compileSessionInitAgenda } from "../../../src/commands/agenda/compile.js";
import { assertSessionInitAgenda } from "../../../src/commands/agenda/schema.js";
import { createSignalAgendaFixture } from "../../helpers/agenda-signal-fixtures.js";
import { createTransientAgendaFixture } from "../../helpers/agenda-transient-fixtures.js";
import { domainRulesSessionInit, type SessionInitProbeOverrides } from "../../helpers/session-init-fixtures.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { createTestStatusContext } from "../../helpers/status-context.js";

const entries = ["context", "housekeep", "plan", "errand", "start", "resume-errand", "resume-partial-errand",
  "resume-groom", "resume-housekeep"] as const;
type Entry = typeof entries[number];

async function fixture(entry: Entry, probes: SessionInitProbeOverrides) {
  if (entry.startsWith("resume-")) {
    const kind = entry.slice(7) as "errand" | "partial-errand" | "groom" | "housekeep";
    return (await createTransientAgendaFixture(kind, probes)).input;
  }
  const { input } = await createSignalAgendaFixture(undefined, probes, false);
  switch (entry) {
    case "context": input.signals = { context: true }; break;
    case "housekeep": input.signals = { housekeep: true }; break;
    case "plan": input.signals = { plan: true }; break;
    case "errand": input.signals = { errand: "Concern" }; break;
    case "start": {
      const harness = createLifecycleHarness();
      await harness.seedMeta("target", { state: "Planning", currentWorkflow: null },
        { kind: "backlog", commitment: "planned" });
      input.entry = await createTestStatusContext({ store: harness.store, identity: "test-user", cwd: "/repo" });
      input.signals = { start: "target" };
      break;
    }
  }
  return input;
}

async function compile(entry: Entry, probes: SessionInitProbeOverrides) {
  const result = await compileSessionInitAgenda(await fixture(entry, probes));
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.refusal));
  assertSessionInitAgenda(result.agenda);
  return result.agenda;
}

describe.each(entries)("universal diagnostics for %s", entry => {
  it("emits each domain-rule warning once", async () => {
    const warnings = ["Malformed domain-rule declaration", "Unreadable domain-rule file"];
    const agenda = await compile(entry, { domainRules: async () => domainRulesSessionInit({ warnings }) });
    expect(agenda.steps.filter(step => step.type === "note" && step.surface === "domain-rules"))
      .toEqual(warnings.map(text => ({ type: "note", surface: "domain-rules", text })));
  });

  it.each(["config", "domainRules"] as const)("reports a failed %s probe without supplying its actions", async name => {
    const agenda = await compile(entry, { [name]: async () => { throw new Error(`${name} inspection denied`); } });
    expect(agenda.steps.filter(step => step.type === "render" && step.surface === "degraded-slot"))
      .toContainEqual(expect.objectContaining({ text: expect.stringContaining(`${name} inspection denied`) }));
    expect(agenda.steps.filter(step => step.type === "exec" || step.type === "offer")
      .some(step => step.id.startsWith(`${name}:`))).toBe(false);
  });
});
