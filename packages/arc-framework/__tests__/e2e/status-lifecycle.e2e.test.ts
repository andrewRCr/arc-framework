/**
 * E2E coverage for the lifecycle status query.
 *
 * Exercises the built CLI entrypoint rather than only the pure resolver modules,
 * so the `status <slug> --json` command branch stays wired — and so bare
 * `arc status` keeps its session/active view, unchanged by the positional.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { runArc, createTempRepo, cleanupTempDir } from "./helpers.js";

describe("status <slug>", () => {
  let tmpDir: string;

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  async function seedRepo(): Promise<void> {
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
  }

  it("emits the resolved lifecycle query as JSON for a slug positional", async () => {
    tmpDir = await createTempRepo("arc-status-lifecycle-");
    await seedRepo();

    const result = await runArc(["status", "live", "--json"], tmpDir);

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

  it("leaves bare `arc status` as the session/active view, not a slug query", async () => {
    tmpDir = await createTempRepo("arc-status-bare-");
    await seedRepo();

    const result = await runArc(["status", "--json"], tmpDir);

    expect(result.exitCode).toBe(0);
    // The composite probe result carries no top-level `slug` key — the
    // positional branch did not capture the bare invocation.
    expect(JSON.parse(result.stdout)).not.toHaveProperty("slug");
  });
});
