/**
 * Session-init E2E tests.
 *
 * Exercises `arc status --session-init --json` end-to-end against a fresh
 * `arc init` install, verifying that the binary's CLI argument parsing and
 * JSON serialization carry the inferred `sessionType` correctly across the
 * three resolved type variants (planning / execution / integration).
 *
 * SESSION-NOTES `**Session Type:**` override resolution is intentionally
 * out of scope here — overrides are applied agent-side at SESSION-NOTES
 * read-time, not by the CLI probe (see Task 6.3 outcome and Phase 6 lens).
 * Override behavior is exercised manually at Task 6.5 phase close via
 * deliberate spot-checks.
 */

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runArc, createTempRepo, cleanupTempDir } from "./helpers.js";

const execFileAsync = promisify(execFile);

interface SessionInitEnvelope {
  mode: string;
  user?: unknown;
  baseDistance?: unknown;
  domainRules?: unknown;
  recommendedCombinedPrompt?: unknown;
  active: {
    ok: boolean;
    value?: {
      resolution: string;
      sessionType: string | null;
      path: string | null;
    };
  };
  taskCursor?: {
    ok: boolean;
    value?: {
      status: string;
      cursor?: TaskCursorJson;
    };
  };
  compactionSeedWrite?:
    | { status: "written"; path: string }
    | { status: "skipped"; reason: string }
    | { status: "failed"; reason: string; message: string };
  loadSet?: {
    ok: boolean;
    value?: {
      manifestVersion: number;
      entries: { path: string; readMode: { kind: string } }[];
    };
  };
  baseBranchSync?: {
    ok: boolean;
    value?: {
      state: string;
      ahead: number;
      behind: number;
      base: string;
      recommendedAction: string;
      recommendedPromptText: string;
    };
  };
}

interface TaskCursorItemJson {
  id: string;
  title: string;
  lineHint: number;
}

interface TaskCursorJson {
  section: TaskCursorItemJson;
  leaf: TaskCursorItemJson;
}

interface CompactionSeedJson {
  schemaVersion: number;
  repoRoot: string;
  branch: string;
  head: string;
  dirty: boolean;
  activeWorkUnit: string | null;
  metaPath: string | null;
  sessionType: string | null;
  taskCursor: TaskCursorJson | null;
  loadSet: {
    manifestVersion: number;
    entries: { path: string; readMode: { kind: string } }[];
  };
  uncommittedFiles: string[];
}

interface RecoverAuditReport {
  mode: string;
  seedPath: string | null;
  verdict: {
    status: string;
    ready: boolean;
    stopReasons: { kind: string; message: string }[];
    taskCursor: {
      expected: TaskCursorJson | null;
      actual: { status: string; cursor?: TaskCursorJson } | null;
      match: boolean;
    } | null;
  };
}

async function writeStatusFixture(
  arcRoot: string,
  category: string,
  stem: string,
  fields: { taskList?: string; nextAction: string },
): Promise<void> {
  const dir = join(arcRoot, ".arc", "active");
  await mkdir(dir, { recursive: true });
  const lines: string[] = [
    `# Metadata: ${stem}`,
    "",
    "- **State:** Active",
    `- **Branch:** ${category}/${stem}`,
  ];
  if (fields.taskList !== undefined) {
    lines.push(`- **Task List:** ${fields.taskList}`);
  }
  lines.push(`- **Next Action:** ${fields.nextAction}`);
  await writeFile(join(dir, `meta-${stem}.md`), lines.join("\n"));
}

function parseJsonEnvelope(stdout: string): SessionInitEnvelope {
  // The CLI may emit a trailing newline; JSON.parse tolerates it after trim.
  return JSON.parse(stdout.trim()) as SessionInitEnvelope;
}

function parseRecoverAuditReport(stdout: string): RecoverAuditReport {
  return JSON.parse(stdout.trim()) as RecoverAuditReport;
}

