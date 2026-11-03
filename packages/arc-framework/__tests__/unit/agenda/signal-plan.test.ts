/** Plan entry resolves actual backlog records and keeps unresolved choices retryable. */
import { describe, expect, it } from "vitest";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { readWorkUnit } from "../../../src/lib/store/lifecycle-write.js";
import { compileSessionInitAgenda } from "../../../src/commands/agenda/compile.js";
import { assertSessionInitAgenda } from "../../../src/commands/agenda/schema.js";
import type { AgendaCompileInput } from "../../../src/commands/agenda/compile-input.js";
import { baseFrame, frameWithRow, selectedRow } from "../../helpers/agenda-fixtures.js";
import { worktreeSync } from "../../helpers/session-init-fixtures.js";
import { createSignalAgendaFixture } from "../../helpers/agenda-signal-fixtures.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { createTestStatusContext } from "../../helpers/status-context.js";

async function fixture(branch: string | null = "feat/work") {
  const h = createLifecycleHarness();
  const primary = selectedRow(baseFrame());
  const row = { ...primary, kind: "unmanaged-checkout" as const, subject: null, checkout: { ...primary.checkout,
    path: "/wt/plan", primary: false, branch, detached: branch === null } };
  const { input } = await createSignalAgendaFixture(undefined, {
    derivedLocusState: async () => frameWithRow(row),
    worktreeIdentity: async () => ({ kind: "linked", path: row.checkout.path }),
    worktree: async () => worktreeSync({ branch, state: branch === null ? "detached-head" : "clean" }),
  });
  input.entry = await createTestStatusContext({ store: h.store, identity: "test-user", cwd: row.checkout.path });
  return { input, h };
}
async function compile(input: AgendaCompileInput) {
  const result = await compileSessionInitAgenda(input);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.refusal));
  assertSessionInitAgenda(result.agenda);
  return result.agenda;
}

describe("Plan signal entry", () => {
  it("orients on the resolved stub identity after lookup normalization", async () => {
    const { input, h } = await fixture("chore/groom-demo");
    await h.seedMeta("demo", { state: "Planning" }, { kind: "backlog", commitment: "planned" });
    input.signals = { plan: " demo " };
    const agenda = await compile(input);
    expect(agenda.orientation).toEqual({ shape: "subject", subject: { kind: "groom", key: "demo" } });
    expect(agenda.steps.at(-1)).toMatchObject({ type: "fragment", args: { stub: "demo", onGroomingBranch: true } });
    expect(agenda.signals.plan).toBe(" demo ");
  });

  it.each([false, true])("degrades a real wrong-family or ambiguous lookup and accepts another stub: ambiguous=%s", async ambiguous => {
    const { input, h } = await fixture();
    await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "shared" })),
      "# Cohort: shared\n\n**Purpose:** Group work.\n\n**Parent:** [none]\n");
    if (ambiguous) await h.seedMeta("shared", { state: "Planning" }, { kind: "backlog", commitment: "planned" });
    const refused = await readWorkUnit(h.store, "shared");
    if (refused.status !== "refused") throw new Error("Expected an actual logical lookup refusal");
    input.signals = { plan: "shared" };
    const agenda = await compile(input);
    const offer = agenda.steps.at(-1);
    expect(offer).toMatchObject({ type: "offer", id: "plan-stub:shared", text: expect.stringContaining("lookup") });
    expect(offer).toMatchObject({ text: expect.stringContaining(refused.refusal.condition), choices: [
      { kind: "elicit", signal: "plan", carried: "shared" }, { kind: "signal", decline: true },
    ] });
    await h.seedMeta("repaired", { state: "Planning" }, { kind: "backlog", commitment: "planned" });
    input.signals = { plan: "repaired" };
    expect((await compile(input)).steps.at(-1)).toMatchObject({ type: "fragment", args: { stub: "repaired" } });
  });

  it.each(["chore/groom-demo", "chore/groom-other", "feat/work", null])("sets the grooming skip only for the exact branch: %j", async branch => {
    const { input, h } = await fixture(branch);
    await h.seedMeta("demo", { state: "Planning" }, { kind: "backlog", commitment: "planned" });
    input.signals = { plan: "demo" };
    const agenda = await compile(input);
    expect(agenda.steps.at(-1)).toMatchObject({ type: "fragment", args: { stub: "demo",
      onGroomingBranch: branch === "chore/groom-demo" } });
  });

  it.each([true, "missing"] as const)("elicits a bare or missing stub: %j", async plan => {
    const { input } = await fixture();
    input.signals = { plan };
    const agenda = await compile(input);
    const value = plan === true ? "" : plan;
    const id = `plan-stub:${value}`;
    expect(agenda.steps.at(-1)).toEqual({ type: "offer", id, ask: "now", text: expect.any(String), choices: [
      { kind: "elicit", label: expect.any(String), signal: "plan", ...(value === "" ? {} : { carried: value }),
        recompile: ["arc", "agenda", "session-init", "--json"] },
      { kind: "signal", label: expect.any(String), signal: "plan", value: null, decline: true,
        recompile: ["arc", "agenda", "session-init", "--json", "--answered", `${id}=decline`] },
    ] });
  });

  it("asks again under the new unmatched value's key while retaining earlier decisions", async () => {
    const { input } = await fixture();
    input.signals = { plan: "first" };
    input.answers = { answered: { "notes:pull": "decline" }, done: [] };
    const first = await compile(input);
    expect(first.steps.at(-1)).toMatchObject({ type: "offer", id: "plan-stub:first" });
    input.signals = { plan: "second" };
    const second = await compile(input);
    expect(second.steps.at(-1)).toMatchObject({ type: "offer", id: "plan-stub:second", choices: [
      { kind: "elicit", signal: "plan", carried: "second",
        recompile: ["arc", "agenda", "session-init", "--json", "--answered", "notes:pull=decline"] },
      { kind: "signal", decline: true },
    ] });
  });

  it("hands a found backlog stub to its owning workflow", async () => {
    const { input, h } = await fixture();
    await h.seedMeta("demo", { state: "Planning" }, { kind: "backlog", commitment: "planned" });
    input.signals = { plan: "demo" };
    const agenda = await compile(input);
    expect(agenda.orientation).toEqual({ shape: "subject", subject: { kind: "groom", key: "demo" } });
    expect(agenda.steps.at(-1)).toEqual({ type: "fragment", target: {
      kind: "workflow", path: ".arc/system/workflows/arc/draft-design.md",
    }, args: { stub: "demo", onGroomingBranch: false } });
  });
});
