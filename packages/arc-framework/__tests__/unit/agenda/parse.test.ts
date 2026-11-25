/** Signal precedence inputs and literal answer carriage reject ambiguous acquisition. */

import { describe, expect, it } from "vitest";
import { parseAgendaInput } from "../../../src/commands/agenda/parse.js";

const input = (options: Record<string, unknown> = {}) => ({ ceremony: "session-init", ...options });

function refused(options: Record<string, unknown>, flags: string[]): void {
  expect(parseAgendaInput(input(options))).toMatchObject({
    ok: false, refusal: { code: "invalid-input", flags, row: null, remedy: expect.any(String) },
  });
}

describe("agenda invocation parsing", () => {
  it("refuses other ceremonies and names the accepted ceremony", () => {
    expect(parseAgendaInput({ ceremony: "handoff" })).toMatchObject({
      ok: false, refusal: { flags: ["ceremony"], remedy: expect.stringContaining("session-init") },
    });
  });

  const pairs = [["errand", "housekeep"], ["errand", "plan"], ["errand", "context"],
    ["housekeep", "plan"], ["housekeep", "context"], ["plan", "context"]] as const;
  it.each(pairs)("refuses simultaneous --%s and --%s", (first, second) => {
    refused({ [first]: true, [second]: true }, [`--${first}`, `--${second}`]);
  });

  const refusals: [string, Record<string, unknown>, string[]][] = [
    ["named errand-next", { errand: "fix a concern", next: true }, ["--errand", "--next"]],
    ["isolation without errand", { isolate: true }, ["--isolate"]],
    ["answer without equals", { answered: ["notes:pull"] }, ["--answered"]],
    ["unknown answer value", { answered: ["notes:pull=yes"] }, ["--answered"]],
    ["empty question key", { answered: ["=accept"] }, ["--answered"]],
    ["contradictory answers", { answered: ["notes:pull=accept", "notes:pull=decline"] }, ["--answered"]],
    ["invalid raw signal type", { plan: false }, ["--plan"]],
    ["missing ceremony", { ceremony: undefined }, ["ceremony"]],
  ];
  it.each(refusals)("refuses %s with the offending input named", (_label, options, flags) => {
    refused(options, flags);
  });

  it.each(["notes", ":pull", "notes:", "notes:pull:", "notes:pull:one:two", "notes:pull+worktree:pull"])(
    "refuses malformed completed id %s", value => { refused({ done: [value] }, ["--done"]); },
  );

  it.each(["garbage", " ", ":pull", "notes:", "notes:pull:", "notes:pull:one:two", "notes:pull+worktree:pull"])(
    "refuses malformed answered key %s", key => { refused({ answered: [`${key}=accept`] }, ["--answered"]); },
  );

  it.each(["plan-stub:", "notes:pull", "branch-gone:resolved:example", "materialize:a%2Bb%3Ac", "plan-stub:a=b"])(
    "preserves a valid individual answered key %s", key => {
      expect(parseAgendaInput(input({ answered: [`${key}=decline`] })))
        .toMatchObject({ ok: true, answers: { answered: { [key]: "decline" } } });
    },
  );

  it("accepts bare errand-next", () => {
    expect(parseAgendaInput(input({ errand: true, next: true }))).toEqual({
      ok: true, signals: { errand: true, next: true }, answers: { answered: {}, done: [] },
    });
  });

  it("accepts isolation with an errand", () => {
    expect(parseAgendaInput(input({ errand: true, isolate: true }))).toMatchObject({
      ok: true, signals: { errand: true, isolate: true },
    });
  });

  it("splits an answer at its final equals sign", () => {
    expect(parseAgendaInput(input({ answered: ["plan-stub:a=b=accept"] }))).toEqual({
      ok: true, signals: {}, answers: { answered: { "plan-stub:a=b": "accept" }, done: [] },
    });
  });

  it("collapses identical recorded answers", () => {
    expect(parseAgendaInput(input({ answered: ["notes:pull=decline", "notes:pull=decline"] }))).toMatchObject({
      ok: true, answers: { answered: { "notes:pull": "decline" }, done: [] },
    });
  });

  it("preserves completed action keys and their optional operand", () => {
    const done = ["notes:pull", "branch-gone:resolved:example", "fragment:read-load-set"];
    expect(parseAgendaInput(input({ done }))).toMatchObject({ ok: true, answers: { done } });
  });

  it.each([{ plan: true }, { plan: "stub value" }, { errand: true }, { errand: "fix a concern", isolate: true },
    { seed: "a seed", start: "example", next: true, housekeep: true }, { context: true }])(
    "preserves exact signal values %j", signals => {
      expect(parseAgendaInput(input({ ...signals, json: true }))).toEqual({
        ok: true, signals, answers: { answered: {}, done: [] },
      });
    },
  );
});
