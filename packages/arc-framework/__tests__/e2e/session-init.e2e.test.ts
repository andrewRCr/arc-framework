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

import { execFile, spawn } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { COMPACTION_SEED_SCHEMA_VERSION } from "../../src/lib/compaction-seed/schema.js";
import { LOAD_SET_MANIFEST_VERSION } from "../../src/lib/load-set/types.js";
import {
  runArc,
  runArcAnchored,
  runArcAnchoredSequence,
  createTempRepo,
  cleanupTempDir,
  removeGitBackedDir,
  git,
} from "./helpers.js";

const execFileAsync = promisify(execFile);

interface SessionInitEnvelope {
  mode: string;
  locusState?: { ok: boolean };
  recoveryFrame?: { ok: boolean };
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
  locus?: {
    sessionHomePath: string;
    activeLocusPath: string;
    recordId: string;
    leaseId: string;
    parentRecordId: string | null;
  };
}

interface RecoverAuditReport {
  mode: string;
  seedPath: string | null;
  recover?: {
    recoveryFrame: {
      ok: boolean;
      value?: { kind: string; workflow: string; slug?: string; returnBranch?: string };
    };
    loadSet: {
      ok: boolean;
      value?: { entries: Array<{ path: string }> };
    };
  };
  verdict: {
    status: string;
    ready: boolean;
    stopReasons: { kind: string; message: string }[];
    taskCursor: {
      expected: TaskCursorJson | null;
      actual: { status: string; cursor?: TaskCursorJson } | null;
      match: boolean;
    } | null;
    locusHint?: {
      expected: CompactionSeedJson["locus"] | null;
      actual: CompactionSeedJson["locus"] | null;
      match: boolean;
    };
  };
}

async function gitWithInput(cwd: string, args: string[], input: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd, stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`git ${args.join(" ")} exited ${String(code)}: ${stderr}`));
    });
    child.stdin.end(input);
  });
}

