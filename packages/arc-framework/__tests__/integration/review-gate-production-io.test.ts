import { describe, expect, it } from "vitest";

import type { GhProcessError } from "../../src/scripts/review-gate/runtime/gh-action-port.js";
import { productionProcessRunner } from "../../src/scripts/review-gate/runtime/production-io.js";

describe("production gh process failure classification", () => {
  it.each([
    "You are not logged into any GitHub hosts. To log in, run: gh auth login",
    "No authentication information found",
  ])("classifies a logged-out diagnostic as authentication failure", async (diagnostic) => {
    const failure = productionProcessRunner.run(process.execPath, [
      "-e",
      `process.stderr.write(${JSON.stringify(diagnostic)}); process.exit(1);`,
    ]);
    await expect(failure).rejects.toMatchObject({
      name: "GhProcessError",
      kind: "authentication-failure",
    } satisfies Partial<GhProcessError>);
  });
});
