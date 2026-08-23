import { describe, expect, it } from "vitest";

import { resolveVitestMaxWorkers } from "../helpers/vitest-worker-policy.js";

describe("Vitest worker policy", () => {
  it("caps local runs while leaving ordinary CI on native sizing", () => {
    expect(resolveVitestMaxWorkers({})).toBe("50%");
    expect(resolveVitestMaxWorkers({ CI: "true" })).toBeUndefined();
    expect(resolveVitestMaxWorkers({ CI: "true", VITEST_MAX_WORKERS: "" })).toBeUndefined();
  });

  it("honors numeric and percentage capacity overrides", () => {
    expect(resolveVitestMaxWorkers({ CI: "true", VITEST_MAX_WORKERS: "1" })).toBe(1);
    expect(resolveVitestMaxWorkers({ CI: "true", VITEST_MAX_WORKERS: "25%" })).toBe("25%");
  });

  it("rejects malformed capacity overrides", () => {
    expect(() => resolveVitestMaxWorkers({ CI: "true", VITEST_MAX_WORKERS: "0" }))
      .toThrow(/must be a positive integer or a percentage/u);
    expect(() => resolveVitestMaxWorkers({ CI: "true", VITEST_MAX_WORKERS: "9007199254740992" }))
      .toThrow(/must be a positive safe integer or a percentage/u);
  });
});
