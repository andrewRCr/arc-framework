/** Validate-for-effect behavior shared by session-envelope producer boundaries. */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ArcError } from "../../../src/lib/kernel/index.js";
import { assertSessionEnvelopeContract } from "../../../src/lib/session-envelope/validation.js";

describe("session-envelope producer validation", () => {
  it("accepts a valid producer without replacing or mutating it", () => {
    const value = { state: "valid", retained: { exact: true } };
    const before = JSON.stringify(value);
    assertSessionEnvelopeContract("fixture-contract", z.object({ state: z.literal("valid") }).loose(), value);
    expect(JSON.stringify(value)).toBe(before);
  });

  it("throws a stable ArcError with normalized multi-issue paths", () => {
    const schema = z.strictObject({
      first: z.string().refine(() => false, "first bad"),
      nested: z.strictObject({ second: z.string().refine(() => false, "second bad") }),
    });

    let thrown: unknown;
    try {
      assertSessionEnvelopeContract(
        "fixture-contract",
        schema,
        { first: "value", nested: { second: "value" } },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ArcError);
    expect(thrown).toMatchObject({
      code: "session-envelope.invalid",
      message: "fixture-contract: first: first bad; nested.second: second bad",
    });
  });
});
