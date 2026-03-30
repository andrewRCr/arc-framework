/**
 * Reconfigure E2E tests.
 *
 * Exercises `arc init --reconfigure`, `arc init --reconfigure --dry-run`,
 * `arc join --reconfigure`, role gates, idempotency, and --yes mode
 * removal defaults against real temporary git repos.
 */

import { execFile } from "node:child_process";
import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runArc, createTempRepo, cleanupTempDir } from "./helpers.js";

const execFileAsync = promisify(execFile);

/** Check whether a path exists. */
async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

describe("arc init --reconfigure", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(
      ["init", "--yes", "--name", "test-project", "--tools", "claude"],
      tmpDir,
    );
    expect(init.exitCode).toBe(0);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("reconfigure pm.mode adds files, update preserves new config", async () => {
    // Reconfigure: none → arc-in-git
    const reconf = await runArc(
      ["init", "--reconfigure", "--yes", "--pm-mode", "arc-in-git"],
      tmpDir,
    );
    expect(reconf.exitCode).toBe(0);

    // arc-in-git files should now exist
    expect(await pathExists(join(tmpDir, ".arc", "backlog", "ROADMAP.md"))).toBe(true);
    expect(await pathExists(
      join(tmpDir, ".arc", "reference", "strategies", "arc", "strategy-backlog-organization.md"),
    )).toBe(true);

    // Manifest should reflect new config
    const manifestRaw = await readFile(
      join(tmpDir, ".arc", "system", ".internal", "manifest.json"),
      "utf-8",
    );
    const manifest = JSON.parse(manifestRaw) as { install_config: { pm_mode: string } };
    expect(manifest.install_config.pm_mode).toBe("arc-in-git");

    // Update should preserve the new config
    const update = await runArc(["update"], tmpDir);
    expect(update.exitCode).toBe(0);

    // Files still present after update
    expect(await pathExists(join(tmpDir, ".arc", "backlog", "ROADMAP.md"))).toBe(true);

    // Manifest still has arc-in-git
    const postUpdateManifest = JSON.parse(
      await readFile(join(tmpDir, ".arc", "system", ".internal", "manifest.json"), "utf-8"),
    ) as { install_config: { pm_mode: string } };
    expect(postUpdateManifest.install_config.pm_mode).toBe("arc-in-git");
  });

  it("--dry-run preview matches actual reconfigure results", async () => {
    // Dry run: none → arc-in-git
    const dryRun = await runArc(
      ["init", "--reconfigure", "--dry-run", "--yes", "--pm-mode", "arc-in-git"],
      tmpDir,
    );
    expect(dryRun.exitCode).toBe(0);
    const dryOutput = dryRun.stdout + dryRun.stderr;
    expect(dryOutput).toContain("dry run");
    expect(dryOutput).toContain("Would add");

    // No files should have been created
    expect(await pathExists(join(tmpDir, ".arc", "backlog", "ROADMAP.md"))).toBe(false);

    // Manifest should still show pm.mode: none
    const manifestRaw = await readFile(
      join(tmpDir, ".arc", "system", ".internal", "manifest.json"),
      "utf-8",
    );
    const manifest = JSON.parse(manifestRaw) as { install_config: { pm_mode: string } };
    expect(manifest.install_config.pm_mode).toBe("none");

    // Now actually reconfigure
    const actual = await runArc(
      ["init", "--reconfigure", "--yes", "--pm-mode", "arc-in-git"],
      tmpDir,
    );
    expect(actual.exitCode).toBe(0);

    // Files now exist
    expect(await pathExists(join(tmpDir, ".arc", "backlog", "ROADMAP.md"))).toBe(true);
  });

  it("contributor gets clear error on init --reconfigure", async () => {
    // Set role to contributor
    await execFileAsync("git", ["config", "arc.role", "contributor"], { cwd: tmpDir });

    const result = await runArc(
      ["init", "--reconfigure", "--yes", "--pm-mode", "arc-in-git"],
      tmpDir,
    );
    expect(result.exitCode).toBe(1);

    const output = result.stdout + result.stderr;
    expect(output).toContain("ROLE_FORBIDDEN");
    expect(output).toContain("Contributors cannot reconfigure");
  });

  it("reconfigure with same values is a no-op", async () => {
    // Get current manifest for comparison
    const manifestPath = join(tmpDir, ".arc", "system", ".internal", "manifest.json");
    const before = await readFile(manifestPath, "utf-8");

    // Reconfigure with identical values
    const result = await runArc(
      ["init", "--reconfigure", "--yes"],
      tmpDir,
    );
    expect(result.exitCode).toBe(0);

    const output = result.stdout + result.stderr;
    expect(output).toContain("Nothing to change");
  });

  it("--yes mode applies correct removal defaults for classification", async () => {
    // Start with arc-in-git installed
    const setup = await runArc(
      ["init", "--reconfigure", "--yes", "--pm-mode", "arc-in-git"],
      tmpDir,
    );
    expect(setup.exitCode).toBe(0);

    // Verify scaffolded files exist
    const roadmapPath = join(tmpDir, ".arc", "backlog", "ROADMAP.md");
    expect(await pathExists(roadmapPath)).toBe(true);

    // Reconfigure back to none — removals happen via --yes defaults
    const reconf = await runArc(
      ["init", "--reconfigure", "--yes", "--pm-mode", "none"],
      tmpDir,
    );
    expect(reconf.exitCode).toBe(0);

    // Framework files (strategy-backlog-organization.md) should be auto-removed
    expect(await pathExists(
      join(tmpDir, ".arc", "reference", "strategies", "arc", "strategy-backlog-organization.md"),
    )).toBe(false);

    // Scaffolded files (ROADMAP.md) should be kept on disk (--yes keeps non-Framework)
    expect(await pathExists(roadmapPath)).toBe(true);
  });
});

