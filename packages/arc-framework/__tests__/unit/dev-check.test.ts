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
  selectBundleInputs,
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

describe("selectBundleInputs", () => {
  const PKG = "/repo/packages/arc-framework";

  it("returns only src/*.ts inputs as absolute paths, excluding deps and non-ts", () => {
    const metafile = {
      inputs: {
        "src/cli.ts": { bytes: 1 },
        "src/lib/dev-check.ts": { bytes: 1 },
        "node_modules/commander/index.js": { bytes: 1 },
        "src/styles.css": { bytes: 1 },
      },
    };
    expect(selectBundleInputs(metafile, PKG)).toEqual([
      `${PKG}/src/cli.ts`,
      `${PKG}/src/lib/dev-check.ts`,
    ]);
  });

  it("returns null when no src inputs are present (so the caller falls back to a full walk)", () => {
    expect(selectBundleInputs({ inputs: { "node_modules/x/i.js": {} } }, PKG)).toBeNull();
  });

  it("returns null on an unusable metafile shape", () => {
    expect(selectBundleInputs(null, PKG)).toBeNull();
    expect(selectBundleInputs({}, PKG)).toBeNull();
    expect(selectBundleInputs({ inputs: 5 }, PKG)).toBeNull();
  });
});