async function seedLegacyRecoveryRecord(cwd: string): Promise<void> {
  const record = {
    version: 2,
    slug: "legacy-recovery",
    origin: "description",
    intent: "Close after compaction",
    branch: "chore/legacy-recovery",
    createdAt: "2026-07-21T00:00:00.000Z",
    returnBranch: "feat/parent",
  };
  const blob = await gitWithInput(cwd, ["hash-object", "-w", "--stdin"], `${JSON.stringify(record)}\n`);
  const tree = await gitWithInput(cwd, ["mktree"], `100644 blob ${blob}\tlegacy-recovery\n`);
  const commit = await git(cwd, ["commit-tree", tree, "-m", "seed legacy recovery"]);
  await git(cwd, ["update-ref", "refs/arc/user/test-user/errands", commit]);
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

async function prepareWorkUnit(repository: string): Promise<void> {
  const configPath = join(repository, ".arc", "system", "arc-config.yml");
  const config = await readFile(configPath, "utf8");
  await writeFile(
    configPath,
    config.replace("branch.protection: partial", "branch.protection: full"),
  );
  await git(repository, ["config", "arc.identity", "test-user"]);
  await git(repository, ["add", "-A"]);
  await git(repository, ["commit", "--no-verify", "-m", "initialize fixture"]);
  await git(repository, ["switch", "-c", "feat/locus-session"]);
  await mkdir(join(repository, ".arc", "active"), { recursive: true });
  await writeFile(
    join(repository, ".arc", "active", "meta-locus-session.md"),
    [
      "# Metadata: locus-session",
      "",
      "- **State:** Active",
      "- **Owner:** test-user",
      "- **Branch:** feat/locus-session",
      "- **Class:** Light",
      "- **Cohort:** [none]",
      "- **Task List:** tasks-locus-session.md",
      "- **Current Workflow:** [none]",
      "- **Last Completed:** [none]",
      "- **Next Task:** Task 1.1 — Exercise locus projection",
      "- **Blockers:** [none]",
      "- **Next Action:** Start Task 1.1",
      "",
    ].join("\n"),
  );
  await writeFile(
    join(repository, ".arc", "active", "tasks-locus-session.md"),
    taskListFixture("Exercise locus projection"),
  );
  await git(repository, ["add", "-A"]);
  await git(repository, ["commit", "--no-verify", "-m", "add active fixture"]);
  const attached = await runArcAnchored(["locus", "attach", "--json"], repository);
  if (attached.exitCode !== 0) throw new Error(attached.stderr || attached.stdout);
  const attachment = JSON.parse(attached.stdout) as { recordId: string; leaseId: string };
  const released = await runArcAnchored([
    "locus", "release", attachment.recordId, "--lease", attachment.leaseId, "--json",
  ], repository);
  if (released.exitCode !== 0) throw new Error(released.stderr || released.stdout);
}

describe("session lifecycle locus projection", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "locus-session-project"], tmpDir);
    expect(init.exitCode).toBe(0);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("shares one leaseless WU role projection across init, recovery, and handoff", async () => {
    await prepareWorkUnit(tmpDir);
    const sequence = await runArcAnchoredSequence([
      ["status", "--session-init", "--write-compaction-seed", "--json"],
      ["recover", "audit", "--json"],
      ["status", "--session-handoff", "--json"],
    ], tmpDir);

    expect(sequence.exitCode, sequence.stderr || sequence.stdout).toBe(0);
    const [session, audit, handoff] = sequence.results as Array<Record<string, unknown>>;
    expect(session).toMatchObject({
      mode: "session-init",
      locusState: {
        ok: true,
        value: {
          current: { kind: "none" },
          roster: {
            rows: [expect.objectContaining({
              role: expect.objectContaining({ kind: "work-unit" }),
              lease: null,
              frame: "idle",
            })],
          },
        },
      },
      taskCursor: { ok: true, value: { status: "found" } },
    });
    expect(audit).toMatchObject({
      mode: "recover-audit",
      recover: { recoveryFrame: { ok: true, value: { kind: "resolved", workflow: "process-task-loop" } } },
      verdict: {
        status: "ready",
        ready: true,
        locusHint: { expected: null, actual: null, match: true },
      },
    });
    expect(handoff).toMatchObject({
      mode: "session-handoff",
      locusState: { ok: true, value: { current: { kind: "none" } } },
      handoffLocus: { ok: true, value: { kind: "release-work-unit", leaseId: null } },
    });
  });

  it("accepts a hint-free cold seed and recovers a record-free frame", async () => {
    await git(tmpDir, ["config", "arc.identity", "test-user"]);
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "initialize fixture"]);
    const sequence = await runArcAnchoredSequence([
      ["status", "--session-init", "--write-compaction-seed", "--json"],
      ["recover", "audit", "--json"],
    ], tmpDir);

    expect(sequence.exitCode, sequence.stderr || sequence.stdout).toBe(0);
    const [session, audit] = sequence.results as Array<Record<string, unknown>>;
    expect(session).toMatchObject({
      locusState: { ok: true, value: { current: { kind: "none" } } },
    });
    expect(audit).toMatchObject({
      verdict: {
        status: "ready",
        ready: true,
        locusHint: { expected: null, actual: null, match: true },
      },
      recover: { recoveryFrame: { ok: true, value: { kind: "none" } } },
    });
  });

  it("rejects every mismatched field in the optional locus hint", async () => {
    await prepareWorkUnit(tmpDir);
    const seeded = await runArcAnchoredSequence([
      ["locus", "attach", "--json"],
      ["status", "--session-init", "--write-compaction-seed", "--json"],
    ], tmpDir);
    expect(seeded.exitCode, seeded.stderr || seeded.stdout).toBe(0);

    const seedPath = join(tmpDir, ".arc", "user", "test-user", ".internal", "compaction-seed.json");
    const original = JSON.parse(await readFile(seedPath, "utf8")) as CompactionSeedJson;
    expect(original.locus).toBeDefined();
    const replacements = {
      sessionHomePath: "/different-session-home",
      activeLocusPath: "/different-active-locus",
      recordId: `sha256:${"c".repeat(64)}`,
      leaseId: "d".repeat(32),
      parentRecordId: `sha256:${"e".repeat(64)}`,
    } as const;

    for (const [field, replacement] of Object.entries(replacements)) {
      await writeFile(seedPath, `${JSON.stringify({
        ...original,
        locus: { ...original.locus, [field]: replacement },
      }, null, 2)}\n`);
      const sequence = await runArcAnchoredSequence([
        ["locus", "attach", "--json"],
        ["recover", "audit", "--json"],
      ], tmpDir);
      expect(sequence.exitCode, sequence.stderr || sequence.stdout).toBe(0);
      const report = sequence.results[1] as {
        verdict: {
          status: string;
          stopReasons: Array<{ kind: string; detail?: { mismatchedFields?: string[] } }>;
        };
      };
      expect(report.verdict.status).toBe("stop");
      const mismatch = report.verdict.stopReasons.find((reason) => reason.kind === "locus-hint-mismatch");
      expect(mismatch?.detail?.mismatchedFields, field).toContain(field);
    }
  });

  it("recovers a warm transient before its parent WU context", async () => {
    await prepareWorkUnit(tmpDir);
    const remote = await mkdtemp(join(tmpdir(), "arc-warm-recovery-remote-"));
    await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
    await git(tmpDir, ["remote", "add", "origin", remote]);
    await git(tmpDir, ["push", "origin", "main"]);
    await git(tmpDir, ["push", "-u", "origin", "feat/locus-session"]);
    const harnessDir = await mkdtemp(join(tmpdir(), "arc-codex-anchor-"));
    const codexHarness = join(harnessDir, "codex");
    await copyFile("/bin/bash", codexHarness);
    await chmod(codexHarness, 0o755);
    try {
      const sequence = await runArcAnchoredSequence([
        ["locus", "attach", "--json"],
        ["errand", "open", "warm-recovery", "--intent", "Exercise transient recovery", "--json"],
        {
          args: ["status", "--session-init", "--write-compaction-seed", "--json"],
          cwdFromPreviousJson: "activeLocusPath",
        },
        { args: ["recover", "audit", "--json"], reuseResolvedCwd: true },
      ], tmpDir, { timeout: 60_000, anchorShellPath: codexHarness });

      expect(sequence.exitCode, sequence.stderr || sequence.stdout).toBe(0);
      const [attached, opened, session, audit] = sequence.results as [
        Record<string, unknown>,
        Record<string, unknown>,
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      expect(attached).toMatchObject({ outcome: "applied", operation: "locus-attach" });
      expect(opened, JSON.stringify(opened)).toMatchObject({
        outcome: "applied",
        operation: "errand-open",
        activeLocusPath: expect.any(String),
      });
      expect(session, JSON.stringify(session.locusState)).toMatchObject({
        locusState: {
          ok: true,
          value: {
            current: { kind: "resolved", parentRecordId: expect.any(String) },
          },
        },
      });
      expect(audit, JSON.stringify(audit.verdict)).toMatchObject({
        verdict: { status: "ready", ready: true, locusHint: { match: true } },
        recover: {
          recoveryFrame: {
            ok: true,
            value: { kind: "resolved", workflow: "run-errand", parentRecordId: expect.any(String) },
          },
          loadSet: { ok: true },
          taskCursor: { ok: true, value: { status: "found" } },
        },
      });
    } finally {
      await removeGitBackedDir(remote);
      await removeGitBackedDir(harnessDir);
    }
  });
});

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
    expect(envelope.locusState?.ok).toBe(false);
    expect(envelope.recoveryFrame?.ok).toBe(false);
    expect(envelope.loadSet?.ok).toBe(false);
    expect(envelope.taskCursor).toBeUndefined();
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
      status: "stop",
      ready: false,
      stopReasons: expect.arrayContaining([
        expect.objectContaining({ kind: "load-set-unresolved" }),
        expect.objectContaining({ kind: "task-cursor-unresolved" }),
      ]),
      taskCursor: { match: false, actual: null },
    });
  });

  it("recovers one pre-locus v2 Errand through its recorded return branch", async () => {
    const configPath = join(tmpDir, ".arc", "system", "arc-config.yml");
    const config = await readFile(configPath, "utf8");
    await writeFile(configPath, config.replace("branch.protection: partial", "branch.protection: full"));
    await execFileAsync("git", ["add", "-A"], { cwd: tmpDir });
    await execFileAsync("git", ["commit", "--no-verify", "-m", "init"], { cwd: tmpDir });
    await execFileAsync("git", ["checkout", "-b", "feat/parent"], { cwd: tmpDir });
    await writeStatusFixture(tmpDir, "feat", "parent", {
      taskList: "tasks-parent.md",
      nextAction: "Start Task 1.1",
    });
    await writeFile(join(tmpDir, ".arc", "active", "tasks-parent.md"), taskListFixture("Resume parent"));
    await execFileAsync("git", ["add", "-A"], { cwd: tmpDir });
    await execFileAsync("git", ["commit", "--no-verify", "-m", "parent fixture"], { cwd: tmpDir });
    await execFileAsync("git", ["switch", "-c", "chore/legacy-recovery"], { cwd: tmpDir });
    await seedLegacyRecoveryRecord(tmpDir);

    const seeded = await runArcAnchored(
      ["status", "--session-init", "--write-compaction-seed", "--json"],
      tmpDir,
    );
    expect(seeded.exitCode).toBe(0);
    const audit = await runArcAnchored(["recover", "audit", "--json"], tmpDir);
    expect(audit.exitCode).toBe(0);
    const report = parseRecoverAuditReport(audit.stdout);
    expect(report.verdict).toMatchObject({ status: "ready", ready: true, stopReasons: [] });
    expect(report.recover?.recoveryFrame).toMatchObject({
      ok: true,
      value: {
        kind: "legacy-errand",
        workflow: "run-errand",
        slug: "legacy-recovery",
        returnBranch: "feat/parent",
      },
    });
    expect(report.recover?.loadSet.value?.entries.at(-1)?.path)
      .toBe(".arc/system/workflows/arc/supplemental/run-errand.md");

    const closed = await runArc(["errand", "close", "legacy-recovery", "--force", "--json"], tmpDir);
    expect(closed.exitCode, closed.stderr || closed.stdout).toBe(0);
    expect(await git(tmpDir, ["branch", "--show-current"])).toBe("feat/parent");
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

  it("keeps record-less remote residue manual when locus classification is unavailable", async () => {
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
              reason: "classification-unavailable",
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