describe("arc join --reconfigure", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo("arc-reconf-join-");
    const init = await runArc(
      ["init", "--yes", "--name", "test-project"],
      tmpDir,
    );
    expect(init.exitCode).toBe(0);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("role change updates git config", async () => {
    // Initial join as maintainer
    const join1 = await runArc(["join", "--yes", "--tools", "claude"], tmpDir);
    expect(join1.exitCode).toBe(0);

    const { stdout: role1 } = await execFileAsync("git", ["config", "arc.role"], { cwd: tmpDir });
    expect(role1.trim()).toBe("maintainer");

    // Reconfigure to contributor
    const reconf = await runArc(
      ["join", "--reconfigure", "--contributor", "--yes"],
      tmpDir,
    );
    expect(reconf.exitCode).toBe(0);

    const { stdout: role2 } = await execFileAsync("git", ["config", "arc.role"], { cwd: tmpDir });
    expect(role2.trim()).toBe("contributor");
  });

  it("tool change cleans old skills and writes new ones", async () => {
    // Initial join with claude
    const join1 = await runArc(["join", "--yes", "--tools", "claude"], tmpDir);
    expect(join1.exitCode).toBe(0);

    // Claude skills should exist
    expect(await pathExists(
      join(tmpDir, ".claude", "skills", "arc-resume", "SKILL.md"),
    )).toBe(true);

    // Reconfigure to cursor (universal → .agents/skills/)
    const reconf = await runArc(
      ["join", "--reconfigure", "--yes", "--tools", "cursor"],
      tmpDir,
    );
    expect(reconf.exitCode).toBe(0);

    // Old claude skills should be removed
    expect(await pathExists(
      join(tmpDir, ".claude", "skills", "arc-resume", "SKILL.md"),
    )).toBe(false);

    // New cursor skills should exist (resolves to .agents/skills/)
    expect(await pathExists(
      join(tmpDir, ".agents", "skills", "arc-resume", "SKILL.md"),
    )).toBe(true);

    // Tool config should be updated
    const { stdout: tools } = await execFileAsync("git", ["config", "arc.tools"], { cwd: tmpDir });
    expect(tools.trim()).toBe("cursor");
  });
});
