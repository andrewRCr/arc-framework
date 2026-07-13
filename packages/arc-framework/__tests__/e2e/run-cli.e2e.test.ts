/**
 * Smoke test for the subprocess CLI invocation helper.
 *
 * Confirms `runCli` spawns the built CLI, captures stdout/stderr/exitCode, and
 * resolves cleanly. The full subprocess-purity contract (stdout JSON purity
 * across representative cells) lives in subsequent tests that consume this
 * helper.
 */

import { describe, it, expect } from "vitest";

import { runCli } from "../helpers/run-cli.js";

describe("runCli", () => {
  it("returns exit 0 and stdout containing the program name for --help", async () => {
    const result = await runCli(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("arc");
  });

  it("documents the slug-query --fetch upgrade separately from live-default views", async () => {
    const result = await runCli(["status", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--fetch");
    expect(result.stdout).toContain("upgrade the local-default query");
    expect(result.stdout).toMatch(/skip the live-default network\s+read/u);
  });
});
