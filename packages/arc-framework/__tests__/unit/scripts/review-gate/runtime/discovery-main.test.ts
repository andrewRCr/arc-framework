import { describe, expect, it } from "vitest";

import type { HttpFetch } from "../../../../../src/scripts/review-gate/hosts/github/api/http.js";
import { runDiscoveryMain } from "../../../../../src/scripts/review-gate/runtime/discovery-main.js";

describe("review-gate discovery transport", () => {
  it("bounds every GitHub API request with an abort signal", async () => {
    let signal: AbortSignal | undefined;
    const fetch: HttpFetch = async (_url, init) => {
      signal = init.signal;
      return {
        status: 200,
        headers: { get: () => null },
        text: async () => "[]",
      };
    };

    await expect(runDiscoveryMain({
      eventName: "schedule",
      payload: { repository: { id: 42 } },
      expectedAppId: 91,
      repository: "o/r",
      token: "token",
      fetch,
    })).resolves.toBeNull();
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});
