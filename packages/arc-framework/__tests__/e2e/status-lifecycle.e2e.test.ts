/**
 * E2E coverage for the lifecycle status query.
 *
 * Exercises the built CLI entrypoint rather than only the pure resolver modules,
 * so the `status --lifecycle --json` command branch stays wired.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { runArc, createTempRepo, cleanupTempDir } from "./helpers.js";

describe("status --lifecycle", () => {
  let tmpDir: string;

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("emits the resolved lifecycle query as JSON", async () => {
    tmpDir = await createTempRepo("arc-status-lifecycle-");
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);

    await mkdir(join(tmpDir, ".arc", "active"), { recursive: true });
    await mkdir(join(tmpDir, ".arc", "completed", "2026-q2", "01_shipped-dep"), {
      recursive: true,
    });
    await writeFile(
      join(tmpDir, ".arc", "active", "meta-live.md"),
      [
        "# Metadata: live",
        "",
        "- **State:** Active",
        "- **Depends On:** `shipped-dep`",
        "",
      ].join("\n"),
    );
    await writeFile(
      join(tmpDir, ".arc", "completed", "2026-q2", "01_shipped-dep", "meta-shipped-dep.md"),
      [
        "# Metadata: shipped-dep",
        "",
        "- **State:** Shipped",
        "- **Depends On:** [none]",
        "",
      ].join("\n"),
    );

    const result = await runArc(["status", "--lifecycle", "live", "--json"], tmpDir);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      slug: "live",
      position: { phase: "Active", location: "active" },
      state: "active",
      occupied: true,
      shipped: false,
      dependsOn: [{ slug: "shipped-dep", landed: true }],
    });
  });
});
