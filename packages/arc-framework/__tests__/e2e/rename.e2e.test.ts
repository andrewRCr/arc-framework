/** Operator-level coverage for work-unit rename across its three subject shapes. */

import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  createTempRepo,
  git,
  removeGitBackedDir,
  runArcNoTty,
} from "./helpers.js";
import { CLI_PATH } from "../helpers/cli-spawn.js";

const execFileAsync = promisify(execFile);

interface RenameFixture {
  repo: string;
  remote: string;
}

const COHORT = "rename-group";
const COMPANION_PREFIXES = ["draft", "spec", "tasks", "notes"] as const;

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

function cohortDoc(slug: string): string {
  return [
    `# Cohort: \`${COHORT}\``,
    "",
    "**Purpose:** Exercise rename membership coherence.",
    "",
    "## Members",
    "",
    `### \`${slug}\``,
    "",
    "_Exposes:_ rename verification surfaces.",
    "",
    "---",
    "",
  ].join("\n");
}

async function seedTrackedSweep(repo: string, artifactDir: string, slug: string): Promise<void> {
  const metaPath = join(repo, artifactDir, `meta-${slug}.md`);
  const originalMeta = await readFile(metaPath, "utf8");
  const meta = originalMeta
    .replace("- **Cohort:** [none]", `- **Cohort:** ${COHORT}`)
    .replace("- **Design:** [none]", `- **Design:** spec-${slug}.md`)
    .replace("- **Task List:** [none]", `- **Task List:** tasks-${slug}.md`);
  expect(meta).not.toBe(originalMeta);
  await writeFile(metaPath, meta, "utf8");
  for (const prefix of COMPANION_PREFIXES) {
    await writeFile(join(repo, artifactDir, `${prefix}-${slug}.md`), `# ${prefix}: ${slug}\n`, "utf8");
  }
  const cohortDir = join(repo, ".arc", "backlog", "planned", COHORT);
  await mkdir(cohortDir, { recursive: true });
  await writeFile(join(cohortDir, `cohort-${COHORT}.md`), cohortDoc(slug), "utf8");
  const observerDir = join(repo, ".arc", "backlog", "planned", "rename-observer");
  await mkdir(observerDir, { recursive: true });
  await writeFile(join(observerDir, "meta-rename-observer.md"), [
    "# Metadata: rename-observer",
    "",
    "| **State** | **Owner** | **Branch** | **Class** | **Priority** |",
    "| --------- | --------- | ---------- | --------- | ------------ |",
    "| `Planning` | `tester`  | [none]     | `Light`   | `P3`         |",
    "",
    "- **Cohort:** [none]",
    `- **Depends On:** \`${slug}\``,
    "",
    "- **Origin:** [internal]",
    `- **Design:** \`spec-${slug}.md\``,
    `- **Task List:** \`tasks-${slug}.md\``,
    "- **Review Rubric:** [none]",
    "",
    "- **Current Workflow:** [none]",
    "- **Last Completed:** [none]",
    "- **Next Task:** [none]",
    "- **Blockers:** [none]",
    "",
    "- **Next Action:** —",
    "",
    "- **PR URL:** [none]",
    "- **Completed:** [none]",
    "",
    "---",
    "",
  ].join("\n"), "utf8");
}

