import { describe, expect, it } from "vitest";

import { resolveHealthLatestVersion } from "../../../src/handlers/installation.js";

describe("resolveHealthLatestVersion", () => {
  it("skips the registry boundary when update checks are disabled", async () => {
    const result = await resolveHealthLatestVersion(
      { ARC_DISABLE_UPDATE_CHECKS: "1" },
      () => Promise.reject(new Error("registry request started")),
    );

    expect(result).toBeNull();
  });

  it("keeps the registry result when update checks are enabled", async () => {
    const result = await resolveHealthLatestVersion(
      {},
      () => Promise.resolve("2.3.4"),
    );

    expect(result).toBe("2.3.4");
  });
});
