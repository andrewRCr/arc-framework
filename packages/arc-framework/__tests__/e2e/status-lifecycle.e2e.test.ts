/**
 * E2E coverage for the lifecycle status query.
 *
 * Exercises the built CLI entrypoint rather than only the pure resolver modules,
 * so the `status <slug> --json` command branch stays wired — and so bare
 * `arc status` keeps its session/active view, unchanged by the positional.
 */

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it, expect, afterEach } from "vitest";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { runArc, createTempRepo, cleanupTempDir } from "./helpers.js";

const execFileAsync = promisify(execFile);

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
        "| **State** | **Owner** | **Branch** | **Class** | **Priority** |",
        "|-----------|-----------|------------|-----------|--------------|",
        "| `Integrating` | `test-user` | `feat/live` | `Light` | `P1` |",
        "",
        "- **Depends On:** `shipped-dep`",
        "",
      ].join("\n"),
    );
    await writeFile(
      join(tmpDir, ".arc", "completed", "2026-q2", "01_shipped-dep", "meta-shipped-dep.md"),
      makeMetaFixture("shipped-dep", { state: "Shipped" }),
    );
  }

  it("emits the resolved lifecycle query as JSON for a slug positional", async () => {
    tmpDir = await createTempRepo("arc-status-lifecycle-");
    await seedRepo();

    const result = await runArc(["status", "live", "--json"], tmpDir);

    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      slug: "live",
      position: { phase: "Integrating", location: "active" },
      state: "integrating",
      occupied: true,
      shipped: false,
      dependsOn: [{ slug: "shipped-dep", landed: true }],
      integrationBoundary: null,
    });
  });

  it("leaves bare `arc status` as the session/active view, not a slug query", async () => {
    tmpDir = await createTempRepo("arc-status-bare-");
    await seedRepo();

    const result = await runArc(["status", "--json"], tmpDir);

    expect(result.exitCode).toBe(0);
    // The composite probe result carries no top-level `slug` key — the
    // positional branch did not capture the bare invocation — and is a
    // non-empty object (the session/active view actually rendered).
    const payload = JSON.parse(result.stdout);
    expect(payload).not.toHaveProperty("slug");
    expect(typeof payload).toBe("object");
    expect(payload).not.toEqual({});
  });

  it("keeps slug queries local by default and upgrades only an explicit --fetch", async () => {
    tmpDir = await createTempRepo("arc-status-fetch-default-");
    const origin = join(tmpDir, "origin.git");
    const slug = "stale-sibling";
    const branch = `feat/${slug}`;

    await execFileAsync("git", ["init", "--bare", "--initial-branch=main", origin]);
    await execFileAsync("git", ["remote", "add", "origin", origin], { cwd: tmpDir });
    await mkdir(join(tmpDir, ".arc", "system"), { recursive: true });
    await mkdir(join(tmpDir, ".arc", "backlog", "planned"), { recursive: true });
    await writeFile(join(tmpDir, ".arc", "system", "arc-config.yml"), "branch.base: main\n");
    await writeFile(
      join(tmpDir, ".arc", "backlog", "planned", `meta-${slug}.md`),
      makeMetaFixture(slug, { state: "Planning", branch: null }),
    );
    await execFileAsync("git", ["add", ".arc"], { cwd: tmpDir });
    await execFileAsync("git", ["commit", "-m", "scaffold status query"], { cwd: tmpDir });
    await execFileAsync("git", ["push", "-u", "origin", "main"], { cwd: tmpDir });

    await execFileAsync("git", ["switch", "-c", branch], { cwd: tmpDir });
    await mkdir(join(tmpDir, ".arc", "active"), { recursive: true });
    await writeFile(
      join(tmpDir, ".arc", "active", `meta-${slug}.md`),
      makeMetaFixture(slug, { branch }),
    );
    await execFileAsync("git", ["add", ".arc"], { cwd: tmpDir });
    await execFileAsync("git", ["commit", "-m", "activate status query"], { cwd: tmpDir });
    const { stdout: branchTip } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: tmpDir });
    await execFileAsync("git", ["push", "-u", "origin", branch], { cwd: tmpDir });
    await execFileAsync("git", ["switch", "main"], { cwd: tmpDir });
    await execFileAsync("git", ["branch", "-D", branch], { cwd: tmpDir });
    await execFileAsync("git", ["push", "origin", "--delete", branch], { cwd: tmpDir });
    await execFileAsync("git", ["update-ref", `refs/remotes/origin/${branch}`, branchTip.trim()], { cwd: tmpDir });

    const local = await runArc(["status", slug, "--json"], tmpDir);
    const live = await runArc(["status", slug, "--fetch", "--json"], tmpDir);

    expect(local.exitCode, JSON.stringify(local)).toBe(0);
    expect(live.exitCode, JSON.stringify(live)).toBe(0);
    expect(JSON.parse(local.stdout)).toMatchObject({ state: "active", occupied: true });
    expect(JSON.parse(live.stdout)).toMatchObject({ state: "planned", occupied: false });
  });

  it("distinguishes unavailable boundary evidence for a remote-only Candidate", async () => {
    tmpDir = await createTempRepo("arc-status-remote-candidate-");
    const origin = join(tmpDir, "origin.git");
    const slug = "remote-candidate";
    const branch = `feat/${slug}`;

    await writeFile(join(tmpDir, ".git", "info", "exclude"), "origin.git/\n");
    await execFileAsync("git", ["init", "--bare", "--initial-branch=main", origin]);
    await execFileAsync("git", ["remote", "add", "origin", origin], { cwd: tmpDir });
    await mkdir(join(tmpDir, ".arc", "system"), { recursive: true });
    await writeFile(join(tmpDir, ".arc", "system", "arc-config.yml"), "branch.base: main\n");
    await writeFile(join(tmpDir, "README.md"), "# Fixture\n");
    await execFileAsync("git", ["add", "-A"], { cwd: tmpDir });
    await execFileAsync("git", ["commit", "-m", "base"], { cwd: tmpDir });
    await execFileAsync("git", ["push", "-u", "origin", "main"], { cwd: tmpDir });

    await execFileAsync("git", ["switch", "-c", branch], { cwd: tmpDir });
    await mkdir(join(tmpDir, ".arc", "active"), { recursive: true });
    await writeFile(
      join(tmpDir, ".arc", "active", `meta-${slug}.md`),
      makeMetaFixture(slug, {
        branch,
        taskList: `tasks-${slug}.md`,
        currentWorkflow: "prepare-work-unit",
        nextAction: "prepare publication",
      }),
    );
    await writeFile(
      join(tmpDir, ".arc", "active", `tasks-${slug}.md`),
      "# Task List: Remote Candidate\n\n## **Phase 1:** Verification\n\n### `[x]` **1.1 Complete verification**\n",
    );
    await execFileAsync("git", ["add", ".arc"], { cwd: tmpDir });
    await execFileAsync("git", ["commit", "-m", "activate candidate"], { cwd: tmpDir });
    const attested = await runArc(["attest", slug, "--json"], tmpDir);
    expect(attested.exitCode, JSON.stringify(attested)).toBe(0);
    await execFileAsync("git", ["commit", "-m", "attest candidate"], { cwd: tmpDir });
    await execFileAsync("git", ["push", "-u", "origin", branch], { cwd: tmpDir });
    await execFileAsync("git", ["switch", "main"], { cwd: tmpDir });
    await execFileAsync("git", ["branch", "-D", branch], { cwd: tmpDir });

    const result = await runArc(["status", slug, "--fetch", "--json"], tmpDir);

    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      state: "active",
      integrationBoundary: null,
      warnings: [expect.stringContaining(`arc materialize ${slug}`)],
    });
  });
});