async function expectTrackedSweep(
  repo: string,
  oldArtifactDir: string,
  newArtifactDir: string,
  oldSlug: string,
  newSlug: string,
  options: { baseStubRemains?: boolean } = {},
): Promise<void> {
  for (const prefix of ["meta", ...COMPANION_PREFIXES]) {
    expect(await exists(join(repo, oldArtifactDir, `${prefix}-${oldSlug}.md`))).toBe(false);
    expect(await exists(join(repo, newArtifactDir, `${prefix}-${newSlug}.md`))).toBe(true);
  }
  const meta = await readFile(join(repo, newArtifactDir, `meta-${newSlug}.md`), "utf8");
  expect(meta).toContain(`# Metadata: ${newSlug}`);
  expect(meta).toContain(`spec-${newSlug}.md`);
  expect(meta).toContain(`tasks-${newSlug}.md`);
  const observer = await readFile(
    join(repo, ".arc", "backlog", "planned", "rename-observer", "meta-rename-observer.md"),
    "utf8",
  );
  expect(observer).toContain(`- **Depends On:** \`${newSlug}\``);
  expect(observer).toContain(`\`spec-${newSlug}.md\``);
  expect(observer).not.toContain(oldSlug);
  const cohort = await readFile(
    join(repo, ".arc", "backlog", "planned", COHORT, `cohort-${COHORT}.md`),
    "utf8",
  );
  expect(cohort).toContain(`### \`${newSlug}\``);
  expect(cohort).not.toContain(`### \`${oldSlug}\``);
  const roadmap = await readFile(join(repo, ".arc", "backlog", "ROADMAP.md"), "utf8");
  expect(roadmap).toContain(newSlug);
  expect(roadmap).toContain(`rename-observer | P3       | tester | ${newSlug}`);
  if (options.baseStubRemains !== true) expect(roadmap).not.toContain(oldSlug);
}

async function hasUserWorkspace(repo: string, slug: string): Promise<boolean> {
  const userRoot = join(repo, ".arc", "user");
  for (const entry of await readdir(userRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && await exists(join(userRoot, entry.name, slug, "SESSION-NOTES.md"))) return true;
  }
  return false;
}

async function createFixture(): Promise<RenameFixture> {
  const repo = await createTempRepo("arc-rename-e2e-");
  const remote = await mkdtemp(join(tmpdir(), "arc-rename-origin-"));
  await execFileAsync("git", ["init", "--bare", remote]);
  await git(repo, ["remote", "add", "origin", remote]);
  const initialized = await runArcNoTty([
    "init", "--yes", "--name", "rename-test", "--pm-mode", "arc-in-git", "--tools", "codex",
  ], repo);
  expect(initialized.exitCode).toBe(0);
  await git(repo, ["config", "core.hooksPath", "/dev/null"]);
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "chore(test): initialize fixture"]);
  await git(repo, ["push", "-u", "origin", "main"]);
  return { repo, remote };
}

async function startInPlace(fixture: RenameFixture): Promise<void> {
  await git(fixture.repo, ["switch", "-c", "feat/old-name"]);
  const started = await runArcNoTty([
    "start", "old-name", "--here", "--new", "--class", "Light", "--from", "internal",
  ], fixture.repo);
  expect(started.exitCode).toBe(0);
  await seedTrackedSweep(fixture.repo, join(".arc", "active"), "old-name");
  await git(fixture.repo, ["add", "."]);
  await git(fixture.repo, ["commit", "-m", "chore(test): start work unit"]);
  await git(fixture.repo, ["push", "-u", "origin", "feat/old-name"]);
}

async function installRenameGateHook(
  repo: string,
  options: { rejectOnce?: boolean } = {},
): Promise<{ ranMarker: string; refusalMarker: string }> {
  const marker = join(repo, ".git", "rename-gate-ran");
  const refusalMarker = join(repo, ".git", "rename-gate-refused-once");
  const hook = join(repo, ".git", "hooks", "pre-commit");
  await writeFile(hook, [
    "#!/usr/bin/env node",
    "const { spawnSync } = require('node:child_process');",
    "const { existsSync, writeFileSync } = require('node:fs');",
    `writeFileSync(${JSON.stringify(marker)}, '');`,
    `const result = spawnSync(process.execPath, [${JSON.stringify(CLI_PATH)}, 'hook-validate-decompose-record'], { stdio: 'inherit' });`,
    "if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);",
    ...(options.rejectOnce === true ? [
      `if (!existsSync(${JSON.stringify(refusalMarker)})) {`,
      `  writeFileSync(${JSON.stringify(refusalMarker)}, '');`,
      "  process.exit(1);",
      "}",
    ] : []),
    "process.exit(0);",
    "",
  ].join("\n"), "utf8");
  await chmod(hook, 0o755);
  await execFileAsync("git", ["config", "core.hooksPath", ".git/hooks"], { cwd: repo });
  return { ranMarker: marker, refusalMarker };
}

