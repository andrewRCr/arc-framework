/** Agenda operand and flag acquisition preserves the literal invocation. */

import { describe, expect, it } from "vitest";
import { AgendaCommandInputSchema } from "../../../src/commands/agenda/input.js";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../helpers/schema-assertion.js";

describe("raw agenda command input", () => {
  it("preserves all operands and repeatable options while rejecting unknown fields", () => {
    const value = { ceremony: "session-init", seed: "draft-example.md", plan: "example", errand: true,
      next: true, isolate: true, start: "example", housekeep: true, context: true, json: true,
      answered: ["notes:pull=accept", "worktree:pull=decline"], done: ["notes:load", "fragment:read-load-set"] };
    expect(assertSchemaAccepts(AgendaCommandInputSchema, value)).toEqual(value);
    assertSchemaRefuses(AgendaCommandInputSchema, { ...value, unexpected: true });
  });

  it("acquires bare optional signals as true and named signals as one string", () => {
    for (const value of [true, "fix a concern"]) {
      expect(assertSchemaAccepts(AgendaCommandInputSchema, { ceremony: "session-init", errand: value }))
        .toEqual({ ceremony: "session-init", errand: value });
      assertSchemaAccepts(AgendaCommandInputSchema, { ceremony: "session-init", plan: value });
    }
    assertSchemaRefuses(AgendaCommandInputSchema, { ceremony: "session-init", plan: false });
    assertSchemaRefuses(AgendaCommandInputSchema, { ceremony: "session-init", errand: ["two", "values"] });
  });

  it("requires a ceremony and arrays for accumulated answers and completed ids", () => {
    assertSchemaAccepts(AgendaCommandInputSchema, { ceremony: "unsupported" });
    assertSchemaRefuses(AgendaCommandInputSchema, {});
    assertSchemaRefuses(AgendaCommandInputSchema, { ceremony: "session-init", answered: "notes:pull=accept" });
    assertSchemaRefuses(AgendaCommandInputSchema, { ceremony: "session-init", done: "notes:load" });
  });
});
