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
import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { COMPACTION_SEED_SCHEMA_VERSION } from "../../src/lib/compaction-seed/schema.js";
import { LOAD_SET_MANIFEST_VERSION } from "../../src/lib/load-set/types.js";
import { runArc, createTempRepo, cleanupTempDir, removeGitBackedDir, git } from "./helpers.js";

const execFileAsync = promisify(execFile);

interface SessionInitEnvelope {
  mode: string;
  user?: unknown;
  baseDistance?: {
    ok: boolean;
    value?: {
      mode: string;
      verdict: string;
      behind: number;
      integrationEvidence: unknown;
      overlap: unknown;
      register: { kind: string; text: string } | null;
      recommendedAction: string;
      recommendedPromptText: string;
    };
  };
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
  errandState?: {
    ok: boolean;
    value?: {
      residue: Array<{
        branch: string;
        slug: string;
        reason: string;
        marks?: string[];
      }>;
    };
  };
  currentHusk?: {
    ok: boolean;
    value?: {
      worktreePath: string;
      subject: { kind: "work-unit"; name: string };
    } | null;
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
      schemaVersion: COMPACTION_SEED_SCHEMA_VERSION,
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
    expect(seed.loadSet.manifestVersion).toBe(LOAD_SET_MANIFEST_VERSION);
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
    expect(envelope.loadSet?.value?.manifestVersion).toBe(LOAD_SET_MANIFEST_VERSION);
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
      "--session-init, --session-handoff, --recover, --user, and --project are mutually exclusive",
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

  it("surfaces a record-less remote branch as session-init cleanup residue", async () => {
    const bareDir = await mkdtemp(join(tmpdir(), "arc-session-init-residue-origin-"));
    try {
      await execFileAsync("git", ["init", "--bare", "--initial-branch=main", bareDir]);
      await execFileAsync("git", ["config", "gc.auto", "0"], { cwd: bareDir });
      await execFileAsync("git", ["remote", "add", "origin", bareDir], { cwd: tmpDir });
      await execFileAsync("git", ["add", "-A"], { cwd: tmpDir });
      await execFileAsync(
        "git",
        ["-c", "core.hooksPath=/dev/null", "commit", "-m", "install ARC"],
        { cwd: tmpDir },
      );
      await execFileAsync("git", ["push", "-u", "origin", "main"], { cwd: tmpDir });
      await execFileAsync("git", ["switch", "-c", "chore/merged-residue"], { cwd: tmpDir });
      await execFileAsync("git", ["push", "-u", "origin", "chore/merged-residue"], { cwd: tmpDir });
      await execFileAsync("git", ["switch", "main"], { cwd: tmpDir });

      const result = await runArc(["status", "--session-init", "--json"], tmpDir);
      expect(result.exitCode).toBe(0);

      const envelope = parseJsonEnvelope(result.stdout);
      expect(envelope.errandState).toMatchObject({
        ok: true,
        value: {
          residue: [
            {
              branch: "chore/merged-residue",
              slug: "merged-residue",
              reason: "no-record-or-meta",
            },
          ],
        },
      });
    } finally {
      await removeGitBackedDir(bareDir);
    }
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

describe("session-init E2E — current detached husk advisory", () => {
  let repo: string;
  let worktreeParent: string;

  beforeEach(async () => {
    repo = await createTempRepo();
    worktreeParent = await mkdtemp(join(tmpdir(), "arc-session-init-husk-wt-"));
    const init = await runArc(["init", "--yes", "--name", "test-project"], repo);
    expect(init.exitCode).toBe(0);
    await git(repo, ["add", "-A"]);
    await git(repo, ["commit", "-m", "chore: initialize ARC"]);
  });

  afterEach(async () => {
    await cleanupTempDir(repo);
    await cleanupTempDir(worktreeParent);
  });

  it("emits the advisory for an exact stamped WU husk without a completion record", async () => {
    const canonical = join(worktreeParent, "canonical");
    const ordinary = join(worktreeParent, "ordinary");
    await git(repo, ["branch", "feat/shipped-widget"]);
    await git(repo, ["branch", "feat/ordinary-detached"]);
    await git(repo, ["worktree", "add", canonical, "feat/shipped-widget"]);
    await git(repo, ["worktree", "add", ordinary, "feat/ordinary-detached"]);
    await git(canonical, ["switch", "--detach"]);
    await git(ordinary, ["switch", "--detach"]);

    const head = await git(canonical, ["rev-parse", "HEAD"]);
    const markerDir = join(canonical, ".arc", "system", ".internal");
    await mkdir(markerDir, { recursive: true });
    await writeFile(join(markerDir, "worktree-marker.json"), JSON.stringify({
      spawnedByArc: true,
      wuName: "shipped-widget",
      createdFor: { kind: "work-unit", name: "shipped-widget" },
      spawningIdentity: "test-user",
      createdAt: "2026-07-14T00:00:00.000Z",
      husk: {
        sha: head,
        at: "2026-07-14T01:00:00.000Z",
        subject: { kind: "work-unit", name: "shipped-widget" },
        branch: "feat/shipped-widget",
      },
    }));

    const canonicalResult = await runArc(["status", "--session-init", "--json"], canonical);
    const ordinaryResult = await runArc(["status", "--session-init", "--json"], ordinary);
    expect(canonicalResult.exitCode).toBe(0);
    expect(ordinaryResult.exitCode).toBe(0);

    const canonicalEnvelope = parseJsonEnvelope(canonicalResult.stdout);
    const ordinaryEnvelope = parseJsonEnvelope(ordinaryResult.stdout);
    expect(canonicalEnvelope.currentHusk).toEqual({
      ok: true,
      value: {
        worktreePath: await realpath(canonical),
        subject: { kind: "work-unit", name: "shipped-widget" },
        branch: "feat/shipped-widget",
        stamp: { kind: "legacy", authorization: "merged-preserved" },
      },
    });
    expect(ordinaryEnvelope.currentHusk).toEqual({ ok: true, value: null });

    await writeFile(join(markerDir, "worktree-marker.json"), JSON.stringify({
      spawnedByArc: true,
      wuName: "shipped-widget",
      createdFor: { kind: "work-unit", name: "shipped-widget" },
      spawningIdentity: "test-user",
      createdAt: "2026-07-14T00:00:00.000Z",
      husk: {
        sha: head,
        at: "2026-07-14T01:00:00.000Z",
        subject: { kind: "work-unit", name: "shipped-widget" },
        branch: "feat/shipped-widget",
        authorization: "discard-confirmed",
        remoteRef: null,
        evidence: {
          kind: "receipt",
          receiptId: `sha256:${"1".repeat(64)}`,
          transition: "abandon",
          expectedLifecycle: "nonexistent",
          resultDigest: `sha256:${"2".repeat(64)}`,
        },
      },
    }));

    const untrustedResult = await runArc(["status", "--session-init", "--json"], canonical);
    expect(untrustedResult.exitCode).toBe(0);
    expect(parseJsonEnvelope(untrustedResult.stdout).currentHusk).toEqual({ ok: true, value: null });
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
    await execFileAsync("git", ["config", "gc.auto", "0"], { cwd: bareDir });
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
    // Commit the config edit so the working tree stays clean for other channels
    // (notes-load / worktree) that still gate on dirtiness.
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
    if (bareDir) await removeGitBackedDir(bareDir);
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

describe("session-init E2E — shared advisory base drift", () => {
  let repo: string;
  let publisher: string;
  let remote: string;

  beforeEach(async () => {
    repo = await createTempRepo("arc-session-drift-");
    publisher = await mkdtemp(join(tmpdir(), "arc-session-drift-publisher-"));
    remote = await mkdtemp(join(tmpdir(), "arc-session-drift-remote-"));
    expect((await runArc(["init", "--yes", "--name", "test-project"], repo)).exitCode).toBe(0);
    await git(repo, ["add", "-A"]);
    await git(repo, ["commit", "--no-verify", "-m", "init"]);
    await execFileAsync("git", ["init", "--bare", "-b", "main", remote]);
    await git(repo, ["remote", "add", "origin", remote]);
    await git(repo, ["push", "-u", "origin", "main"]);
    await git(repo, ["switch", "-c", "feat/current"]);
    await writeFile(join(repo, "feature.txt"), "feature\n");
    await git(repo, ["add", "feature.txt"]);
    await git(repo, ["commit", "--no-verify", "-m", "feature work"]);

    await execFileAsync("git", ["clone", "--branch", "main", remote, publisher]);
    await git(publisher, ["config", "user.email", "publisher@test.com"]);
    await git(publisher, ["config", "user.name", "Publisher"]);
    await writeFile(join(publisher, "base.txt"), "base\n");
    await git(publisher, ["add", "base.txt"]);
    await git(publisher, ["commit", "-m", "base work"]);
    await git(publisher, ["push", "origin", "main"]);
  });

  afterEach(async () => {
    await cleanupTempDir(repo);
    await removeGitBackedDir(publisher);
    await removeGitBackedDir(remote);
  });

  it("emits typed reconcile evidence and passes register text through", async () => {
    const run = await runArc(["status", "--session-init", "--json"], repo);
    expect(run.exitCode).toBe(0);
    const value = parseJsonEnvelope(run.stdout).baseDistance?.value;
    expect(value?.verdict, JSON.stringify(value)).toBe("reconcile");
    expect(value).toMatchObject({ mode: "advisory", recommendedAction: "surface" });
    expect(value?.integrationEvidence).not.toBeNull();
    expect(value?.overlap).not.toBeNull();
    expect(value?.recommendedPromptText).toBe(value?.register?.text);
  });

  it("skips before Git analysis when advisory remote sync is disabled", async () => {
    const configPath = join(repo, ".arc/system/arc-config.yml");
    const config = await readFile(configPath, "utf8");
    await writeFile(configPath, config.replace("session.remote_sync: enabled", "session.remote_sync: disabled"));
    const run = await runArc(["status", "--session-init", "--json"], repo);
    expect(run.exitCode).toBe(0);
    expect(parseJsonEnvelope(run.stdout).baseDistance?.value).toMatchObject({
      mode: "advisory",
      verdict: "skipped",
      recommendedAction: "skip",
      recommendedPromptText: "",
    });
  });
});
