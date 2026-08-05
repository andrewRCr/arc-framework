/**
 * Unit tests for the dev-mode stale-build check.
 *
 * Covers the pure verdict function with injected fs primitives, and the
 * dependency factory against temporary fixture layouts. Refusal, the
 * compaction-seed exception, and stderr rendering live at the cli.ts preAction
 * boundary and are exercised end to end, not here.
 */

import { describe, it, expect } from "vitest";

import {
  checkDevBuildStaleness,
  createDevCheckDeps,
  hashSourceInputs,
  isBuiltBundleEntry,
  selectBundleInputs,
  type DevCheckDeps,
} from "../../src/lib/dev-check.js";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

  it("returns stale with computed ages when src is newer than dist (mtime fallback)", () => {
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

  it("returns fresh when dist is newer than every src file (mtime fallback)", () => {
    const result = checkDevBuildStaleness(
      deps({
        newestSrc: () => ({ mtimeMs: NOW - 600_000, path: "src/cli.ts" }),
        distMtimeMs: () => NOW - 60_000,
        now: () => NOW,
      }),
    );

    expect(result).toEqual({ kind: "fresh" });
  });

  it("returns fresh on mtime-only bump when content stamps match", () => {
    // The second failure mode: a tool touched the file without editing it, so
    // mtime is ahead of dist but the bytes the build consumed are unchanged.
    const result = checkDevBuildStaleness(
      deps({
        newestSrc: () => ({ mtimeMs: NOW - 1_000, path: "src/lib/foo.ts" }),
        distMtimeMs: () => NOW - 7_200_000,
        now: () => NOW,
        currentInputsHash: () => "abc123",
        stampedInputsHash: () => "abc123",
      }),
    );

    expect(result).toEqual({ kind: "fresh" });
  });

  it("returns stale when content stamps diverge even if mtime looks fresh", () => {
    // Content changed but a clock skew / restored mtime would hide it — the
    // stamp is the authoritative signal.
    const result = checkDevBuildStaleness(
      deps({
        newestSrc: () => ({ mtimeMs: NOW - 600_000, path: "src/cli.ts" }),
        distMtimeMs: () => NOW - 60_000,
        now: () => NOW,
        currentInputsHash: () => "new-content",
        stampedInputsHash: () => "old-content",
      }),
    );

    expect(result).toEqual({
      kind: "stale",
      srcAge: 600,
      distAge: 60,
      newestSrc: "src/cli.ts",
    });
  });

  it("falls back to mtime when only one side of the stamp pair is available", () => {
    const mtimeStale = checkDevBuildStaleness(
      deps({
        newestSrc: () => ({ mtimeMs: NOW - 1_000, path: "src/cli.ts" }),
        distMtimeMs: () => NOW - 7_200_000,
        now: () => NOW,
        currentInputsHash: () => "abc",
        stampedInputsHash: () => null,
      }),
    );
    expect(mtimeStale.kind).toBe("stale");

    const mtimeFresh = checkDevBuildStaleness(
      deps({
        newestSrc: () => ({ mtimeMs: NOW - 600_000, path: "src/cli.ts" }),
        distMtimeMs: () => NOW - 60_000,
        now: () => NOW,
        currentInputsHash: () => null,
        stampedInputsHash: () => "abc",
      }),
    );
    expect(mtimeFresh).toEqual({ kind: "fresh" });
  });
});

describe("isBuiltBundleEntry", () => {
  const PKG = join("/repo", "packages", "arc-framework");

  it("qualifies a .js entry whose parent directory is dist", () => {
    expect(isBuiltBundleEntry(join(PKG, "dist", "cli.js"))).toBe(true);
  });

  it("rejects a .ts entry under src/", () => {
    expect(isBuiltBundleEntry(join(PKG, "src", "cli.ts"))).toBe(false);
  });

  it("rejects a .ts entry whose parent directory is dist", () => {
    // Without this case, dropping the extension condition still passes every
    // other one.
    expect(isBuiltBundleEntry(join(PKG, "dist", "cli.ts"))).toBe(false);
  });

  it("rejects a .js entry outside any dist directory", () => {
    expect(isBuiltBundleEntry(join(PKG, "scripts", "cli.js"))).toBe(false);
  });
});

describe("createDevCheckDeps", () => {
  it("yields skip for a non-qualifying entry even when src/ is populated", () => {
    // Running from source, the check would otherwise read `src/` as its own
    // output directory and compare source mtimes against the entry point — a
    // verdict that is stale by construction.
    const pkgDir = mkdtempSync(join(tmpdir(), "arc-dev-check-entry-"));
    mkdirSync(join(pkgDir, "src"), { recursive: true });
    writeFileSync(join(pkgDir, "src", "cli.ts"), "export {};\n");

    const result = checkDevBuildStaleness(createDevCheckDeps(join(pkgDir, "src", "cli.ts")));

    expect(result).toEqual({ kind: "skip" });
  });

  it("yields skip for a qualifying entry with no adjacent src/ (published install)", () => {
    const pkgDir = mkdtempSync(join(tmpdir(), "arc-dev-check-entry-"));
    mkdirSync(join(pkgDir, "dist"), { recursive: true });
    writeFileSync(join(pkgDir, "dist", "cli.js"), "#!/usr/bin/env node\n");

    const result = checkDevBuildStaleness(createDevCheckDeps(join(pkgDir, "dist", "cli.js")));

    expect(result).toEqual({ kind: "skip" });
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

describe("hashSourceInputs", () => {
  it("is stable under input order and sensitive to content", () => {
    const root = mkdtempSync(join(tmpdir(), "arc-dev-check-hash-"));
    const a = join(root, "a.ts");
    const b = join(root, "b.ts");
    writeFileSync(a, "export const a = 1;\n");
    writeFileSync(b, "export const b = 2;\n");

    const h1 = hashSourceInputs([a, b], root);
    const h2 = hashSourceInputs([b, a], root);
    expect(h1).toBe(h2);

    writeFileSync(a, "export const a = 99;\n");
    expect(hashSourceInputs([a, b], root)).not.toBe(h1);
  });

  it("uses package-relative keys so absolute roots do not change the digest", () => {
    const root = mkdtempSync(join(tmpdir(), "arc-dev-check-hash-"));
    mkdirSync(join(root, "src"), { recursive: true });
    const file = join(root, "src", "x.ts");
    writeFileSync(file, "export {};\n");

    expect(hashSourceInputs([file], root)).toMatch(/^[0-9a-f]{64}$/u);
  });
});
