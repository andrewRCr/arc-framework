/** Unit coverage for explicit test-cost CLI mode stamps. */

import { describe, expect, it } from "vitest";

import { parseTestCostCli } from "../../src/lib/test-cost/cli.js";

describe("parseTestCostCli", () => {
  it("parses every measurement-mode axis without defaults", () => {
    expect(parseTestCostCli([
      "--condition", "tier-isolated",
      "--project-set", "integration",
      "--workers", "12",
    ])).toEqual({
      mode: { condition: "tier-isolated", projectSet: "integration", workerSizing: "12" },
    });
  });

  it.each(["--condition", "--project-set", "--workers"])("refuses a missing %s", (missing) => {
    const args = [
      "--condition", "tier-isolated",
      "--project-set", "integration",
      "--workers", "12",
    ];
    const index = args.indexOf(missing);
    args.splice(index, 2);
    expect(() => parseTestCostCli(args)).toThrow();
  });
});
