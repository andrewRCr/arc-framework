/**
 * Session-init E2E tests.
 *
 * Exercises `arc status --session-init --json` end-to-end against a fresh
 * `arc init` install, verifying that the binary's CLI argument parsing and
 * JSON serialization carry the inferred `sessionType` correctly across the
 * resolved type variants (planning / execution / prepublication / integration).
 *
 * SESSION-NOTES `**Session Type:**` override resolution is intentionally
 * out of scope here — overrides are applied agent-side at SESSION-NOTES
 * read-time, not by the CLI probe (see Task 6.3 outcome and Phase 6 lens).
 * Override behavior is exercised manually at Task 6.5 phase close via
 * deliberate spot-checks.
 */

import { execFile, spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { COMPACTION_SEED_SCHEMA_VERSION } from "../../src/lib/compaction-seed/schema.js";
import { LOAD_SET_MANIFEST_VERSION } from "../../src/lib/load-set/types.js";
import {
  renderMetaFile,
  setMetaCurrentWorkflow,
  setMetaState,
} from "../../src/lib/active/meta-reader.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { RepositoryDeliveryPlanStore, RepositoryDeliveryStateStore } from
  "../../src/lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../../src/lib/delivery/plan.js";
import { renderDeliveryPlanSection } from "../../src/lib/delivery/task-list-render.js";
import { gitExec } from "../../src/lib/io-context.js";
import { deliveryThreeMemberStackPlanForWorkUnitFixture } from "../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../fixtures/delivery-state.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { runArc, createTempRepo, cleanupTempDir, removeGitBackedDir, git } from "./helpers.js";

const execFileAsync = promisify(execFile);

interface SessionInitEnvelope {
  mode: string;
  derivedLocusState?: { ok: boolean };
  recoveryFrame?: {
    ok: boolean;
    value?: { kind: string; workflow: string | null; sessionType: string | null };
  };
  user?: unknown;
  userReferenceReconcile?: {
    ok: boolean;
    value?: { authority?: { remoteEvidence?: string } };
  };
  worktree?: {
    ok: boolean;
    value?: {
      state: string;
      remoteEvidence?: string;
      failureReason?: string;
    };
  };
  baseDistance?: {
    ok: boolean;
    value?: {
      mode: string;
      verdict: string;
      movement?: "disjoint" | "overlapping" | "unknown";
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
      currentWorkflow: string | null;
      integrationBoundary?: {
        candidateId: string;
        candidateSubjectDigest: string | null;
        locus: string;
        nextAction: { kind: string; command: string; interactionText: string };
      } | null;
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
      warnings: string[];
      residue: Array<{
        branch: string;
        slug: string;
        reason: string;
        marks?: string[];
      }>;
    };
  };
  materializableWorkUnits?: {
    ok: boolean;
    value?: { remoteEvidence: string; candidates: unknown[] };
  };
  currentHusk?: {
    ok: boolean;
    value?: {
      worktreePath: string;
      subject: { kind: "work-unit"; name: string };
    } | null;
  };
  sweep?: {
    ok: boolean;
    value?: {
      renameMoves: Array<{
        oldSlug: string;
        newSlug: string;
        branch: string;
        head: string;
        from: string;
        to: string;
        remedy: { argv: string[]; text: string };
      }>;
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

interface GitTraceHarness {
  binDir: string;
  logPath: string;
  batchInputPath: string;
  env: Record<string, string>;
}

async function createGitTraceHarness(): Promise<GitTraceHarness> {
  const binDir = await mkdtemp(join(tmpdir(), "arc-session-init-git-trace-"));
  const logPath = join(binDir, "git.log");
  const batchInputPath = join(binDir, "batch-input.txt");
  const wrapperPath = join(binDir, "git");
  await writeFile(wrapperPath, [
    "#!/bin/sh",
    // Compose the record, then append it in one write: the probes run concurrently, so
    // separate appends can interleave mid-record and corrupt the trace being asserted on.
    // The tab-per-field shape is preserved because the reader splits records on tabs.
    "__arc_record=$(printf '%s\\t' \"$PWD\" \"$@\")",
    "printf '%s\\n' \"$__arc_record\" >> \"$ARC_GIT_TRACE_LOG\"",
    "case \"$ARC_GIT_TRACE_HISTORY:$*\" in",
    "  shallow:*\"rev-parse --is-shallow-repository\"*)",
    "    printf '%s\\n' 'true'",
    "    exit 0",
    "    ;;",
    "esac",
    "case \"$ARC_GIT_TRACE_FAIL:$*\" in",
    "  remote:*\"ls-remote --heads origin\"*)",
    "    printf '%s\\n' 'network is unreachable' >&2",
    "    exit 1",
    "    ;;",
    "  batch:*\"cat-file --batch-check\"*)",
    "    /bin/cat > /dev/null",
    "    printf '%s\\n' 'local object inspection denied' >&2",
    "    exit 1",
    "    ;;",
    "esac",
    "case \"$ARC_GIT_TRACE_REJECT_CODE_WRITES:$*\" in",
    "  1:*refs/notes/arc/user/*|1:*refs/arc/user/*|1:*refs/arc/tmp/transient-discovery/*)",
    "    ;;",
    "  1:fetch*|1:update-ref*|1:symbolic-ref*|1:branch*|1:pack-objects*|1:index-pack*|1:maintenance*|1:gc*)",
    "    printf '%s\\n' 'code-repository metadata write denied' >&2",
    "    exit 97",
    "    ;;",
    "esac",
    "case \" $* \" in",
    "  *\" cat-file --batch-check\"*)",
    "    /bin/cat > \"$ARC_GIT_TRACE_BATCH_INPUT\"",
    "    PATH=\"$ARC_GIT_REAL_PATH\" exec git \"$@\" < \"$ARC_GIT_TRACE_BATCH_INPUT\"",
    "    ;;",
    "esac",
    "PATH=\"$ARC_GIT_REAL_PATH\" exec git \"$@\"",
    "",
  ].join("\n"));
  await chmod(wrapperPath, 0o755);
  const realPath = process.env.PATH ?? "";
  return {
    binDir,
    logPath,
    batchInputPath,
    env: {
      PATH: `${binDir}:${realPath}`,
      ARC_GIT_REAL_PATH: realPath,
      ARC_GIT_TRACE_LOG: logPath,
      ARC_GIT_TRACE_BATCH_INPUT: batchInputPath,
    },
  };
}

async function readGitTrace(harness: GitTraceHarness): Promise<string[][]> {
  const content = await readFile(harness.logPath, "utf8");
  return content.trim().split("\n").filter(Boolean).map((line) => line.split("\t").filter(Boolean));
}

async function writeStatusFixture(
  arcRoot: string,
  category: string,
  stem: string,
  fields: { taskList?: string; nextAction: string },
): Promise<void> {
  await git(arcRoot, ["add", "-A"]);
  await git(arcRoot, ["commit", "--allow-empty", "-m", "initialize fixture"]);
  await git(arcRoot, ["switch", "-c", `${category}/${stem}`]);
  const dir = join(arcRoot, ".arc", "active");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `meta-${stem}.md`), makeMetaFixture(stem, {
    owner: "test-user",
    branch: `${category}/${stem}`,
    taskList: fields.taskList?.replaceAll("`", "") ?? null,
    nextAction: fields.nextAction,
  }));
}

async function writeUserReferenceStatusFixture(
  arcRoot: string,
  category: string,
  stem: string,
  fields: { taskList?: string; nextAction: string; candidateId?: string },
): Promise<void> {
  await git(arcRoot, ["add", "-A"]);
  await git(arcRoot, ["commit", "--allow-empty", "-m", "initialize fixture"]);
  await git(arcRoot, ["switch", "-c", `${category}/${stem}`]);
  const dir = join(arcRoot, ".arc", "active");
  await mkdir(dir, { recursive: true });
  const lines: string[] = [
    `# Metadata: ${stem}`,
    "",
    "- **State:** Active",
    "- **Owner:** test-user",
    `- **Branch:** ${category}/${stem}`,
  ];
  if (fields.taskList !== undefined) {
    lines.push(`- **Task List:** ${fields.taskList}`);
  }
  lines.push(`- **Candidate:** ${fields.candidateId ?? "[none]"}`);
  lines.push("- **Current Workflow:** [none]");
  lines.push("- **Last Completed:** [none]");
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

async function gitWithInput(cwd: string, args: string[], input: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
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

async function seedOpenErrandIdentity(cwd: string, slug: string): Promise<void> {
  const timestamp = "2026-08-04T00:00:00.000Z";
  const record = {
    version: 3,
    kind: "errand",
    slug,
    claimId: "c".repeat(32),
    purpose: "errand",
    origin: "description",
    originEntry: null,
    intent: slug,
    branch: `chore/${slug}`,
    state: "open",
    savedHead: null,
    changeRequest: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const blob = await gitWithInput(cwd, ["hash-object", "-w", "--stdin"], `${JSON.stringify(record)}\n`);
  const tree = await gitWithInput(cwd, ["mktree"], `100644 blob ${blob}\t${slug}\n`);
  const commit = await git(cwd, ["commit-tree", tree, "-m", `seed v3 errand ${slug}`]);
  await git(cwd, ["update-ref", "refs/arc/user/test-user/errands", commit]);
}

function taskListFixture(title: string): string {
  return [
    "# Task List: Foo",
    "",
    "<!-- arc:delivery-plan:start -->",
    "## Delivery Plan",
    "",
    "### Members",
    "",
    "| #   | Member | Chunk key |",
    "| --- | ------ | --------- |",
    "| 1   | Foo    | `foo`     |",
    "",
    "#### Acceptance",
    "",
    "- **1. seam:** `9.9` is projection prose, not a task.",
    "<!-- arc:delivery-plan:end -->",
    "",
    "## **Phase 1:** Work",
    "",
    `### \`[ ]\` **1.1 ${title}**`,
    "",
  ].join("\n");
}

function singletonTaskListFixture(title: string): string {
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

  it("does not warn that a valid v3 Errand identity is malformed", async () => {
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "init"]);
    await seedOpenErrandIdentity(tmpDir, "valid-v3");

    const result = await runArc(["status", "--session-init", "--json"], tmpDir);
    expect(result.exitCode).toBe(0);
    const envelope = parseJsonEnvelope(result.stdout);

    expect(envelope.errandState?.ok).toBe(true);
    expect(envelope.errandState?.value?.warnings).not.toContain(
      "Errand record `valid-v3` is malformed.",
    );
  });

  it("does not invent a planning session from a branch-shaped unoccupied checkout", async () => {
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
    expect(envelope.active.value?.sessionType).toBeNull();
  });

  it("writes the compaction seed sidecar when requested with session-init", async () => {
    await execFileAsync("git", ["add", "-A"], { cwd: tmpDir });
    await execFileAsync("git", ["commit", "--no-verify", "-m", "init"], { cwd: tmpDir });
    await execFileAsync("git", ["checkout", "-b", "feat/foo"], { cwd: tmpDir });

    const activeDir = join(tmpDir, ".arc", "active");
    await mkdir(activeDir, { recursive: true });
    await writeFile(
      join(activeDir, "meta-foo.md"),
      makeMetaFixture("Foo", {
        owner: "test-user",
        branch: "feat/foo",
        taskList: "tasks-foo.md",
        nextTask: "Task 1.1 — Do seed (line ~12)",
        nextAction: "Start Task 1.1",
      }),
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
        section: { id: "1.1", title: "Do seed", lineHint: 19 },
        leaf: { id: "1.1", title: "Do seed", lineHint: 19 },
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
      makeMetaFixture("Foo", {
        owner: "test-user",
        branch: "feat/foo",
        taskList: "tasks-foo.md",
        nextTask: "Task 1.1 — Do recover (line ~12)",
        nextAction: "Start Task 1.1",
      }),
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
    expect(envelope.active).toBeUndefined();
    expect(envelope.derivedLocusState?.ok).toBe(true);
    expect(envelope).not.toHaveProperty("locusState");
    expect(envelope.recoveryFrame).toMatchObject({
      ok: true,
      value: {
        kind: "resolved",
        subject: { kind: "work-unit", key: "foo" },
        workflow: "process-task-loop",
        sessionType: "execution",
      },
    });
    expect(envelope.loadSet?.ok).toBe(true);
    expect(envelope.loadSet?.value?.entries.map((entry) => entry.path))
      .toContain(".arc/active/meta-foo.md");
    expect(envelope.taskCursor).toMatchObject({ ok: true, value: { status: "found" } });
  });

  it("reopens substantial integration work to an exact task and recovers without stale Candidate authority", async () => {
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "init"]);
    await git(tmpDir, ["switch", "-c", "feat/foo"]);

    const activeDir = join(tmpDir, ".arc", "active");
    await mkdir(activeDir, { recursive: true });
    await writeFile(
      join(activeDir, "meta-foo.md"),
      renderMetaFile("foo", {
        state: "Integrating",
        owner: "test-user",
        branch: "feat/foo",
        workClass: "Heavy",
        priority: "P1",
        taskList: "tasks-foo.md",
        candidateId: `sha256:${"1".repeat(64)}`,
        currentWorkflow: "integrate-work-unit",
        lastCompleted: "Task 9.1 — Complete verification",
        nextAction: "Complete integration",
      }),
    );
    await writeFile(join(activeDir, "tasks-foo.md"), singletonTaskListFixture("Repair lifecycle recovery"));
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "integrating fixture"]);

    const ghBin = join(tmpDir, ".git", "arc-test-bin");
    const ghLog = join(ghBin, "gh.log");
    await mkdir(ghBin, { recursive: true });
    await writeFile(
      join(ghBin, "gh"),
      [
        "#!/bin/sh",
        "printf '%s\\n' \"$*\" >> \"$ARC_TEST_GH_LOG\"",
        "if [ \"$1\" = pr ] && [ \"$2\" = view ]; then",
        "  printf '%s\\n' '{\"state\":\"OPEN\",\"isDraft\":false}'",
        "  exit 0",
        "fi",
        "if [ \"$1\" = pr ] && [ \"$2\" = ready ]; then exit 0; fi",
        "exit 2",
        "",
      ].join("\n"),
    );
    await chmod(join(ghBin, "gh"), 0o755);
    const env = {
      ARC_TEST_GH_LOG: ghLog,
      PATH: `${ghBin}:${process.env.PATH ?? ""}`,
    };

    const task = "Task 1.1 — Repair lifecycle recovery";
    const mismatched = await runArc(
      ["reopen", "foo", "--keep-pr", "--task", "Task 1.1 — Invented narrative"],
      tmpDir,
      { env },
    );
    expect(mismatched.exitCode).toBe(1);
    expect(mismatched.stdout + mismatched.stderr).toContain(task);
    expect(await readFile(ghLog, "utf8")).toBe("pr view feat/foo --json state\n");
    await writeFile(ghLog, "");

    const missingTask = await runArc(["reopen", "foo", "--keep-pr"], tmpDir, { env });
    expect(missingTask.exitCode).toBe(1);
    expect(missingTask.stdout + missingTask.stderr).toContain(task);
    expect(await readFile(ghLog, "utf8")).toBe("pr view feat/foo --json state\n");
    await writeFile(ghLog, "");

    const reopened = await runArc(["reopen", "foo", "--keep-pr", "--task", task], tmpDir, { env });
    expect(reopened.exitCode, reopened.stdout + reopened.stderr).toBe(0);

    const meta = await readFile(join(activeDir, "meta-foo.md"), "utf8");
    expect(meta).toContain("| `Active`");
    expect(meta).toContain("- **Current Workflow:** [none]");
    expect(meta).toContain(`- **Next Task:** ${task}`);
    expect(await readFile(ghLog, "utf8")).toBe([
      "pr view feat/foo --json state",
      "pr view feat/foo --json state,isDraft",
      "pr ready feat/foo --undo",
      "",
    ].join("\n"));

    const seeded = await runArc(
      ["status", "--session-init", "--write-compaction-seed", "--json"],
      tmpDir,
      { env },
    );
    expect(seeded.exitCode, seeded.stdout + seeded.stderr).toBe(0);
    const envelope = parseJsonEnvelope(seeded.stdout);
    expect(envelope.derivedLocusState).toMatchObject({ ok: true });
    expect(envelope.active).toMatchObject({
      ok: true,
      value: { currentWorkflow: "process-task-loop", sessionType: "execution" },
    });

    const recovered = await runArc(["status", "--recover", "--json"], tmpDir, { env });
    expect(recovered.exitCode, recovered.stdout + recovered.stderr).toBe(0);
    const recovery = parseJsonEnvelope(recovered.stdout);
    expect(recovery.recoveryFrame).toMatchObject({
      ok: true,
      value: { workflow: "process-task-loop", sessionType: "execution" },
    });
    expect(recovery.taskCursor).toMatchObject({ ok: true, value: { status: "found" } });

    const audited = await runArc(["recover", "audit", "--json"], tmpDir, { env });
    expect(audited.exitCode, audited.stdout + audited.stderr).toBe(0);
    expect(parseRecoverAuditReport(audited.stdout).verdict).toMatchObject({
      status: "ready",
      ready: true,
      stopReasons: [],
    });

    await writeFile(
      join(activeDir, "tasks-foo.md"),
      singletonTaskListFixture("Repair lifecycle recovery").replace("`[ ]`", "`[x]`"),
    );
    await git(tmpDir, ["add", "-A"]);

    const closeoutSeeded = await runArc(
      ["status", "--session-init", "--write-compaction-seed", "--json"],
      tmpDir,
      { env },
    );
    expect(closeoutSeeded.exitCode, closeoutSeeded.stdout + closeoutSeeded.stderr).toBe(0);
    const closeout = parseJsonEnvelope(closeoutSeeded.stdout);
    expect(closeout.active).toMatchObject({
      ok: true,
      value: { currentWorkflow: "verify-work-unit", sessionType: "execution" },
    });
    expect(closeout.taskCursor).toEqual({ ok: true, value: { status: "no-open-task" } });
    expect(closeout.loadSet?.value?.entries).toContainEqual({
      path: ".arc/system/workflows/arc/work-unit-lifecycle/verify-work-unit.md",
      readMode: { kind: "full" },
    });
    expect(closeout.loadSet?.value?.entries.map((entry) => entry.path))
      .not.toContain(".arc/active/tasks-foo.md");

    const closeoutRecovered = await runArc(["status", "--recover", "--json"], tmpDir, { env });
    expect(closeoutRecovered.exitCode, closeoutRecovered.stdout + closeoutRecovered.stderr).toBe(0);
    expect(parseJsonEnvelope(closeoutRecovered.stdout).recoveryFrame).toMatchObject({
      ok: true,
      value: { workflow: "verify-work-unit", sessionType: "execution" },
    });

    const closeoutAudit = await runArc(["recover", "audit", "--json"], tmpDir, { env });
    expect(closeoutAudit.exitCode, closeoutAudit.stdout + closeoutAudit.stderr).toBe(0);
    expect(parseRecoverAuditReport(closeoutAudit.stdout).verdict).toMatchObject({
      status: "ready",
      ready: true,
      stopReasons: [],
      taskCursor: null,
    });

    const attested = await runArc(["attest", "foo", "--json"], tmpDir, { env });
    expect(attested.exitCode, attested.stdout + attested.stderr).toBe(0);
    expect(parseJsonEnvelope(attested.stdout)).toMatchObject({
      status: "attested",
      locus: { locus: "candidate-review-pending" },
    });

    const prepublication = await runArc(["status", "--session-init", "--json"], tmpDir, { env });
    expect(prepublication.exitCode, prepublication.stdout + prepublication.stderr).toBe(0);
    expect(parseJsonEnvelope(prepublication.stdout).active).toMatchObject({
      ok: true,
      value: { currentWorkflow: "prepare-work-unit", sessionType: "prepublication" },
    });
  });

  it("refuses ordinary reopen for a bound delivery before host or lifecycle mutation", async () => {
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "init"]);
    await git(tmpDir, ["switch", "-c", "feat/foo"]);

    const plan = deliveryThreeMemberStackPlanForWorkUnitFixture("foo");
    const activeDir = join(tmpDir, ".arc", "active");
    await mkdir(activeDir, { recursive: true });
    await writeFile(
      join(activeDir, "meta-foo.md"),
      renderMetaFile("foo", {
        state: "Integrating",
        owner: "test-user",
        branch: "feat/foo",
        workClass: "Heavy",
        priority: "P1",
        taskList: "tasks-foo.md",
        candidateId: `sha256:${"1".repeat(64)}`,
        currentWorkflow: "integrate-work-unit",
        lastCompleted: "Task 9.1 — Complete verification",
        nextAction: "Complete integration",
      }),
    );
    await writeFile(join(activeDir, "tasks-foo.md"), [
      "# Task List: Foo",
      "",
      renderDeliveryPlanSection(plan).trimEnd(),
      "",
      "## **Phase 1:** Work",
      "",
      "### `[ ]` **1.1 Repair the published delivery**",
      "",
    ].join("\n"));
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "bound delivery fixture"]);

    const publisher = new RepositoryGitCommonStatePublisher(gitExec, tmpDir);
    const plans = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
    const states = new RepositoryDeliveryStateStore(publisher);
    expect(await plans.publishCurrent(plan.planId, plan, null)).toMatchObject({ status: "ok" });
    expect(await states.publish(plan.planId, deliveryStateFixture(plan), 0)).toMatchObject({ status: "ok" });

    const ghBin = join(tmpDir, ".git", "arc-test-bin");
    const ghLog = join(ghBin, "gh.log");
    await mkdir(ghBin, { recursive: true });
    await writeFile(ghLog, "");
    await writeFile(join(ghBin, "gh"), [
      "#!/bin/sh",
      "printf '%s\\n' \"$*\" >> \"$ARC_TEST_GH_LOG\"",
      "exit 2",
      "",
    ].join("\n"));
    await chmod(join(ghBin, "gh"), 0o755);

    const result = await runArc(
      ["reopen", "foo", "--keep-pr", "--task", "Task 1.1 — Repair the published delivery"],
      tmpDir,
      {
        env: {
          ARC_TEST_GH_LOG: ghLog,
          PATH: `${ghBin}:${process.env.PATH ?? ""}`,
        },
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain("coherently bound delivery");
    expect(await readFile(ghLog, "utf8")).toBe("");
    expect(await readFile(join(activeDir, "meta-foo.md"), "utf8")).toContain("| `Integrating`");
  });

  it("resumes an open published correction without leaving integration", async () => {
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "init"]);
    await git(tmpDir, ["switch", "-c", "feat/foo"]);

    const activeDir = join(tmpDir, ".arc", "active");
    await mkdir(activeDir, { recursive: true });
    await writeFile(
      join(activeDir, "meta-foo.md"),
      makeMetaFixture("Foo", {
        owner: "test-user",
        branch: "feat/foo",
        taskList: "tasks-foo.md",
        nextAction: "Complete integration",
      }),
    );
    const closedTasks = [
      "# Task List: Foo",
      "",
      "## **Phase 1:** Work",
      "",
      "### `[x]` **1.1 Complete initial work**",
      "",
    ].join("\n");
    await writeFile(join(activeDir, "tasks-foo.md"), closedTasks);
    await writeFile(join(tmpDir, "reviewed.txt"), "attested implementation\n");
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "verified fixture"]);

    const attested = await runArc(["attest", "foo", "--json"], tmpDir);
    expect(attested.exitCode, attested.stdout + attested.stderr).toBe(0);
    const metaPath = join(activeDir, "meta-foo.md");
    const attestedMeta = await readFile(metaPath, "utf8");
    await writeFile(
      metaPath,
      setMetaCurrentWorkflow(setMetaState(attestedMeta, "Integrating"), "integrate-work-unit"),
    );
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "public integration fixture"]);

    const seeded = await runArc(
      ["status", "--session-init", "--write-compaction-seed", "--json"],
      tmpDir,
    );
    expect(seeded.exitCode, seeded.stdout + seeded.stderr).toBe(0);
    expect(parseJsonEnvelope(seeded.stdout)).toMatchObject({
      active: {
        ok: true,
        value: { sessionType: "integration", currentWorkflow: "integrate-work-unit" },
      },
      compactionSeedWrite: { status: "written" },
    });

    await writeFile(
      join(activeDir, "tasks-foo.md"),
      `${closedTasks}\n### \`[ ]\` **1.2 Correct published behavior**\n`,
    );
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "append correction"]);

    const result = await runArc(["status", "--session-init", "--json"], tmpDir);
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    const envelope = parseJsonEnvelope(result.stdout);
    expect(envelope.active).toMatchObject({
      ok: true,
      value: {
        resolution: "single",
        sessionType: "integration",
        currentWorkflow: "process-task-loop",
      },
    });
    expect(envelope.taskCursor).toMatchObject({
      ok: true,
      value: {
        status: "found",
        cursor: {
          section: { id: "1.2", title: "Correct published behavior" },
          leaf: { id: "1.2", title: "Correct published behavior" },
        },
      },
    });
    expect(envelope.loadSet?.value?.entries).toEqual(expect.arrayContaining([
      {
        path: ".arc/active/tasks-foo.md",
        readMode: { kind: "partial-strategic" },
      },
      {
        path: ".arc/system/workflows/arc/process-task-loop.md",
        readMode: { kind: "full" },
      },
    ]));
    expect(envelope.loadSet?.value?.entries.map((entry) => entry.path))
      .not.toContain(".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md");

    const audited = await runArc(["recover", "audit", "--json"], tmpDir);
    expect(audited.exitCode, audited.stdout + audited.stderr).toBe(0);
    expect(parseRecoverAuditReport(audited.stdout).verdict).toMatchObject({
      status: "ready",
      ready: true,
      stopReasons: [],
      taskCursor: {
        match: true,
        actual: { status: "found", cursor: { leaf: { id: "1.2" } } },
      },
    });
  });

  it("projects integration verification while Candidate applicability awaits authority", async () => {
    await execFileAsync("git", ["add", "-A"], { cwd: tmpDir });
    await execFileAsync("git", ["commit", "--no-verify", "-m", "init"], { cwd: tmpDir });
    await execFileAsync("git", ["checkout", "-b", "feat/foo"], { cwd: tmpDir });

    const activeDir = join(tmpDir, ".arc", "active");
    await mkdir(activeDir, { recursive: true });
    await writeFile(
      join(activeDir, "meta-foo.md"),
      makeMetaFixture("Foo", {
        owner: "test-user",
        branch: "feat/foo",
        taskList: "tasks-foo.md",
        nextAction: "Complete integration",
      }),
    );
    await writeFile(
      join(activeDir, "tasks-foo.md"),
      [
        "# Task List: Foo",
        "",
        "## **Phase 1:** Work",
        "",
        "### `[x]` **1.1 Complete recovery**",
        "",
      ].join("\n"),
    );
    await writeFile(join(tmpDir, "reviewed.txt"), "attested implementation\n");
    await execFileAsync("git", ["add", "-A"], { cwd: tmpDir });
    await execFileAsync("git", ["commit", "--no-verify", "-m", "integrating fixture"], { cwd: tmpDir });

    const attested = await runArc(["attest", "foo", "--json"], tmpDir);
    expect(attested.exitCode, attested.stdout + attested.stderr).toBe(0);
    const candidateBoundaryPath = join(
      tmpDir,
      ".arc",
      "system",
      ".internal",
      "candidates",
      "foo.boundary.json",
    );
    const candidateBoundary = JSON.parse(await readFile(candidateBoundaryPath, "utf8")) as {
      candidateId: string;
      candidateSubjectDigest: string;
    };
    const attestedMetaPath = join(activeDir, "meta-foo.md");
    const attestedMeta = await readFile(attestedMetaPath, "utf8");
    await writeFile(
      attestedMetaPath,
      setMetaCurrentWorkflow(setMetaState(attestedMeta, "Integrating"), "integrate-work-unit"),
    );
    await writeFile(candidateBoundaryPath, `${JSON.stringify({
      schemaVersion: 1,
      mode: "integration-boundary",
      workUnit: "foo",
      candidateId: candidateBoundary.candidateId,
      candidateSubjectDigest: candidateBoundary.candidateSubjectDigest,
      locus: "publication-pending",
      nextAction: {
        kind: "continue-publication",
        command: "git push -u origin feat/foo",
        interactionText: "Resume publication at the idempotent push, then resolve or open the change request.",
      },
      policy: null,
      reservation: null,
    })}\n`);
    await execFileAsync("git", ["add", "-A"], { cwd: tmpDir });
    await execFileAsync("git", ["commit", "--no-verify", "-m", "publish fixture"], { cwd: tmpDir });

    await writeFile(join(tmpDir, "reviewed.txt"), "changed after publication\n");
    await execFileAsync("git", ["add", "reviewed.txt"], { cwd: tmpDir });
    await execFileAsync("git", ["commit", "--no-verify", "-m", "change candidate subject"], { cwd: tmpDir });

    const seeded = await runArc(
      ["status", "--session-init", "--write-compaction-seed", "--json"],
      tmpDir,
    );
    expect(seeded.exitCode, seeded.stdout + seeded.stderr).toBe(0);
    const session = parseJsonEnvelope(seeded.stdout);
    expect(session.active).toMatchObject({
      ok: true,
      value: {
        resolution: "single",
        sessionType: "integration",
        currentWorkflow: "verify-work-unit",
        integrationBoundary: {
          candidateId: candidateBoundary.candidateId,
          candidateSubjectDigest: candidateBoundary.candidateSubjectDigest,
          locus: "publication-pending",
        },
      },
    });
    expect(session.compactionSeedWrite).toMatchObject({ status: "written" });

    const result = await runArc(["status", "--recover", "--json"], tmpDir);
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);

    const envelope = parseJsonEnvelope(result.stdout);
    expect(envelope.recoveryFrame).toMatchObject({
      ok: true,
      value: { kind: "resolved", workflow: "verify-work-unit", sessionType: "integration" },
    });
    expect(envelope.taskCursor).toEqual({ ok: true, value: { status: "no-open-task" } });
    expect(envelope.loadSet?.value?.entries).toContainEqual({
      path: ".arc/system/workflows/arc/work-unit-lifecycle/verify-work-unit.md",
      readMode: { kind: "full" },
    });
    expect(envelope.loadSet?.value?.entries.map((entry) => entry.path))
      .not.toContain(".arc/active/tasks-foo.md");

    const audited = await runArc(["recover", "audit", "--json"], tmpDir);
    expect(audited.exitCode, audited.stdout + audited.stderr).toBe(0);
    expect(parseRecoverAuditReport(audited.stdout).verdict).toMatchObject({
      status: "ready",
      ready: true,
      stopReasons: [],
      taskCursor: null,
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
      makeMetaFixture("Foo", {
        owner: "test-user",
        branch: "feat/foo",
        taskList: "tasks-foo.md",
        nextTask: "stale meta pointer ignored by recovery",
        nextAction: "Start Task 1.1",
      }),
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
        actual: expect.objectContaining({ status: "found" }),
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

  it("keeps sessionType=execution when Active narration begins with integrate-work-unit", async () => {
    await writeStatusFixture(tmpDir, "technical", "foo", {
      taskList: "`.arc/active/tasks-foo.md`",
      nextAction: "integrate-work-unit Step 7 — push and create PR",
    });

    const result = await runArc(["status", "--session-init", "--json"], tmpDir);
    expect(result.exitCode).toBe(0);

    const envelope = parseJsonEnvelope(result.stdout);
    expect(envelope.active.ok).toBe(true);
    expect(envelope.active.value?.resolution).toBe("single");
    expect(envelope.active.value?.sessionType).toBe("execution");
  });

  it("carries the typed Candidate resume locus through session initialization", async () => {
    await writeStatusFixture(tmpDir, "technical", "foo", {
      taskList: "`.arc/active/tasks-foo.md`",
      nextAction: "archive-work-unit Step 1",
    });
    await writeFile(
      join(tmpDir, ".arc", "active", "tasks-foo.md"),
      taskListFixture("Complete verification").replace("`[ ]`", "`[x]`"),
    );
    await git(tmpDir, ["add", "-A"]);
    const attested = await runArc(["attest", "foo", "--json"], tmpDir);
    expect(attested.exitCode, attested.stdout + attested.stderr).toBe(0);
    const candidateId = (JSON.parse(attested.stdout) as { locus: { candidateId: string } }).locus.candidateId;

    const result = await runArc(["status", "--session-init", "--json"], tmpDir);
    expect(result.exitCode).toBe(0);
    const envelope = parseJsonEnvelope(result.stdout);
    expect(envelope.active.value?.sessionType).toBe("prepublication");
    expect(envelope.active.value?.currentWorkflow).toBe("prepare-work-unit");
    expect(envelope.active.value?.integrationBoundary).toMatchObject({
      candidateId,
      locus: "candidate-review-pending",
      nextAction: {
        kind: "run-self-review",
        command: "arc review pre-publication foo",
      },
    });
  });

  it("writes a compaction seed for a large Candidate within the hook deadline using batched reads", async () => {
    const trace = await createGitTraceHarness();
    try {
      await writeStatusFixture(tmpDir, "technical", "large-candidate", {
        taskList: "`.arc/active/tasks-large-candidate.md`",
        nextAction: "archive-work-unit Step 1",
      });
      await writeFile(
        join(tmpDir, ".arc", "active", "tasks-large-candidate.md"),
        singletonTaskListFixture("Complete verification").replace("`[ ]`", "`[x]`"),
      );
      const fixtureDir = join(tmpDir, "large-candidate");
      await mkdir(fixtureDir, { recursive: true });
      await Promise.all(Array.from({ length: 400 }, async (_unused, index) => {
        const name = `${String(index).padStart(4, "0")}.txt`;
        await writeFile(join(fixtureDir, name), `candidate entry ${String(index)}\n`);
      }));
      await git(tmpDir, ["add", "-A"]);
      const attested = await runArc(["attest", "large-candidate", "--json"], tmpDir, { timeout: 29_000 });
      expect(attested.exitCode, attested.stdout + attested.stderr).toBe(0);
      const candidateBoundaryPath = join(
        tmpDir,
        ".arc",
        "system",
        ".internal",
        "candidates",
        "large-candidate.boundary.json",
      );
      const candidateBoundary = JSON.parse(await readFile(candidateBoundaryPath, "utf8")) as {
        candidateId: string;
        candidateSubjectDigest: string;
      };
      const metaPath = join(tmpDir, ".arc", "active", "meta-large-candidate.md");
      await writeFile(
        metaPath,
        setMetaCurrentWorkflow(
          setMetaState(await readFile(metaPath, "utf8"), "Integrating"),
          "integrate-work-unit",
        ),
      );
      await writeFile(candidateBoundaryPath, `${JSON.stringify({
        schemaVersion: 1,
        mode: "integration-boundary",
        workUnit: "large-candidate",
        candidateId: candidateBoundary.candidateId,
        candidateSubjectDigest: candidateBoundary.candidateSubjectDigest,
        locus: "publication-pending",
        nextAction: {
          kind: "continue-publication",
          command: "git push -u origin technical/large-candidate",
          interactionText: "Resume publication at the idempotent push, then resolve or open the change request.",
        },
        policy: null,
        reservation: null,
      })}\n`);
      await git(tmpDir, ["add", "-A"]);
      await git(tmpDir, ["commit", "-m", "integrate large candidate fixture"]);

      const result = await runArc(
        ["status", "--session-init", "--write-compaction-seed", "--json"],
        tmpDir,
        { timeout: 29_000, env: trace.env },
      );

      expect(result.timedOut).toBeUndefined();
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      const envelope = parseJsonEnvelope(result.stdout);
      expect(envelope.compactionSeedWrite, JSON.stringify(envelope))
        .toMatchObject({ status: "written" });
      const commands = await readGitTrace(trace);
      const argsFor = (fields: string[]): string[] => fields.slice(1);
      const candidateLookups = commands.filter((fields) => {
        const args = argsFor(fields);
        return args[0] === "--no-lazy-fetch" && (
          args.includes("ls-files") && args.includes("--stage")
          || args.includes("ls-tree") && args.some((arg) => arg.includes("%(objectmode)"))
        );
      });
      const candidateBatchChecks = commands.filter((fields) => {
        const args = argsFor(fields);
        return args[0] === "--no-lazy-fetch"
          && args.includes("cat-file")
          && args.some((arg) => arg.startsWith("--batch-check=%(objectname)"));
      });
      const candidateContentBatches = commands.filter((fields) => {
        const args = argsFor(fields);
        return args[0] === "--no-lazy-fetch"
          && args.includes("cat-file")
          && args.includes("--batch");
      });
      expect(candidateLookups).toHaveLength(2);
      expect(candidateBatchChecks).toHaveLength(2);
      expect(candidateContentBatches).toHaveLength(2);
    } finally {
      await cleanupTempDir(trace.binDir);
    }
  }, 90_000);
});

describe("session-init E2E — request-scoped remote acquisition", () => {
  it("uses one all-heads generation and one local availability batch without code-ref mutation", async () => {
    const repo = await createTempRepo();
    const bareDir = await mkdtemp(join(tmpdir(), "arc-session-init-generation-origin-"));
    const trace = await createGitTraceHarness();
    try {
      const init = await runArc(["init", "--yes", "--name", "test-project"], repo);
      expect(init.exitCode, init.stdout + init.stderr).toBe(0);
      await execFileAsync("git", ["init", "--bare", "--initial-branch=main", bareDir]);
      await git(repo, ["remote", "add", "origin", bareDir]);
      await git(repo, ["add", "-A"]);
      await git(repo, ["commit", "-m", "install ARC"]);
      await git(repo, ["push", "-u", "origin", "main"]);
      const mainOid = await git(repo, ["rev-parse", "HEAD"]);

      await git(repo, ["switch", "-c", "feat/remote-generation"]);
      await writeFile(join(repo, "remote-generation.txt"), "remote generation\n");
      await git(repo, ["add", "remote-generation.txt"]);
      await git(repo, ["commit", "-m", "remote generation"]);
      const topicOid = await git(repo, ["rev-parse", "HEAD"]);
      await git(repo, ["push", "origin", "HEAD:feat/remote-generation"]);
      await git(repo, ["push", "origin", "HEAD:feat/remote-generation-alias"]);
      await git(repo, ["switch", "main"]);
      await writeUserReferenceStatusFixture(repo, "feat", "remote-boundary", { nextAction: "Continue execution" });

      await expect(execFileAsync("git", ["fetch", "origin", "main"], {
        cwd: repo,
        env: { ...process.env, ...trace.env, ARC_GIT_TRACE_REJECT_CODE_WRITES: "1" },
      })).rejects.toMatchObject({ code: 97 });
      await writeFile(trace.logPath, "", "utf8");

      const result = await runArc(["status", "--session-init", "--json"], repo, {
        env: { ...trace.env, ARC_GIT_TRACE_REJECT_CODE_WRITES: "1" },
      });
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      const envelope = parseJsonEnvelope(result.stdout);
      expect(envelope.active.value?.resolution).toBe("single");
      expect(envelope.userReferenceReconcile).toMatchObject({
        ok: true,
        value: { authority: { remoteEvidence: expect.stringMatching(/^(exact|not-applicable)$/u) } },
      });

      const commands = await readGitTrace(trace);
      const argsFor = (fields: string[]): string[] => fields.slice(1);
      const allHeadsReads = commands.filter((fields) =>
        argsFor(fields).join(" ") === "ls-remote --heads origin"
      );
      const availabilityBatches = commands.filter((fields) => {
        const args = argsFor(fields);
        return args.includes("cat-file") && args.includes("--batch-check");
      });
      expect(allHeadsReads).toHaveLength(1);
      expect(availabilityBatches).toHaveLength(1);
      const batchOids = (await readFile(trace.batchInputPath, "utf8")).trim().split("\n").sort();
      expect(batchOids).toEqual([mainOid, topicOid].sort());

      const transientOperations = commands.filter((fields) => {
        const command = argsFor(fields).join(" ");
        return command.includes("refs/arc/user/test-user/errands")
          || command.includes("refs/arc/tmp/transient-discovery/");
      });
      expect(transientOperations.length).toBeGreaterThan(0);
      expect(commands.some((fields) =>
        argsFor(fields).join(" ") === "ls-remote origin refs/notes/arc/user/test-user"
      )).toBe(true);

      const codeRepositoryMutations = commands.filter((fields) => {
        const args = argsFor(fields);
        const command = args.join(" ");
        if (command.includes("refs/arc/user/test-user/errands")
          || command.includes("refs/arc/tmp/transient-discovery/")) return false;
        return args.some((arg) => ["fetch", "prune", "update-ref", "symbolic-ref"].includes(arg));
      });
      expect(codeRepositoryMutations).toEqual([]);
    } finally {
      await Promise.all([
        cleanupTempDir(repo),
        removeGitBackedDir(bareDir),
        cleanupTempDir(trace.binDir),
      ]);
    }
  });

  it("isolates an unreachable all-heads read while preserving local orientation", async () => {
    const repo = await createTempRepo();
    const bareDir = await mkdtemp(join(tmpdir(), "arc-session-init-unreachable-origin-"));
    const trace = await createGitTraceHarness();
    try {
      const init = await runArc(["init", "--yes", "--name", "test-project"], repo);
      expect(init.exitCode, init.stdout + init.stderr).toBe(0);
      await execFileAsync("git", ["init", "--bare", "--initial-branch=main", bareDir]);
      await git(repo, ["remote", "add", "origin", bareDir]);
      await git(repo, ["add", "-A"]);
      await git(repo, ["commit", "-m", "install ARC"]);
      await git(repo, ["push", "-u", "origin", "main"]);

      const result = await runArc(["status", "--session-init", "--json"], repo, {
        env: { ...trace.env, ARC_GIT_TRACE_FAIL: "remote" },
      });
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      const envelope = parseJsonEnvelope(result.stdout);
      expect(envelope.active).toMatchObject({ ok: true, value: { resolution: "none" } });
      expect(envelope.derivedLocusState).toMatchObject({ ok: true });
      expect(envelope).toMatchObject({
        worktree: {
          ok: true,
          value: { state: "remote-unavailable", remoteEvidence: "unreachable", failureReason: "network" },
        },
        baseDistance: {
          ok: true,
          value: { remoteEvidence: "unreachable", failureReason: "network" },
        },
        baseBranchSync: {
          ok: true,
          value: { remoteEvidence: "unreachable", failureReason: "network" },
        },
        materializableWorkUnits: {
          ok: true,
          value: { remoteEvidence: "unreachable", failureReason: "network" },
        },
      });
      const commands = await readGitTrace(trace);
      expect(commands.filter((fields) =>
        fields.slice(1).join(" ") === "ls-remote --heads origin"
      )).toHaveLength(1);
    } finally {
      await Promise.all([
        cleanupTempDir(repo),
        removeGitBackedDir(bareDir),
        cleanupTempDir(trace.binDir),
      ]);
    }
  });

  it("isolates a failed local availability prerequisite while preserving snapshot-only absence", async () => {
    const repo = await createTempRepo();
    const bareDir = await mkdtemp(join(tmpdir(), "arc-session-init-local-probe-origin-"));
    const trace = await createGitTraceHarness();
    try {
      const init = await runArc(["init", "--yes", "--name", "test-project"], repo);
      expect(init.exitCode, init.stdout + init.stderr).toBe(0);
      await execFileAsync("git", ["init", "--bare", "--initial-branch=main", bareDir]);
      await git(repo, ["remote", "add", "origin", bareDir]);
      await git(repo, ["add", "-A"]);
      await git(repo, ["commit", "-m", "install ARC"]);
      await git(repo, ["push", "-u", "origin", "main"]);

      const result = await runArc(["status", "--session-init", "--json"], repo, {
        env: { ...trace.env, ARC_GIT_TRACE_FAIL: "batch" },
      });
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      const envelope = parseJsonEnvelope(result.stdout);
      expect(envelope.active).toMatchObject({ ok: true, value: { resolution: "none" } });
      expect(envelope.derivedLocusState).toMatchObject({ ok: true });
      for (const slot of ["worktree", "baseDistance", "baseBranchSync"] as const) {
        expect(envelope[slot]).toMatchObject({ ok: false, error: { kind: "runtime" } });
      }
      expect(envelope.materializableWorkUnits).toEqual({
        ok: true,
        value: {
          candidates: [],
          remoteEvidence: "exact",
          pendingBranchCount: 0,
          refreshRemedy: null,
          warnings: [],
        },
      });
      const commands = await readGitTrace(trace);
      expect(commands.filter((fields) => {
        const args = fields.slice(1);
        return args.includes("cat-file") && args.includes("--batch-check");
      })).toHaveLength(1);
    } finally {
      await Promise.all([
        cleanupTempDir(repo),
        removeGitBackedDir(bareDir),
        cleanupTempDir(trace.binDir),
      ]);
    }
  });

  it("keeps snapshot-only absence exact while shallow graph slots fail locally", async () => {
    const repo = await createTempRepo();
    const bareDir = await mkdtemp(join(tmpdir(), "arc-session-init-shallow-origin-"));
    const trace = await createGitTraceHarness();
    try {
      const init = await runArc(["init", "--yes", "--name", "test-project"], repo);
      expect(init.exitCode, init.stdout + init.stderr).toBe(0);
      await execFileAsync("git", ["init", "--bare", "--initial-branch=main", bareDir]);
      await git(repo, ["remote", "add", "origin", bareDir]);
      await git(repo, ["add", "-A"]);
      await git(repo, ["commit", "-m", "install ARC"]);
      await git(repo, ["push", "-u", "origin", "main"]);

      await git(repo, ["switch", "-c", "publisher"]);
      await writeFile(join(repo, "remote-main.txt"), "remote main\n");
      await git(repo, ["add", "remote-main.txt"]);
      await git(repo, ["commit", "-m", "advance remote main"]);
      await git(repo, ["push", "origin", "HEAD:main"]);
      await git(repo, ["switch", "main"]);
      await git(repo, ["branch", "-D", "publisher"]);

      const result = await runArc(["status", "--session-init", "--json"], repo, {
        env: { ...trace.env, ARC_GIT_TRACE_HISTORY: "shallow" },
      });
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      const envelope = parseJsonEnvelope(result.stdout);
      for (const slot of ["worktree", "baseDistance", "baseBranchSync"] as const) {
        expect(envelope[slot]).toMatchObject({ ok: false, error: { kind: "runtime" } });
      }
      expect(envelope.materializableWorkUnits).toMatchObject({
        ok: true,
        value: { candidates: [], remoteEvidence: "exact", pendingBranchCount: 0 },
      });
      expect(envelope.active).toMatchObject({ ok: true, value: { resolution: "none" } });
    } finally {
      await Promise.all([
        cleanupTempDir(repo),
        removeGitBackedDir(bareDir),
        cleanupTempDir(trace.binDir),
      ]);
    }
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
    expect(canonicalResult.exitCode, canonicalResult.stdout + canonicalResult.stderr).toBe(0);
    expect(ordinaryResult.exitCode, ordinaryResult.stdout + ordinaryResult.stderr).toBe(0);

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
    expect(parseJsonEnvelope(untrustedResult.stdout).currentHusk).toEqual({
      ok: true,
      value: {
        worktreePath: await realpath(canonical),
        subject: { kind: "work-unit", name: "shipped-widget" },
        branch: "feat/shipped-widget",
        stamp: { kind: "manual-only", reason: "unknown-evidence" },
      },
    });
  });

  it("projects an omitted descendant blob from the local-only status reader as a slot error", async () => {
    const bareDir = await mkdtemp(join(tmpdir(), "arc-session-init-byte-reader-origin-"));
    const trace = await createGitTraceHarness();
    try {
      await execFileAsync("git", ["init", "--bare", "--initial-branch=main", bareDir]);
      await git(repo, ["remote", "add", "origin", bareDir]);
      const canonical = join(worktreeParent, "missing-blob");
      await git(repo, ["branch", "feat/shipped-widget"]);
      await git(repo, ["worktree", "add", canonical, "feat/shipped-widget"]);
      await git(canonical, ["switch", "--detach"]);
      const head = await git(canonical, ["rev-parse", "HEAD"]);

      const completedDir = join(repo, ".arc", "completed", "2026-q3", "shipped-widget");
      const completedPath = ".arc/completed/2026-q3/shipped-widget/meta-shipped-widget.md";
      await mkdir(completedDir, { recursive: true });
      await writeFile(join(repo, completedPath), "# Metadata: shipped-widget\n");
      await git(repo, ["add", completedPath]);
      await git(repo, ["commit", "-m", "record shipped widget"]);
      await git(repo, ["push", "-u", "origin", "main"]);
      const baseOid = await git(repo, ["rev-parse", "HEAD"]);
      const blobOid = await git(repo, ["rev-parse", `${baseOid}:${completedPath}`]);
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
          authorization: "merged-preserved",
          remoteRef: null,
          evidence: {
            kind: "shipped",
            expectedLifecycle: "completed",
            resultDigest: `sha256:${"1".repeat(64)}`,
            baseProofOid: baseOid,
          },
        },
      }));
      await unlink(join(repo, ".git", "objects", blobOid.slice(0, 2), blobOid.slice(2)));

      const result = await runArc(["status", "--session-init", "--json"], canonical, { env: trace.env });
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      const envelope = parseJsonEnvelope(result.stdout);
      expect(envelope.currentHusk).toMatchObject({ ok: false, error: { kind: "runtime" } });
      const commands = await readGitTrace(trace);
      expect(commands.some((fields) => {
        const args = fields.slice(1);
        return args[0] === "--no-lazy-fetch" && args.includes("ls-tree") && args.includes(baseOid);
      })).toBe(true);
    } finally {
      await Promise.all([
        removeGitBackedDir(bareDir),
        cleanupTempDir(trace.binDir),
      ]);
    }
  });
});

