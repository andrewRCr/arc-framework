/** Durable TypeScript acceptance runner for the shared commit-message corpus. */

import { describe, expect, it } from "vitest";
import { COMMIT_MESSAGE_FIXTURES } from "../fixtures/commit-msg/cases.js";
import { runTypeScriptFixture } from "../helpers/commit-message-fixture.js";

describe("canonical commit-message corpus", () => {
  for (const fixture of COMMIT_MESSAGE_FIXTURES) {
    it(fixture.name, async () => {
      const outcome = await runTypeScriptFixture(fixture);
      expect(outcome).toMatchObject({ kind: "validated", verdict: fixture.expected.verdict });
      if (outcome.kind !== "validated") throw new Error("expected validated outcome");
      const codes = outcome.findings.map(({ code }) => code);
      expect(codes).toEqual(fixture.expected.findingCodes);
    });
  }
});
