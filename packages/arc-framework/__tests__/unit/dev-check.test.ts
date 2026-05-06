/**
 * Unit tests for the dev-mode stale-build check.
 *
 * Covers the pure verdict function with injected fs primitives — no real
 * filesystem touched. Allowlist branching and stderr rendering are exercised
 * at the cli.ts integration boundary, not here.
 */

import { describe, it, expect } from "vitest";

import {
  checkDevBuildStaleness,
  type DevCheckDeps,
} from "../../src/lib/dev-check.js";

function deps(overrides: Partial<DevCheckDeps>): DevCheckDeps {
  return {
    newestSrc: () => null,
    distMtimeMs: () => null,
    now: () => 1_000_000_000_000,
    ...overrides,
  };
}

describe("checkDevBuildStaleness", () => {
  const NOW = 1_000_000_000_000;

  it("returns skip when src/ is absent (published install)", () => {
    const result = checkDevBuildStaleness(
      deps({
        newestSrc: () => null,
        distMtimeMs: () => 999_999_990_000,
        now: () => NOW,
      }),
    );

    expect(result).toEqual({ kind: "skip" });
  });

  it("returns stale with null distAge when dist/cli.js is missing", () => {
    const result = checkDevBuildStaleness(
      deps({
        newestSrc: () => ({ mtimeMs: NOW - 30_000, path: "src/cli.ts" }),
        distMtimeMs: () => null,
        now: () => NOW,
      }),
    );

    expect(result).toEqual({
      kind: "stale",
      srcAge: 30,
      distAge: null,
      newestSrc: "src/cli.ts",
    });
  });

  it("returns stale with computed ages when src is newer than dist", () => {
    const result = checkDevBuildStaleness(
      deps({
        newestSrc: () => ({ mtimeMs: NOW - 12_000, path: "src/lib/foo.ts" }),
        distMtimeMs: () => NOW - 7_200_000,
        now: () => NOW,
      }),
    );

    expect(result).toEqual({
      kind: "stale",
      srcAge: 12,
      distAge: 7200,
      newestSrc: "src/lib/foo.ts",
    });
  });

  it("returns fresh when dist is newer than every src file", () => {
    const result = checkDevBuildStaleness(
      deps({
        newestSrc: () => ({ mtimeMs: NOW - 600_000, path: "src/cli.ts" }),
        distMtimeMs: () => NOW - 60_000,
        now: () => NOW,
      }),
    );

    expect(result).toEqual({ kind: "fresh" });
  });
});
