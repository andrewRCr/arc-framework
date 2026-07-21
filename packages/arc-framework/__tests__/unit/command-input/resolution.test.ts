import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import {
  CommandInputError,
  acquireInputValue,
  adaptCommandInputError,
  collectMissingRequirements,
  resolveConfirmation,
  resolveInputValue,
  resolvePromptInput,
  type InputResolution,
} from "../../../src/lib/command-input/index.js";

describe("command-input resolution", () => {
  it("keeps every acquisition outcome distinguishable", () => {
    expectTypeOf<InputResolution<string>["kind"]>()
      .toEqualTypeOf<"resolved" | "cancelled" | "unavailable" | "invalid">();
    expectTypeOf<Extract<InputResolution<string>, { kind: "resolved" }>["source"]>()
      .toEqualTypeOf<"argument" | "stdin" | "prompt" | "derived" | "default">();

    expect(resolveInputValue(z.string().min(2), { kind: "value", value: "ok", source: "argument" }))
      .toEqual({ kind: "resolved", value: "ok", source: "argument" });
    expect(resolveInputValue(z.string(), { kind: "cancelled" })).toEqual({ kind: "cancelled" });
    expect(resolveInputValue(z.string(), {
      kind: "missing",
      requirement: { name: "name", acceptedSyntax: ["<name>", "--name <name>"] },
    })).toEqual({
      kind: "unavailable",
      missing: [{ name: "name", acceptedSyntax: ["<name>", "--name <name>"] }],
    });
    expect(resolveInputValue(z.object({ value: z.string().min(2) }), {
      kind: "value",
      value: { value: "x" },
      source: "prompt",
    })).toMatchObject({ kind: "invalid", issues: [{ path: ["value"] }] });
  });

  it("aggregates independently knowable missing requirements", () => {
    expect(collectMissingRequirements([
      { name: "commitment", acceptedSyntax: ["--commitment <tier>"] },
      { name: "priority", acceptedSyntax: ["--priority <priority>"] },
    ])).toEqual({
      kind: "unavailable",
      missing: [
        { name: "commitment", acceptedSyntax: ["--commitment <tier>"] },
        { name: "priority", acceptedSyntax: ["--priority <priority>"] },
      ],
    });
  });

  it("applies defaults only when the site declares them and preserves schema diagnostics", () => {
    const schema = z.string().min(2);
    expect(acquireInputValue(schema, {
      safeDefault: { declared: true, value: "default" },
      requirement: { name: "value", acceptedSyntax: ["--value <value>"] },
    })).toEqual({ kind: "resolved", value: "default", source: "default" });
    expect(acquireInputValue(schema, {
      safeDefault: { declared: false, value: "invented" },
      requirement: { name: "value", acceptedSyntax: ["--value <value>"] },
    })).toMatchObject({ kind: "unavailable" });
    expect(acquireInputValue(schema, {
      supplied: { value: "x" },
      safeDefault: { declared: true, value: "default" },
      requirement: { name: "value", acceptedSyntax: ["--value <value>"] },
    })).toMatchObject({ kind: "invalid", issues: [{ path: [] }] });
  });

  it("normalizes prompt cancellation before schema parsing", () => {
    const cancellation = Symbol("cancelled");
    expect(resolvePromptInput(z.string(), cancellation)).toEqual({ kind: "cancelled" });
    expect(resolvePromptInput(z.string().min(2), "ok"))
      .toEqual({ kind: "resolved", value: "ok", source: "prompt" });
  });

  it("keeps courtesy, protected, safety override, and evidence authority distinct", () => {
    const forbidden = { interaction: "forbidden", confirmation: "ask" } as const;
    const accepted = { interaction: "forbidden", confirmation: "accept" } as const;

    expect(resolveConfirmation("courtesy", forbidden)).toEqual({
      kind: "resolved", value: true, source: "default",
    });
    expect(resolveConfirmation("protected", forbidden)).toMatchObject({ kind: "unavailable" });
    expect(resolveConfirmation("protected", accepted)).toEqual({
      kind: "resolved", value: true, source: "argument",
    });
    expect(resolveConfirmation("interactive-only", accepted)).toMatchObject({ kind: "unavailable" });
    expect(resolveConfirmation("evidence", accepted)).toMatchObject({ kind: "unavailable" });
    expect(resolveConfirmation("evidence", forbidden, { explicit: true })).toEqual({
      kind: "resolved", value: true, source: "argument",
    });
  });

  it("adapts unknown failures without leaking raw values", () => {
    const result = adaptCommandInputError({ secret: "do-not-print" }, {
      code: "command-input.unexpected",
      message: "Could not resolve command input.",
    });
    expect(result).toBeInstanceOf(CommandInputError);
    expect(result).toMatchObject({ code: "command-input.unexpected", message: "Could not resolve command input." });
    expect(String(result)).not.toContain("do-not-print");
  });
});
