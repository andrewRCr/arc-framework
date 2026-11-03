/** Recorded decisions survive every recompile without repeating completed work. */
import { describe, expect, it } from "vitest";
import { createAgendaFixtureInput } from "../../helpers/agenda-fixtures.js";
import { sessionInitFixture } from "../../helpers/session-init-fixtures.js";
import { buildAgendaArgv } from "../../../src/commands/agenda/argv.js";
import { carryAgendaAnswers, renderAnswered } from "../../../src/commands/agenda/progress.js";
import { createSyncExec, createSyncOffer } from "../../../src/commands/agenda/sync-steps.js";
import type { AgendaCompileInput } from "../../../src/commands/agenda/compile-input.js";
import type { AgendaStep } from "../../../src/commands/agenda/schema.js";

const command = [{ text: "inspect", argv: ["inspect"] }];
async function input(): Promise<AgendaCompileInput> {
  return createAgendaFixtureInput(await sessionInitFixture(), { signals: { seed: "-source", next: true } });
}
function offer(value: AgendaCompileInput, id: string): AgendaStep {
  return createSyncOffer(value, { id, text: id, label: id, actions: command });
}
const method: AgendaStep = { type: "fragment", target: { kind: "method", name: "discover-next-work" }, args: {} };
function argvOf(step: AgendaStep | undefined): string[] {
  if (step?.type !== "exec" || step.then.kind !== "recompile") throw new Error("Expected recompiling exec");
  return step.then.argv;
}

describe("agenda answer carriage", () => {
  it("carries earlier declined offers and followed methods into a later exec", async () => {
    const value = await input();
    const steps = carryAgendaAnswers(value, [offer(value, "first:pick"), method,
      createSyncExec(value, { id: "last:run", actions: command })]);
    expect(argvOf(steps.at(-1))).toEqual(expect.arrayContaining([
      "--answered", "first:pick=decline", "--done", "fragment:discover-next-work", "last:run",
    ]));
    expect(argvOf(steps.at(-1)).slice(-2)).toEqual(["--", "-source"]);
  });

  it("records every current action choice key and earlier declines", async () => {
    const value = await input();
    const combined: AgendaStep = { type: "offer", ask: "now", id: "one:pick+two:pick", text: "Pick",
      choices: [{ kind: "actions", label: "One", accepts: ["one:pick"], actions: command,
        then: { kind: "recompile", argv: buildAgendaArgv(value.signals, value.answers) } },
      { kind: "bare", label: "Skip", decline: true }] };
    const steps = carryAgendaAnswers(value, [offer(value, "earlier:pick"), combined]);
    const current = steps.at(-1);
    if (current?.type !== "offer") throw new Error("Expected offer");
    expect(current.choices[0]).toMatchObject({ then: { argv: expect.arrayContaining([
      "earlier:pick=decline", "one:pick=accept", "two:pick=decline",
    ]) } });
  });

  it("carries only prior progress into signal and elicit choices, except a declining signal", async () => {
    const value = await input();
    const recompile = buildAgendaArgv(value.signals, value.answers);
    const step: AgendaStep = { type: "offer", id: "errand:pick", ask: "now", text: "Pick",
      choices: [{ kind: "elicit", signal: "errand", label: "Describe", recompile },
      { kind: "signal", signal: "errand", value: null, label: "Skip", decline: true, recompile }] };
    const current = carryAgendaAnswers(value, [offer(value, "earlier:pick"), step]).at(-1);
    if (current?.type !== "offer") throw new Error("Expected offer");
    expect(current.choices[0]).toMatchObject({ recompile: expect.arrayContaining(["earlier:pick=decline"]) });
    expect(current.choices[0]).not.toMatchObject({ recompile: expect.arrayContaining(["errand:pick=accept"]) });
    expect(current.choices[0]).not.toMatchObject({ recompile: expect.arrayContaining(["errand:pick=decline"]) });
    expect(current.choices[1]).toMatchObject({ recompile: expect.arrayContaining(["errand:pick=decline"]) });
  });

  it("drops next without recording orientation choices", async () => {
    const value = await input();
    const step = offer(value, "cleanup:pick");
    if (step.type !== "offer") throw new Error("Expected offer");
    step.ask = "orientation";
    const current = carryAgendaAnswers(value, [step]).at(-1);
    if (current?.type !== "offer") throw new Error("Expected offer");
    expect(current.choices[0]).toMatchObject({ then: { argv: ["arc", "agenda", "session-init", "--json", "--", "-source"] } });
  });

  it("omits answered offers, done or answered execs, and followed methods", async () => {
    const value = await input();
    const pending = [offer(value, "first:pick"), method,
      createSyncExec(value, { id: "last:run", actions: command })];
    value.answers = { answered: { "first:pick": "decline", "last:run": "decline" }, done: ["fragment:discover-next-work"] };
    expect(carryAgendaAnswers(value, pending)).toEqual([]);
    value.answers = { answered: {}, done: ["last:run"] };
    expect(carryAgendaAnswers(value, [pending[2]!])).toEqual([]);
    expect(renderAnswered(value)).toBeNull();
  });

  it("names received offer answers and omitted methods", async () => {
    const value = await input();
    value.answers = { answered: { "one:pick": "accept", "two:pick": "decline" }, done: ["fragment:discover-next-work", "last:run"] };
    expect(renderAnswered(value)).toMatchObject({ type: "note", surface: "answered",
      text: expect.stringContaining("one:pick") });
    expect(renderAnswered(value)?.text).toContain("two:pick");
    expect(renderAnswered(value)?.text).toContain("discover-next-work");
  });

  it("does not record a branch-gone teardown question", async () => {
    const value = await input();
    const step: AgendaStep = { type: "offer", id: "branch-gone:surface", ask: "now", text: "Repair",
      choices: [{ kind: "actions", label: "Tear down", accepts: ["branch-gone:surface"],
        actions: [{ text: "arc teardown work", argv: ["arc", "teardown", "work"] }],
        then: { kind: "recompile", argv: buildAgendaArgv(value.signals, value.answers) } },
      { kind: "bare", label: "Hold", decline: true }] };
    const current = carryAgendaAnswers(value, [step]).at(-1);
    if (current?.type !== "offer") throw new Error("Expected offer");
    expect(current.choices[0]).toMatchObject({ then: { argv: buildAgendaArgv(value.signals, value.answers) } });
  });
});
