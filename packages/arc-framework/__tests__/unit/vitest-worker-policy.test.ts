import { describe, expect, it } from "vitest";

import { resolveVitestMaxWorkers } from "../helpers/vitest-worker-policy.js";

describe("Vitest worker policy", () => {
  it("caps local runs at half available parallelism and eight workers with a one-worker floor", () => {
    for (const [parallelism, expected] of [[1, 1], [2, 1], [4, 2], [16, 8], [24, 8], [64, 8]] as const) {
      expect(resolveVitestMaxWorkers({}, parallelism)).toBe(expected);
    }
    expect(resolveVitestMaxWorkers({ CI: "false" }, 24)).toBe(8);
    expect(resolveVitestMaxWorkers({ CI: "0" }, 24)).toBe(8);
  });

  it("leaves ordinary CI on native sizing", () => {
    for (const ci of ["true", " TRUE ", "1"]) {
      expect(resolveVitestMaxWorkers({ CI: ci }, 24)).toBeUndefined();
    }
    expect(resolveVitestMaxWorkers({ CI: "true", VITEST_MAX_WORKERS: "" }, 24)).toBeUndefined();
  });

  it("honors numeric and percentage capacity overrides", () => {
    expect(resolveVitestMaxWorkers({ CI: "true", VITEST_MAX_WORKERS: "1" })).toBe(1);
    expect(resolveVitestMaxWorkers({ CI: "true", VITEST_MAX_WORKERS: "25%" })).toBe("25%");
    expect(resolveVitestMaxWorkers({ VITEST_MAX_WORKERS: "12" }, 24)).toBe(12);
    expect(resolveVitestMaxWorkers({ VITEST_MAX_WORKERS: "50%" }, 24)).toBe("50%");
  });

  it("rejects malformed capacity overrides", () => {
    expect(() => resolveVitestMaxWorkers({ CI: "true", VITEST_MAX_WORKERS: "0" }))
      .toThrow(/must be a positive integer or a percentage/u);
    expect(() => resolveVitestMaxWorkers({ CI: "true", VITEST_MAX_WORKERS: "9007199254740992" }))
      .toThrow(/must be a positive safe integer or a percentage/u);
  });
});