function taskListFixture(title: string): string {
  return [
    "# Task List: Foo",
    "",
    "## **Phase 1:** Work",
    "",
    `### \`[ ]\` **1.1 ${title}**`,
    "",
  ].join("\n");
}

describe("session-init E2E — sessionType across type variants", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("emits sessionType=planning when resolution=none + branch matches plan-pattern", async () => {
    // Seed a commit and check out a planning branch so `git rev-parse --abbrev-ref HEAD`
    // can resolve. `--no-verify` skips the project pre-commit hooks (installed by
    // `arc init`) which validate the project's own files, not test fixtures.
    await execFileAsync("git", ["add", "-A"], { cwd: tmpDir });
    await execFileAsync(
      "git",
      ["commit", "--no-verify", "-m", "init"],
      { cwd: tmpDir },
    );
    await execFileAsync(
      "git",
      ["checkout", "-b", "plan/foo"],
      { cwd: tmpDir },
    );

    const result = await runArc(["status", "--session-init", "--json"], tmpDir);
    expect(result.exitCode).toBe(0);

    const envelope = parseJsonEnvelope(result.stdout);
    expect(envelope.mode).toBe("session-init");
    expect(envelope.active.ok).toBe(true);
    expect(envelope.active.value?.resolution).toBe("none");
    expect(envelope.active.value?.sessionType).toBe("planning");
  });

  it("writes the compaction seed sidecar when requested with session-init", async () => {
    await execFileAsync("git", ["add", "-A"], { cwd: tmpDir });
    await execFileAsync("git", ["commit", "--no-verify", "-m", "init"], { cwd: tmpDir });
    await execFileAsync("git", ["checkout", "-b", "feat/foo"], { cwd: tmpDir });

    const activeDir = join(tmpDir, ".arc", "active");
    await mkdir(activeDir, { recursive: true });
    await writeFile(
      join(activeDir, "meta-foo.md"),
      [
        "# Metadata: Foo",
        "",
        "- **State:** Active",
        "- **Branch:** feat/foo",
        "- **Task List:** tasks-foo.md",
        "- **Current Workflow:** [none]",
        "- **Next Task:** Task 1.1 — Do seed (line ~12)",
        "- **Next Action:** Start Task 1.1",
        "",
      ].join("\n"),
    );
    await writeFile(join(activeDir, "tasks-foo.md"), taskListFixture("Do seed"));
    await execFileAsync("git", ["add", "-A"], { cwd: tmpDir });
    await execFileAsync("git", ["commit", "--no-verify", "-m", "active fixture"], { cwd: tmpDir });

    const result = await runArc(
      ["status", "--session-init", "--write-compaction-seed", "--json"],
      tmpDir,
    );
    expect(result.exitCode).toBe(0);

    const envelope = parseJsonEnvelope(result.stdout);
    const seedPath = join(tmpDir, ".arc", "user", "test-user", ".internal", "compaction-seed.json");
    expect(envelope.compactionSeedWrite).toMatchObject({
      status: "written",
      path: seedPath,
    });
    const seed = JSON.parse(await readFile(seedPath, "utf8")) as CompactionSeedJson;
    const expectedRepoRoot = await realpath(tmpDir);
    expect(seed).toMatchObject({
      schemaVersion: 1,
      repoRoot: expectedRepoRoot,
      branch: "feat/foo",
      dirty: false,
      activeWorkUnit: "foo",
      metaPath: ".arc/active/meta-foo.md",
      sessionType: "execution",
      taskCursor: {
        section: { id: "1.1", title: "Do seed", lineHint: 5 },
        leaf: { id: "1.1", title: "Do seed", lineHint: 5 },
      },
      uncommittedFiles: [],
    });
    expect(seed.head).toMatch(/^[0-9a-f]{40}$/);
    expect(seed.loadSet.manifestVersion).toBe(1);
    expect(seed.loadSet.entries).toContainEqual({
      path: ".arc/active/tasks-foo.md",
      readMode: { kind: "partial-strategic" },
    });
  });

  it("emits the lean recover envelope when --recover is requested", async () => {
    await execFileAsync("git", ["add", "-A"], { cwd: tmpDir });
    await execFileAsync("git", ["commit", "--no-verify", "-m", "init"], { cwd: tmpDir });
    await execFileAsync("git", ["checkout", "-b", "feat/foo"], { cwd: tmpDir });

    const activeDir = join(tmpDir, ".arc", "active");
    await mkdir(activeDir, { recursive: true });
    await writeFile(
      join(activeDir, "meta-foo.md"),
      [
        "# Metadata: Foo",
        "",
        "- **State:** Active",
        "- **Branch:** feat/foo",
        "- **Task List:** tasks-foo.md",
        "- **Current Workflow:** [none]",
        "- **Next Task:** Task 1.1 — Do recover (line ~12)",
        "- **Next Action:** Start Task 1.1",
        "",
      ].join("\n"),
    );
    await writeFile(join(activeDir, "tasks-foo.md"), taskListFixture("Do recover"));
    await execFileAsync("git", ["add", "-A"], { cwd: tmpDir });
    await execFileAsync("git", ["commit", "--no-verify", "-m", "active fixture"], { cwd: tmpDir });

    const result = await runArc(["status", "--recover", "--json"], tmpDir);
    expect(result.exitCode).toBe(0);

    const envelope = parseJsonEnvelope(result.stdout);
    expect(envelope.mode).toBe("recover");
    expect(envelope.user).toBeUndefined();
    expect(envelope.baseDistance).toBeUndefined();
    expect(envelope.baseBranchSync).toBeUndefined();
    expect(envelope.domainRules).toBeUndefined();
    expect(envelope.recommendedCombinedPrompt).toBeUndefined();
    expect(envelope.active.ok).toBe(true);
    expect(envelope.active.value?.resolution).toBe("single");
    expect(envelope.loadSet?.value?.manifestVersion).toBe(1);
    expect(envelope.loadSet?.value?.entries).toContainEqual({
      path: ".arc/active/tasks-foo.md",
      readMode: { kind: "partial-strategic" },
    });
    expect(envelope.taskCursor?.value).toMatchObject({
      status: "found",
      cursor: {
        section: { id: "1.1", title: "Do recover", lineHint: 5 },
        leaf: { id: "1.1", title: "Do recover", lineHint: 5 },
      },
    });
  });

  it("audits the compaction seed against fresh recovery state", async () => {
    await execFileAsync("git", ["add", "-A"], { cwd: tmpDir });
    await execFileAsync("git", ["commit", "--no-verify", "-m", "init"], { cwd: tmpDir });
    await execFileAsync("git", ["checkout", "-b", "feat/foo"], { cwd: tmpDir });

    const activeDir = join(tmpDir, ".arc", "active");
    await mkdir(activeDir, { recursive: true });
    await writeFile(
      join(activeDir, "meta-foo.md"),
      [
        "# Metadata: Foo",
        "",
        "- **State:** Active",
        "- **Branch:** feat/foo",
        "- **Task List:** tasks-foo.md",
        "- **Current Workflow:** [none]",
        "- **Next Task:** stale meta pointer ignored by recovery",
        "- **Next Action:** Start Task 1.1",
        "",
      ].join("\n"),
    );
    await writeFile(join(activeDir, "tasks-foo.md"), taskListFixture("Do audit"));
    await execFileAsync("git", ["add", "-A"], { cwd: tmpDir });
    await execFileAsync("git", ["commit", "--no-verify", "-m", "active fixture"], { cwd: tmpDir });

    const seedResult = await runArc(
      ["status", "--session-init", "--write-compaction-seed", "--json"],
      tmpDir,
    );
    expect(seedResult.exitCode).toBe(0);

    const auditResult = await runArc(["recover", "audit", "--json"], tmpDir);
    expect(auditResult.exitCode).toBe(0);

    const report = parseRecoverAuditReport(auditResult.stdout);
    expect(report.mode).toBe("recover-audit");
    expect(report.seedPath).toContain(
      join(".arc", "user", "test-user", ".internal", "compaction-seed.json"),
    );
    expect(report.verdict).toMatchObject({
      status: "ready",
      ready: true,
      stopReasons: [],
      taskCursor: {
        match: true,
        expected: {
          section: { id: "1.1", title: "Do audit", lineHint: 5 },
          leaf: { id: "1.1", title: "Do audit", lineHint: 5 },
        },
        actual: {
          status: "found",
          cursor: {
            section: { id: "1.1", title: "Do audit", lineHint: 5 },
            leaf: { id: "1.1", title: "Do audit", lineHint: 5 },
          },
        },
      },
    });
  });

  it("reports unreadable compaction seeds distinctly from missing seeds", async () => {
    await mkdir(
      join(tmpDir, ".arc", "user", "test-user", ".internal", "compaction-seed.json"),
      { recursive: true },
    );

    const auditResult = await runArc(["recover", "audit", "--json"], tmpDir);
    expect(auditResult.exitCode).toBe(0);

    const report = parseRecoverAuditReport(auditResult.stdout);
    expect(report.verdict).toMatchObject({
      status: "stop",
      ready: false,
      stopReasons: [
        {
          kind: "seed-unreadable",
        },
      ],
    });
  });

  it("rejects --recover combined with session-init mode", async () => {
    const result = await runArc(["status", "--recover", "--session-init", "--json"], tmpDir);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toContain(
      "--session-init, --session-handoff, --recover, and --user are mutually exclusive",
    );
  });

  it("emits sessionType=null when resolution=none + branch does not match plan-pattern (orphan)", async () => {
    // Default branch from `git init` does not match `plan/<name>` —
    // no candidate, no planning branch → null per the orphan-fallback rule.
    const result = await runArc(["status", "--session-init", "--json"], tmpDir);
    expect(result.exitCode).toBe(0);

    const envelope = parseJsonEnvelope(result.stdout);
    expect(envelope.mode).toBe("session-init");
    expect(envelope.active.ok).toBe(true);
    expect(envelope.active.value?.resolution).toBe("none");
    expect(envelope.active.value?.sessionType).toBeNull();
  });

  it("emits sessionType=execution for a single-WU + Start-Task fixture", async () => {
    await writeStatusFixture(tmpDir, "technical", "foo", {
      taskList: "`.arc/active/tasks-foo.md`",
      nextAction: "Start Task 4.2 — write unit tests",
    });

    const result = await runArc(["status", "--session-init", "--json"], tmpDir);
    expect(result.exitCode).toBe(0);

    const envelope = parseJsonEnvelope(result.stdout);
    expect(envelope.active.ok).toBe(true);
    expect(envelope.active.value?.resolution).toBe("single");
    expect(envelope.active.value?.sessionType).toBe("execution");
  });

  it("emits sessionType=integration when Next Action begins with integrate-work-unit", async () => {
    await writeStatusFixture(tmpDir, "technical", "foo", {
      taskList: "`.arc/active/tasks-foo.md`",
      nextAction: "integrate-work-unit Step 7 — push and create PR",
    });

    const result = await runArc(["status", "--session-init", "--json"], tmpDir);
    expect(result.exitCode).toBe(0);

    const envelope = parseJsonEnvelope(result.stdout);
    expect(envelope.active.ok).toBe(true);
    expect(envelope.active.value?.resolution).toBe("single");
    expect(envelope.active.value?.sessionType).toBe("integration");
  });
});

