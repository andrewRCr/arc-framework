/** Structural contract for the reusable ARC configuration compatibility corpus. */

import { describe, expect, it } from "vitest";

import {
  CONFIG_COMPATIBILITY_CASES,
  CONFIG_COMPATIBILITY_KINDS,
} from "../../fixtures/config/cases.js";

describe("configuration compatibility corpus", () => {
  it("covers every compatibility input kind with unique stable ids", () => {
    const ids = CONFIG_COMPATIBILITY_CASES.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(CONFIG_COMPATIBILITY_CASES.flatMap(({ kinds }) => kinds))).toEqual(
      new Set(CONFIG_COMPATIBILITY_KINDS),
    );
  });

  it("records data-only expectations for every adapter family", () => {
    for (const fixture of CONFIG_COMPATIBILITY_CASES) {
      expect(fixture.expected).toEqual({
        status: expect.any(Object),
        resolved: expect.any(Object),
        commitCheck: expect.any(Object),
        worktree: expect.any(Object),
        validator: expect.any(Object),
      });
    }
  });
});
