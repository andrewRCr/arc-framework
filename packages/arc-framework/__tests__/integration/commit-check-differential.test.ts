/** Temporary pre-cutover differential runner against the Bash hook. */

import { describe, expect, it } from "vitest";
import { COMMIT_MESSAGE_FIXTURES } from "../fixtures/commit-msg/cases.js";
import { runBashFixture } from "../helpers/commit-message-fixture.js";

describe("Bash-to-TypeScript commit-message differential", () => {
  for (const fixture of COMMIT_MESSAGE_FIXTURES) {
    it(fixture.name, async () => {
      const bashVerdict = await runBashFixture(fixture);
      const expectedBashVerdict = fixture.divergence
        ? fixture.bashVerdict
        : fixture.expected.verdict;
      expect(bashVerdict).toBe(expectedBashVerdict);
    });
  }
});