describe("session-init E2E — base-ref pull recommendation under session.init_pull.base", () => {
  let tmpDir: string;
  let bareDir: string;

  /**
   * Stand up a state where the local base ref (`main`) is one commit behind
   * `origin/main` while HEAD sits on a feature branch — the silently-stale
   * local base the `baseBranchSync` slot detects. Pushes two commits to a bare
   * remote, then rewinds local `main` one commit behind the pushed tip.
   */
  async function setupStaleLocalBase(repo: string): Promise<void> {
    const git = (args: string[]): Promise<unknown> => execFileAsync("git", args, { cwd: repo });
    await git(["add", "-A"]);
    await git(["commit", "--no-verify", "-m", "init"]);
    bareDir = await mkdtemp(join(tmpdir(), "arc-e2e-remote-"));
    await execFileAsync("git", ["init", "--bare", "-b", "main", bareDir]);
    await git(["remote", "add", "origin", bareDir]);
    await git(["push", "-u", "origin", "main"]);
    // Advance origin/main one commit beyond where local main will sit.
    await writeFile(join(repo, "ahead.txt"), "remote-only\n");
    await git(["add", "-A"]);
    await git(["commit", "--no-verify", "-m", "advance base"]);
    await git(["push", "origin", "main"]);
    // Move onto a feature branch, then rewind local main one commit behind
    // origin/main — local base is now stale while HEAD is elsewhere.
    await git(["checkout", "-b", "feat/x"]);
    await git(["branch", "-f", "main", "HEAD~1"]);
  }

  async function setBasePolicy(repo: string, value: string): Promise<void> {
    const cfgPath = join(repo, ".arc", "system", "arc-config.yml");
    const content = await readFile(cfgPath, "utf8");
    const next = content.replace(/^session\.init_pull\.base:.*$/mu, `session.init_pull.base: ${value}`);
    await writeFile(cfgPath, next);
    // Commit the config edit on the feature branch so the working tree is clean —
    // otherwise a dirty tree refuses the fast-forward (surface), masking the policy.
    await execFileAsync("git", ["commit", "--no-verify", "-am", `set base policy ${value}`], { cwd: repo });
  }

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
    await setupStaleLocalBase(tmpDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
    if (bareDir) await rm(bareDir, { recursive: true, force: true });
  });

  it("detects the behind local base as remote-ahead", async () => {
    const result = await runArc(["status", "--session-init", "--json"], tmpDir);
    expect(result.exitCode).toBe(0);
    const envelope = JSON.parse(result.stdout.trim()) as SessionInitEnvelope;
    expect(envelope.baseBranchSync?.ok).toBe(true);
    expect(envelope.baseBranchSync?.value?.state).toBe("remote-ahead");
    expect(envelope.baseBranchSync?.value?.behind).toBe(1);
    expect(envelope.baseBranchSync?.value?.base).toBe("main");
  });

  it("recommends `pull` under `always`", async () => {
    await setBasePolicy(tmpDir, "always");
    const result = await runArc(["status", "--session-init", "--json"], tmpDir);
    expect(result.exitCode).toBe(0);
    const envelope = JSON.parse(result.stdout.trim()) as SessionInitEnvelope;
    expect(envelope.baseBranchSync?.value?.recommendedAction).toBe("pull");
  });

  it("recommends `prompt` under `prompt` (default)", async () => {
    const result = await runArc(["status", "--session-init", "--json"], tmpDir);
    expect(result.exitCode).toBe(0);
    const envelope = JSON.parse(result.stdout.trim()) as SessionInitEnvelope;
    expect(envelope.baseBranchSync?.value?.recommendedAction).toBe("prompt");
    expect(envelope.baseBranchSync?.value?.recommendedPromptText).toContain("Fast-forward base?");
  });

  it("recommends `surface` (advisory only) under `manual`", async () => {
    await setBasePolicy(tmpDir, "manual");
    const result = await runArc(["status", "--session-init", "--json"], tmpDir);
    expect(result.exitCode).toBe(0);
    const envelope = JSON.parse(result.stdout.trim()) as SessionInitEnvelope;
    expect(envelope.baseBranchSync?.value?.recommendedAction).toBe("surface");
  });
});
