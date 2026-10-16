/** Registered store verbs refuse safely until their capability flips. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupTempDir, createTempRepo, runArc, runArcNoTty } from "./helpers.js";

describe("dormant store command registrations", () => {
  let root: string;
  beforeEach(async () => {
    root = await createTempRepo();
    expect((await runArc(["init", "--yes", "--name", "test-project"], root)).exitCode).toBe(0);
  });
  afterEach(async () => { await cleanupTempDir(root); });
  it.each([
    { args: ["inbox", "personal", "--json"], serving: "arc user inbox-list --target" },
    { args: ["route", "--to", "project"], serving: "Binding: carrying out outcomes" },
    { args: ["route", "12345678", "--from", "personal", "--expected-version", "v1:1234567890abcdef", "--to", "project"], serving: "Binding: carrying out outcomes" },
    { args: ["locus", "release"], serving: "arc park" },
    { args: ["locus", "release", "example"], serving: "arc teardown" },
    { args: ["errand", "queue", "--json"], serving: "arc user inbox-mark-execute-bound" },
    { args: ["errand", "queue", "set", "-"], serving: "arc user inbox-mark-execute-bound" },
    { args: ["handoff", "write", "-"], serving: "SESSION-NOTES" },
  ])("refuses $args with its serving path", async ({ args, serving }) => {
    const result = await runArcNoTty(["--no-input", ...args], root);
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain("unsupported");
    expect(result.stdout + result.stderr).toContain(serving);
  });
  it("keeps locus inspection invocable without a subcommand", async () => {
    const result = await runArc(["locus", "--json"], root);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ mode: "locus", ok: true });
  });
});