describe("session-init E2E — deferred rename move advisory", () => {
  let repo: string;
  let worktreeParent: string;

  beforeEach(async () => {
    repo = await createTempRepo();
    worktreeParent = await mkdtemp(join(tmpdir(), "arc-session-init-rename-wt-"));
    const init = await runArc(["init", "--yes", "--name", "test-project"], repo);
    expect(init.exitCode).toBe(0);
    await git(repo, ["add", "-A"]);
    await git(repo, ["commit", "-m", "chore: initialize ARC"]);
  });

  afterEach(async () => {
    await cleanupTempDir(repo);
    await cleanupTempDir(worktreeParent);
  });

  it("emits exact outside-worktree argv only while stamped registration facts match", async () => {
    const from = join(worktreeParent, "project.old-name");
    const to = join(worktreeParent, "project.new-name");
    await git(repo, ["branch", "plan/new-name"]);
    await git(repo, ["worktree", "add", from, "plan/new-name"]);
    const canonicalFrom = await realpath(from);
    const head = await git(from, ["rev-parse", "HEAD"]);
    const markerDir = join(from, ".arc", "system", ".internal");
    await mkdir(markerDir, { recursive: true });
    await writeFile(join(markerDir, "worktree-marker.json"), JSON.stringify({
      spawnedByArc: true,
      wuName: "new-name",
      createdFor: { kind: "work-unit", name: "new-name" },
      spawningIdentity: "test-user",
      createdAt: "2026-07-23T00:00:00.000Z",
      renameMovePending: {
        oldSlug: "old-name",
        newSlug: "new-name",
        branch: "plan/new-name",
        head,
        from: canonicalFrom,
        to,
      },
    }));

    const result = await runArc(["status", "--session-init", "--json"], from);

    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(parseJsonEnvelope(result.stdout).sweep?.value?.renameMoves).toEqual([{
      oldSlug: "old-name",
      newSlug: "new-name",
      branch: "plan/new-name",
      head,
      from: canonicalFrom,
      to,
      remedy: {
        argv: ["git", "worktree", "move", canonicalFrom, to],
        text: `Move the registered worktree from ${JSON.stringify(canonicalFrom)} to ${JSON.stringify(to)}.`,
      },
    }]);
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
    const pendingRun = await runArc(["status", "--session-init", "--json"], repo);
    expect(pendingRun.exitCode).toBe(0);
    expect(parseJsonEnvelope(pendingRun.stdout).baseDistance?.value).toMatchObject({
      mode: "advisory",
      verdict: "unavailable",
      unavailableReason: "base-object-pending-fetch",
      remoteEvidence: "pending-fetch",
      recommendedAction: "skip",
    });
    expect(parseJsonEnvelope(pendingRun.stdout).baseDistance?.value).not.toHaveProperty("movement");

    const materialized = await runArc(["base", "sync", "--json"], repo);
    expect(materialized.exitCode, materialized.stdout + materialized.stderr).toBe(0);
    const run = await runArc(["status", "--session-init", "--json"], repo);
    expect(run.exitCode).toBe(0);
    const value = parseJsonEnvelope(run.stdout).baseDistance?.value;
    expect(value?.verdict, JSON.stringify(value)).toBe("reconcile");
    expect(value).toMatchObject({
      mode: "advisory", movement: "disjoint", recommendedAction: "surface",
    });
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
    const value = parseJsonEnvelope(run.stdout).baseDistance?.value;
    expect(value).toMatchObject({
      mode: "advisory",
      verdict: "skipped",
      recommendedAction: "skip",
      recommendedPromptText: "",
    });
    expect(value).not.toHaveProperty("movement");
  });
});
