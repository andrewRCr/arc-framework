/**
 * `arc errand check` E2E.
 *
 * Exercises the built CLI end-to-end: `arc errand check` reports which in-flight
 * work units touch the target path(s), emitting the overlap facts as JSON for
 * skill consumption. This covers the real path resolution that unit tests stub.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { runArc, createTempRepo, cleanupTempDir } from "./helpers.js";

describe("arc errand check", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("reports no overlap as JSON when no other work unit is in flight", async () => {
    const result = await runArc(
      ["errand", "check", "--target", "docs/x.md", "--json"],
      tmpDir,
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual({ overlaps: [] });
  });
});
