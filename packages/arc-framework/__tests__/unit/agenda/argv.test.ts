/** Recompile arguments preserve decisions and keep each literal value in one argument. */

import { readFile } from "node:fs/promises";
import { Command, Option } from "commander";
import { describe, expect, it } from "vitest";
import { agendaQuestionKey, appendAgendaOption, buildAgendaArgv } from "../../../src/commands/agenda/argv.js";
import type { AgendaCliOptions } from "../../../src/commands/agenda/input.js";
import { parseAgendaInput, type AgendaParseResult } from "../../../src/commands/agenda/parse.js";
import type { AgendaAnswers, AgendaSignals } from "../../../src/commands/agenda/schema.js";
import { scanCommanderSource } from "../../../src/lib/command-input/source-scanner.js";

const prefix = ["arc", "agenda", "session-init", "--json"];
const empty: AgendaAnswers = { answered: {}, done: [] };

async function parseNonRepeatedOptions(argv: string[]): Promise<AgendaParseResult> {
  const sourceText = await readFile(new URL("../../../src/cli.ts", import.meta.url), "utf8");
  const declaration = scanCommanderSource({ file: "cli.ts", sourceText }).commands.find(command => command.path === "agenda");
  if (!declaration) throw new Error("No registered agenda command");
  const command = new Command("agenda").exitOverride();
  for (const operand of declaration.operands) {
    command.argument(operand.required ? `<${operand.name}>` : `[${operand.name}]`);
  }
  for (const option of declaration.options) command.addOption(new Option(option.flags));
  let result: AgendaParseResult | undefined;
  command.action((ceremony: string, seed: string | undefined, options: AgendaCliOptions) => {
    result = parseAgendaInput({ ceremony, seed, ...options });
  });
  command.parse(argv.slice(2), { from: "user" });
  if (!result) throw new Error("The registered argument grammar produced no invocation");
  return result;
}

describe("agenda recompile arguments", () => {
  it("builds the fixed machine-readable invocation", () => {
    expect(buildAgendaArgv({}, empty)).toEqual(prefix);
  });

  it("preserves received values and decisions as individual arguments", () => {
    const signals: AgendaSignals = { seed: "spec file.md", plan: "a=+ stub", next: true, start: "launch" };
    const answers: AgendaAnswers = { answered: { "notes:pull": "decline", "worktree:pull": "accept" },
      done: ["notes:load", "fragment:read-load-set"] };
    expect(buildAgendaArgv(signals, answers)).toEqual([...prefix,
      "spec file.md", "--plan", "a=+ stub", "--next", "--start", "launch",
      "--answered", "notes:pull=decline", "--answered", "worktree:pull=accept",
      "--done", "notes:load", "--done", "fragment:read-load-set",
    ]);
  });

  it("sets a named signal", () => {
    expect(buildAgendaArgv({}, empty, { signal: { signal: "plan", value: "a stub" } }))
      .toEqual([...prefix, "--plan", "a stub"]);
  });

  it("sets a bare signal", () => {
    expect(buildAgendaArgv({}, empty, { signal: { signal: "housekeep", value: true } }))
      .toEqual([...prefix, "--housekeep"]);
  });

  it("clears an errand's isolation with its signal", () => {
    expect(buildAgendaArgv({ errand: true, isolate: true, start: "launch" }, empty,
      { signal: { signal: "errand", value: null } })).toEqual([...prefix, "--start", "launch"]);
  });

  it("drops the shortcut and seed without changing the received intent", () => {
    const signals: AgendaSignals = { seed: "source", next: true, start: "launch" };
    expect(buildAgendaArgv(signals, empty, { dropNext: true, dropSeed: true })).toEqual([...prefix, "--start", "launch"]);
    expect(signals).toEqual({ seed: "source", next: true, start: "launch" });
  });

  it("omits an elicited signal while retaining the requested errand isolation", () => {
    expect(buildAgendaArgv({ errand: true, isolate: true }, empty, { elicit: "errand" }))
      .toEqual([...prefix, "--isolate"]);
  });

  it("omits an elicited planning signal", () => {
    expect(buildAgendaArgv({ plan: "old stub" }, empty, { elicit: "plan" })).toEqual(prefix);
  });

  it("adds implied answers and completed ids while retaining earlier decisions", () => {
    const answers: AgendaAnswers = { answered: { "notes:pull": "decline" }, done: ["notes:load"] };
    expect(buildAgendaArgv({}, answers, { answered: { "worktree:pull": "accept" }, done: ["fragment:read-load-set"] }))
      .toEqual([...prefix, "--answered", "notes:pull=decline", "--answered", "worktree:pull=accept",
        "--done", "notes:load", "--done", "fragment:read-load-set"]);
    expect(answers).toEqual({ answered: { "notes:pull": "decline" }, done: ["notes:load"] });
  });

  it("refuses an implied decision that contradicts a recorded answer", () => {
    expect(() => buildAgendaArgv({}, { answered: { "notes:pull": "decline" }, done: [] },
      { answered: { "notes:pull": "accept" } })).toThrow();
  });

  it("encodes variable key segments so equals, plus and spaces round-trip", () => {
    const operand = "a=b+ value";
    const key = agendaQuestionKey("plan-stub", operand);
    expect(key).toBe("plan-stub:a%3Db%2B%20value");
    expect(decodeURIComponent(key.slice(key.indexOf(":") + 1))).toBe(operand);
  });

  it("encodes the optional operand segment", () => {
    expect(agendaQuestionKey("materialize", "work-unit", "a=b+ value"))
      .toBe("materialize:work-unit:a%3Db%2B%20value");
  });

  it.each([{ plan: "-stub", seed: "--context" }, { errand: "--housekeep", isolate: true }, { seed: "-flag" }] as const)(
    "round-trips leading-dash values through the registered argument grammar: %j", async signals => {
      expect(await parseNonRepeatedOptions(buildAgendaArgv(signals, empty))).toEqual({ ok: true, signals, answers: empty });
    },
  );

  it("can add an elicited concern while retaining a leading-dash positional seed", async () => {
    const signals: AgendaSignals = { errand: true, isolate: true, seed: "--context" };
    const carried = buildAgendaArgv(signals, empty, { elicit: "errand" });
    appendAgendaOption(carried, "--errand", "fix a concern");
    expect(await parseNonRepeatedOptions(carried))
      .toEqual({ ok: true, signals: { seed: "--context", errand: "fix a concern", isolate: true }, answers: empty });
  });
  it.each(["errand", "plan"] as const)("keeps an elicited %s answer literal beside a leading-dash seed", async signal => {
    const carried = buildAgendaArgv({ [signal]: true, seed: "--context" }, empty, { elicit: signal });
    appendAgendaOption(carried, `--${signal}`, "--housekeep");
    expect(await parseNonRepeatedOptions(carried))
      .toEqual({ ok: true, signals: { seed: "--context", [signal]: "--housekeep" }, answers: empty });
  });
});