describe("arc rename", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    for (const path of cleanupPaths.splice(0).reverse()) await removeGitBackedDir(path);
  });

  it("renames a backlog stub through CHECK 20 on a short-lived branch and rests on main", async () => {
    const fixture = await createFixture();
    cleanupPaths.push(fixture.remote, fixture.repo);
    const stubbed = await runArcNoTty([
      "stub", "old-name", "--commitment", "planned", "--priority", "P2", "--class", "Light",
      "--cohort", COHORT,
    ], fixture.repo);
    expect(stubbed.exitCode).toBe(0);
    const oldArtifactDir = join(".arc", "backlog", "planned", COHORT, "old-name");
    const newArtifactDir = join(".arc", "backlog", "planned", COHORT, "new-name");
    await seedTrackedSweep(fixture.repo, oldArtifactDir, "old-name");
    await git(fixture.repo, ["add", "."]);
    await git(fixture.repo, ["commit", "-m", "chore(test): add work unit"]);
    await git(fixture.repo, ["push"]);
    const gate = await installRenameGateHook(fixture.repo, { rejectOnce: true });

    const refused = await runArcNoTty(["rename", "old-name", "new-name"], fixture.repo);
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout + refused.stderr).toContain("rename commit refused");
    expect(await exists(gate.ranMarker)).toBe(true);
    expect(await exists(gate.refusalMarker)).toBe(true);
    expect(await git(fixture.repo, ["status", "--porcelain"])).toBe("");
    expect(await exists(join(fixture.repo, oldArtifactDir, "meta-old-name.md"))).toBe(true);
    expect(await exists(join(fixture.repo, newArtifactDir, "meta-new-name.md"))).toBe(false);

    const renamed = await runArcNoTty(["rename", "old-name", "new-name"], fixture.repo);

    expect(renamed.exitCode).toBe(0);
    expect(renamed.stdout).toContain("pending integration");
    expect(await git(fixture.repo, ["branch", "--show-current"])).toBe("main");
    const receiptPaths = (await git(fixture.repo, [
      "ls-tree", "-r", "--name-only", "chore/rename-old-name-to-new-name", "--",
      ".arc/.internal/retirement-receipts",
    ])).split("\n").filter(Boolean);
    expect(receiptPaths).toHaveLength(1);
    const receipt = JSON.parse(await git(fixture.repo, [
      "show", `chore/rename-old-name-to-new-name:${receiptPaths[0]}`,
    ])) as { transition: string; result: { kind: string; targetSlug: string } };
    expect(receipt).toMatchObject({
      transition: "rename",
      result: { kind: "rename", targetSlug: "new-name" },
    });
    await git(fixture.repo, ["switch", "chore/rename-old-name-to-new-name"]);
    await expectTrackedSweep(fixture.repo, oldArtifactDir, newArtifactDir, "old-name", "new-name");
    await git(fixture.repo, ["switch", "main"]);
  }, 30_000);

  it("renames an in-place work unit, its notes workspace, and its published branch", async () => {
    const fixture = await createFixture();
    cleanupPaths.push(fixture.remote, fixture.repo);
    await startInPlace(fixture);

    const renamed = await runArcNoTty(["rename", "old-name", "new-name"], fixture.repo);

    expect(renamed.exitCode).toBe(0);
    expect(renamed.stdout).toContain("in-place");
    expect(renamed.stdout).toContain("Marker:    skipped");
    expect(renamed.stdout).toContain("Worktree:  unchanged");
    expect(await git(fixture.repo, ["branch", "--show-current"])).toBe("feat/new-name");
    expect(await git(fixture.repo, ["ls-remote", "--heads", "origin", "feat/old-name"])).toBe("");
    expect(await git(fixture.repo, ["ls-remote", "--heads", "origin", "feat/new-name"])).not.toBe("");
    await expectTrackedSweep(
      fixture.repo,
      join(".arc", "active"),
      join(".arc", "active"),
      "old-name",
      "new-name",
      { baseStubRemains: true },
    );
    expect(await hasUserWorkspace(fixture.repo, "old-name")).toBe(false);
    expect(await hasUserWorkspace(fixture.repo, "new-name")).toBe(true);
  }, 30_000);

  it("self-renames a spawned worktree, marker, notes workspace, and remote branch", async () => {
    const fixture = await createFixture();
    const oldWorktree = `${fixture.repo}.old-name`;
    const newWorktree = `${fixture.repo}.new-name`;
    cleanupPaths.push(fixture.remote, fixture.repo, oldWorktree, newWorktree);
    const started = await runArcNoTty([
      "start", "old-name", "--new", "--class", "Light", "--from", "internal",
    ], fixture.repo, { timeout: 20_000 });
    expect(started.exitCode).toBe(0);
    await seedTrackedSweep(oldWorktree, join(".arc", "active"), "old-name");
    await git(oldWorktree, ["add", "."]);
    await git(oldWorktree, ["commit", "-m", "chore(test): seed rename surfaces"]);
    await git(oldWorktree, ["push", "-u", "origin", "plan/old-name"]);

    const renamed = await runArcNoTty(["rename", "old-name", "new-name"], oldWorktree, { timeout: 20_000 });

    expect(renamed.exitCode).toBe(0);
    expect(renamed.stdout).toContain("spawned");
    expect(renamed.stdout).toContain(newWorktree);
    expect(renamed.stdout).toContain("process relocated");
    expect(await exists(oldWorktree)).toBe(false);
    expect(await exists(newWorktree)).toBe(true);
    const marker = JSON.parse(await readFile(
      join(newWorktree, ".arc", "system", ".internal", "worktree-marker.json"),
      "utf8",
    )) as { wuName: string; createdFor: { name: string } };
    expect(marker.wuName).toBe("new-name");
    expect(marker.createdFor.name).toBe("new-name");
    expect(await git(newWorktree, ["branch", "--show-current"])).toBe("plan/new-name");
    expect(await git(newWorktree, ["ls-remote", "--heads", "origin", "plan/old-name"])).toBe("");
    expect(await git(newWorktree, ["ls-remote", "--heads", "origin", "plan/new-name"])).not.toBe("");
    await expectTrackedSweep(
      newWorktree,
      join(".arc", "active"),
      join(".arc", "active"),
      "old-name",
      "new-name",
      { baseStubRemains: true },
    );
    expect(await hasUserWorkspace(newWorktree, "old-name")).toBe(false);
    expect(await hasUserWorkspace(newWorktree, "new-name")).toBe(true);
  }, 30_000);

  it("resumes after a stale remote lease without repeating completed identity legs", async () => {
    const fixture = await createFixture();
    const oldWorktree = `${fixture.repo}.old-name`;
    const newWorktree = `${fixture.repo}.new-name`;
    cleanupPaths.push(fixture.remote, fixture.repo, oldWorktree, newWorktree);
    const started = await runArcNoTty([
      "start", "old-name", "--new", "--class", "Light", "--from", "internal",
    ], fixture.repo, { timeout: 20_000 });
    expect(started.exitCode).toBe(0);
    const hook = join(fixture.remote, "hooks", "post-receive");
    await writeFile(hook, [
      "#!/bin/sh",
      "while read old new ref; do",
      "  if [ \"$ref\" = \"refs/heads/plan/new-name\" ] && [ ! -f arc-rename-fired ]; then",
      "    touch arc-rename-fired",
      "    git update-ref refs/heads/plan/old-name refs/heads/main",
      "  fi",
      "done",
      "",
    ].join("\n"), "utf8");
    await chmod(hook, 0o755);

    const interrupted = await runArcNoTty(["rename", "old-name", "new-name"], oldWorktree, { timeout: 20_000 });

    expect(interrupted.exitCode).toBe(1);
    expect(interrupted.stdout + interrupted.stderr).toContain("old remote head moved");
    expect(await exists(oldWorktree)).toBe(true);
    expect(await git(oldWorktree, ["branch", "--show-current"])).toBe("plan/new-name");

    const resumed = await runArcNoTty(["rename", "old-name", "new-name"], oldWorktree, { timeout: 20_000 });
    expect(resumed.exitCode, resumed.stdout + resumed.stderr).toBe(0);
    expect(await exists(oldWorktree)).toBe(false);
    expect(await exists(newWorktree)).toBe(true);
    expect(await git(newWorktree, ["ls-remote", "--heads", "origin", "plan/old-name"])).toBe("");
  }, 45_000);
});
