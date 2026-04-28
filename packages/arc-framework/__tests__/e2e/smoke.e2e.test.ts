/**
 * Smoke E2E tests.
 *
 * Verifies basic CLI invocation: --version, --help, and unknown commands.
 * These are the simplest possible E2E tests — they don't need a git repo
 * or any ARC installation, just a valid built CLI artifact.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { runArc } from "./helpers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Read the version from the CLI package's package.json. */
function getPackageVersion(): string {
  const pkgPath = resolve(__dirname, "../../package.json");
  const raw = readFileSync(pkgPath, "utf-8");
  const pkg = JSON.parse(raw) as { version: string };
  return pkg.version;
}

describe("smoke", () => {
  // Smoke tests run in the package directory — no git repo needed
  const cwd = resolve(__dirname, "../..");

  it("arc --version exits 0 and outputs version matching package.json", async () => {
    const result = await runArc(["--version"], cwd);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(getPackageVersion());
  });

  it("arc --help exits 0 and lists available commands", async () => {
    const result = await runArc(["--help"], cwd);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("init");
    expect(result.stdout).toContain("update");
    expect(result.stdout).toContain("health");
    expect(result.stdout).toContain("diff");
  });

  it("arc nonexistent exits non-zero", async () => {
    const result = await runArc(["nonexistent"], cwd);

    expect(result.exitCode).not.toBe(0);
  });
});
