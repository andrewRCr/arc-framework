/** Errand entry compiles personal captures and queued work without opening a checkout. */
import { describe, expect, it } from "vitest";
import { compileSessionInitAgenda } from "../../../src/commands/agenda/compile.js";
import { assertSessionInitAgenda } from "../../../src/commands/agenda/schema.js";
import type { AgendaCompileInput } from "../../../src/commands/agenda/compile-input.js";
import { describeStorePull } from "../../../src/lib/session-init/store-user-pull.js";
import { setErrandQueue } from "../../../src/lib/inbox/queue.js";
import { configSessionInit, dirtyState, userSessionInit } from "../../helpers/session-init-fixtures.js";
import { entry } from "../../helpers/inbox-harness.js";
import { createSignalAgendaFixture } from "../../helpers/agenda-signal-fixtures.js";

async function compile(input: AgendaCompileInput) {
  const result = await compileSessionInitAgenda(input);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.refusal));
  assertSessionInitAgenda(result.agenda);
  return result.agenda;
}

describe("Errand signal entry", () => {
  it("retains operational notes sync attention as checkout context", async () => {
    const pull = describeStorePull({ status: "pulled", advisories: [{ condition: "A move remains unfinished.",
      remedy: { text: "Finish the move.", argv: ["arc", "store", "migrate"] } }] });
    const { input } = await createSignalAgendaFixture(undefined, { user: async () => pull }, true);
    input.signals = { errand: "Concern" };
    const agenda = await compile(input);
    expect(agenda.steps).toEqual(expect.arrayContaining([{ type: "note", surface: "store-sync",
      text: expect.stringContaining("Finish the move.") }]));
  });

  it.each(["captured concern", "Captured concern "])("does not adopt a non-exact seed %j", async seed => {
    const { input } = await createSignalAgendaFixture("## Errand\n\n" + entry("11111111", "Captured concern", "- _Hold:_ `true`"));
    input.signals = { errand: seed };
    const agenda = await compile(input);
    const step = agenda.steps.at(-1);
    if (step?.type !== "fragment") throw new Error("Expected launch fragment");
    expect(step.args.seed).toBe(seed);
    expect(step.args).not.toHaveProperty("fromInbox");
  });

  it("frames a seeded entry with checkout-local attention", async () => {
    const { input } = await createSignalAgendaFixture(undefined, {
      dirty: async () => dirtyState({ state: "dirty", fileCount: 3 }),
    });
    input.signals = { errand: "Concern" };
    const agenda = await compile(input);
    expect(agenda.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "render", surface: "header" }),
      { type: "render", surface: "dirty", text: "**Uncommitted changes:** 3 file(s) dirty in working tree." },
    ]));
  });

  it("ends at an automatic notes pull before reading captures or entering the workflow", async () => {
    const config = configSessionInit(); config.settings["session.init_pull.notes"] = "always";
    const { input } = await createSignalAgendaFixture(undefined, { config: async () => config,
      user: async () => userSessionInit({ identity: "test-user", state: "remote-ahead", shouldPromptToPull: true }),
    });
    input.signals = { errand: "Concern" };
    input.entry.readUserInbox = async () => { throw new Error("A pending sync must precede inbox reads"); };
    const agenda = await compile(input);
    expect(agenda.steps).toEqual([{ type: "exec", id: "notes:pull", actions: [
      { argv: ["arc", "user", "pull"], text: "arc user pull" },
    ], then: { kind: "recompile", argv: ["arc", "agenda", "session-init", "--json", "--errand", "Concern", "--done", "notes:pull"] } }]);
  });

  it("resolves the queue head and hands its exact key to launch", async () => {
    const { input, inbox } = await createSignalAgendaFixture(entry("11111111", "Queued concern"));
    expect(await setErrandQueue({ schemaVersion: 1, members: [{ id: "11111111", inbox: "personal" }] }, inbox.context))
      .toMatchObject({ state: "set" });
    input.signals = { errand: true, next: true, isolate: true };
    const agenda = await compile(input);
    expect(agenda.orientation).toEqual({ shape: "subject", subject: { kind: "errand", key: "personal:11111111" } });
    expect(agenda.steps).toEqual(expect.arrayContaining([{
      type: "render", surface: "errand-next", text: "Next execute-bound Errand: personal:11111111.",
    }]));
    expect(agenda.steps.at(-1)).toEqual({ type: "fragment", target: {
      kind: "workflow", path: ".arc/system/workflows/arc/run-errand.md",
    }, args: { mode: "launch", fromInbox: "personal:11111111", isolate: true } });
  });

  it("renders an empty queue and stops", async () => {
    const { input } = await createSignalAgendaFixture();
    input.signals = { errand: true, next: true };
    const agenda = await compile(input);
    expect(agenda.steps.at(-2)).toMatchObject({ type: "render", surface: "errand-next", text: "No execute-bound Errand is queued." });
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "stop", autoProceed: false });
    expect(agenda.steps.filter(step => step.type === "offer" || step.type === "fragment")).toEqual([]);
  });

  it("keeps a queue read failure inside a typed recovery instruction", async () => {
    const { input, inbox } = await createSignalAgendaFixture();
    inbox.fixture.store.read = async () => { throw new Error("queue unavailable"); };
    input.signals = { errand: true, next: true };
    const agenda = await compile(input);
    const step = agenda.steps.find(step => step.type === "render" && step.surface === "errand-next");
    expect(step).toMatchObject({ text: expect.stringContaining("queue unavailable") });
    expect(step).toMatchObject({ text: expect.stringContaining("Resolve the reported identity, inbox read, or lock failure.") });
    expect(step).toMatchObject({ text: expect.stringContaining("arc errand next --json") });
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "stop", autoProceed: false });
  });

  it.each([false, true])("offers flagged captures and literal elicitation with isolate=%s", async isolate => {
    const content = "## Errand\n\n" + [entry("11111111", "Held", "- _Hold:_ `true`"),
      entry("22222222", "Remember", "- _Remind:_ `true`"), entry("33333333", "Unflagged")].join("\n\n");
    const { input } = await createSignalAgendaFixture(content);
    input.signals = { errand: true, ...(isolate ? { isolate: true as const } : {}) };
    const agenda = await compile(input);
    expect(agenda.orientation).toEqual({ shape: "subject", subject: { kind: "errand", key: null } });
    expect(agenda.steps.at(-1)).toMatchObject({ type: "offer", id: "errand:pick", ask: "now", choices: [
      { kind: "signal", label: "Held", signal: "errand", value: "Held",
        recompile: ["arc", "agenda", "session-init", "--json", "--errand", "Held", ...(isolate ? ["--isolate"] : [])] },
      { kind: "signal", label: "Remember", signal: "errand", value: "Remember",
        recompile: ["arc", "agenda", "session-init", "--json", "--errand", "Remember", ...(isolate ? ["--isolate"] : [])] },
      { kind: "elicit", signal: "errand", recompile: ["arc", "agenda", "session-init", "--json", ...(isolate ? ["--isolate"] : [])] },
      { kind: "signal", signal: "errand", value: null, decline: true,
        recompile: ["arc", "agenda", "session-init", "--json", "--answered", "errand:pick=decline"] },
    ] });
  });

  it("reports a failed inbox read and keeps only elicitation and decline", async () => {
    const { input } = await createSignalAgendaFixture("## Errand\n\n" + entry("11111111", "Captured concern", "- _Hold:_ `true`"));
    input.signals = { errand: true };
    const readUserInbox = input.entry.readUserInbox;
    input.entry.readUserInbox = async () => { throw new Error("personal inbox unavailable"); };
    const agenda = await compile(input);
    expect(agenda.steps).toEqual(expect.arrayContaining([expect.objectContaining({ type: "note", surface: "errand-inbox",
      text: expect.stringContaining("personal inbox unavailable") })]));
    expect(agenda.steps.at(-1)).toMatchObject({ type: "offer", choices: [
      { kind: "elicit", signal: "errand" }, { kind: "signal", value: null, decline: true },
    ] });
    input.entry.readUserInbox = readUserInbox;
    const repaired = await compile(input);
    expect(repaired.steps.at(-1)).toMatchObject({ type: "offer", choices: expect.arrayContaining([
      expect.objectContaining({ kind: "signal", value: "Captured concern" }),
    ]) });
    expect(repaired.steps).not.toEqual(expect.arrayContaining([expect.objectContaining({ surface: "errand-inbox" })]));
  });

  it.each(["Hold", "Remind"])("adopts an exact flagged capture with %s", async flag => {
    const { input } = await createSignalAgendaFixture("## Errand\n\n" + entry("11111111", "Captured concern",
      `- _${flag}:_ \`true\`\n\nBody`));
    input.signals = { errand: "Captured concern" };
    const agenda = await compile(input);
    expect(agenda.steps.at(-1)).toMatchObject({ type: "fragment", args: {
      mode: "launch", seed: "Captured concern", fromInbox: "Captured concern", isolate: false,
    } });
  });

  it("hands a seeded concern to launch with its literal seed and isolation preference", async () => {
    const { input } = await createSignalAgendaFixture();
    input.signals = { errand: "Fix a literal concern", isolate: true };
    const agenda = await compile(input);
    expect(agenda.orientation).toEqual({ shape: "subject", subject: { kind: "errand", key: "Fix a literal concern" } });
    expect(agenda.steps.at(-1)).toEqual({ type: "fragment", target: {
      kind: "workflow", path: ".arc/system/workflows/arc/run-errand.md",
    }, args: { mode: "launch", seed: "Fix a literal concern", isolate: true } });
    expect(agenda.steps.filter(step => step.type === "read").every(step => !step.path.includes("active/"))).toBe(true);
    expect(agenda.steps.filter(step => step.type === "exec")).toEqual([]);
  });
});
