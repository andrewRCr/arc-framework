/** Errand-open human and JSON command-boundary parity. */

import { describe, expect, it } from "vitest";

import { formatErrandOpenResult } from "../../../src/handlers/errand.js";
import { createLocusMutationResult } from "../../../src/lib/locus/mutation.js";

const refusal = createLocusMutationResult({
  outcome: "refused",
  operation: "errand-open",
  reason: "cold-entry-required",
  recommendedPromptText: "Start a cold session.",
});

describe("errand open result rendering", () => {
  it("renders JSON from the exact validated producer result", () => {
    const output = formatErrandOpenResult(refusal, true);
    expect(output).toEqual({ stream: "stdout", text: `${JSON.stringify(refusal)}\n`, exitCode: 1 });
    expect(JSON.parse(output.text)).toStrictEqual(refusal);
  });

  it("renders the same refusal reason and narration for humans", () => {
    expect(formatErrandOpenResult(refusal, false)).toEqual({
      stream: "stderr",
      text: "Refused [cold-entry-required]: Start a cold session.",
      exitCode: 1,
    });
  });
});
