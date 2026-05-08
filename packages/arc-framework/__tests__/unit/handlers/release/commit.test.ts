/**
 * Unit tests for the `arc release commit` refusal-path orchestrator.
 *
 * Covers the four runtime refusal codes in their documented short-circuit
 * order (12 → 10 → 13 → 11 per `notes-release-wrappers-foundation.md` § 2.1):
 * each refusal returns the matched exit code, formats the message via the
 * shared `formatRefusal` composer, records the refusal as an audit entry,
 * and never spawns the wrapped `git commit` subprocess.
 *
 * The success path lives in Task 2.2 and is not exercised here — tests pass
 * inputs that always resolve to refusal.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runReleaseCommit } from "../../../../src/handlers/release/commit.js";
import type { ReleaseCommitDeps } from "../../../../src/handlers/release/commit.js";
import type { AuditEntry } from "../../../../src/lib/release/types.js";
import type {
  CommitInterlock,
  PushInterlock,
  ResolvedSettingsResult,
} from "../../../../src/lib/config/resolved-settings.js";
import type { ConfigSettings } from "../../../../src/commands/config/types.js";

// --- Fixture helpers ---

interface Fixture {
  root: string;
}

const IDENTITY = "alice";

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "arc-release-commit-"));
  await mkdir(join(root, ".arc", "active"), { recursive: true });
  return { root };
}

function statusBody(state = "In Progress"): string {
  return [
    "# Status: Sample",
    "",
    "## Work Unit Metadata",
    "",
    `- **State:** ${state}`,
    "- **Branch:** technical/sample",
    "- **Task List:** `tasks-sample.md`",
    "",
  ].join("\n");
}

async function writeStatus(
  root: string,
  category: string,
  name: string,
): Promise<void> {
  const dir = join(root, ".arc", "active", category);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `status-${name}.md`), statusBody());
}

interface SettingsOverrides {
  commitInterlock?: CommitInterlock;
  pushInterlock?: PushInterlock;
  branchProtection?: "partial" | "full";
  branchBase?: string;
}

function buildSettings(overrides: SettingsOverrides = {}): ResolvedSettingsResult {
  const commitInterlock: CommitInterlock = overrides.commitInterlock ?? "on-task-approval";
  const pushInterlock: PushInterlock = overrides.pushInterlock ?? "manual";
  const branchProtection = overrides.branchProtection ?? "partial";
  const branchBase = overrides.branchBase ?? "main";

  const settings: ConfigSettings = {
    "branch.base": branchBase,
    "branch.protection": branchProtection,
    "commit.format": "conventional",
    "commit.context_footer": "required",
    "commit.custom_pattern": "",
    "commit.context_pattern": "",
    "merge.strategy": "merge",
    "review.pre_merge": "enabled",
    "platform.type": "github",
    "pm.mode": "arc-in-git",
    "team.mode": "false",
    "session.remote_sync": "enabled",
    "session.init_pull.worktree": "prompt",
    "session.init_pull.notes": "prompt",
    "session.init_load.notes": "prompt",
    "session.commit_interlock": commitInterlock,
    "session.push_interlock": pushInterlock,
    "session.sync_interlock": "on-handoff",
    "archive.cadence": "with-integration",
    "user.notes_push": "on-sync",
    "release.enabled": "true",
  };

  return {
    settings,
    resolved: {
      commitInterlock: { value: commitInterlock, source: "default" },
      pushInterlock: { value: pushInterlock, source: "default" },
      syncInterlock: { value: "on-handoff", source: "default" },
      notesPush: { value: "on-sync", source: "default" },
      releaseEnabled: { value: "true", source: "default" },
    },
    defaultsApplied: [],
    warnings: [],
  };
}

interface BuildDepsOptions {
  argv?: readonly string[];
  settings?: ResolvedSettingsResult;
  currentBranch?: string;
  spawnGit?: ReleaseCommitDeps["spawnGit"];
}

function buildDeps(root: string, opts: BuildDepsOptions = {}): {
  deps: ReleaseCommitDeps;
  stderr: string[];
  spawnGit: ReturnType<typeof vi.fn>;
} {
  const stderr: string[] = [];
  const spawnGit = vi.fn(opts.spawnGit ?? (() => {
    throw new Error("spawnGit must not be called on a refusal path");
  }));
  const deps: ReleaseCommitDeps = {
    cwd: root,
    identity: IDENTITY,
    argv: opts.argv ?? [],
    settings: opts.settings ?? buildSettings(),
    currentBranch: opts.currentBranch ?? "feature/x",
    writeStderr: (msg) => { stderr.push(msg); },
    spawnGit,
  };
  return { deps, stderr, spawnGit };
}

async function readAuditEntries(root: string): Promise<AuditEntry[]> {
  const path = join(root, ".arc", "user", IDENTITY, ".internal", ".audit-log.jsonl");
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch {
    return [];
  }
  return raw
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as AuditEntry);
}

// --- Code 12: destructive flag (cheapest — argv only, no I/O) ---

describe("runReleaseCommit — code 12 (destructive-flag)", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it.each([
    ["--amend"],
    ["--allow-empty"],
    ["--no-verify"],
  ])("refuses with code 12 and audit entry carrying flag detail (%s)", async (flag) => {
    await writeStatus(fixture.root, "technical", "sample");
    const { deps, spawnGit } = buildDeps(fixture.root, { argv: [flag, "-m", "subject"] });

    const result = await runReleaseCommit(deps);

    expect(result.exitCode).toBe(12);
    expect(spawnGit).not.toHaveBeenCalled();

    const entries = await readAuditEntries(fixture.root);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      schemaVersion: 1,
      command: "release-commit",
      decision: "refused",
      refusalCode: 12,
      outcome: { kind: "refused" },
    });
  });

  it("emits a three-line refusal message that names the flag", async () => {
    await writeStatus(fixture.root, "technical", "sample");
    const { deps, stderr } = buildDeps(fixture.root, { argv: ["--amend"] });

    await runReleaseCommit(deps);

    const composed = stderr.join("");
    expect(composed).toContain("Refused: destructive-flag (code 12)");
    expect(composed).toContain("--amend");
  });

  it("does not require an active WU for the code 12 decision", async () => {
    // No status file written — code 12 fires before code 10.
    const { deps } = buildDeps(fixture.root, { argv: ["--no-verify"] });

    const result = await runReleaseCommit(deps);

    expect(result.exitCode).toBe(12);
  });

  it("redacts -m payload in the audit args field", async () => {
    await writeStatus(fixture.root, "technical", "sample");
    const { deps } = buildDeps(fixture.root, { argv: ["--amend", "-m", "secret"] });

    await runReleaseCommit(deps);

    const [entry] = await readAuditEntries(fixture.root);
    expect(entry?.args).toEqual(["--amend", "-m", "<redacted>"]);
  });
});

// --- Code 10: no-active-wu (fs probe) ---

describe("runReleaseCommit — code 10 (no-active-wu)", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it("refuses with code 10 when .arc/active/ has no candidates", async () => {
    const { deps, spawnGit } = buildDeps(fixture.root, { argv: ["-m", "subject"] });

    const result = await runReleaseCommit(deps);

    expect(result.exitCode).toBe(10);
    expect(spawnGit).not.toHaveBeenCalled();

    const entries = await readAuditEntries(fixture.root);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      command: "release-commit",
      decision: "refused",
      refusalCode: 10,
      wu: null,
    });
  });

  it("refuses with code 10 + disambiguation hint on multi-candidate", async () => {
    await writeStatus(fixture.root, "technical", "alpha");
    await writeStatus(fixture.root, "feature", "beta");
    const { deps, stderr } = buildDeps(fixture.root, { argv: ["-m", "subject"] });

    const result = await runReleaseCommit(deps);

    expect(result.exitCode).toBe(10);
    const composed = stderr.join("");
    expect(composed).toContain("Refused: no-active-wu (code 10)");
    expect(composed).toMatch(/multiple/i);

    const [entry] = await readAuditEntries(fixture.root);
    expect(entry?.wu).toBeNull();
    expect(entry?.refusalCode).toBe(10);
  });

  it("never spawns git commit on either no-active-wu path", async () => {
    const { deps, spawnGit } = buildDeps(fixture.root, { argv: ["-m", "subject"] });
    await runReleaseCommit(deps);
    expect(spawnGit).not.toHaveBeenCalled();
  });
});

// --- Code 13: branch-protection-violation ---

describe("runReleaseCommit — code 13 (branch-protection-violation)", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it("refuses with code 13 when branch.protection: full and currentBranch === branch.base", async () => {
    await writeStatus(fixture.root, "technical", "sample");
    const settings = buildSettings({
      branchProtection: "full",
      branchBase: "main",
      commitInterlock: "on-workflow",
    });
    const { deps, spawnGit, stderr } = buildDeps(fixture.root, {
      argv: ["-m", "subject"],
      settings,
      currentBranch: "main",
    });

    const result = await runReleaseCommit(deps);

    expect(result.exitCode).toBe(13);
    expect(spawnGit).not.toHaveBeenCalled();

    const composed = stderr.join("");
    expect(composed).toContain("Refused: branch-protection-violation (code 13)");
    expect(composed).toContain("main");

    const [entry] = await readAuditEntries(fixture.root);
    expect(entry).toMatchObject({
      command: "release-commit",
      decision: "refused",
      refusalCode: 13,
      wu: { category: "technical", name: "sample" },
    });
  });

  it("does not refuse under branch.protection: partial regardless of branch", async () => {
    await writeStatus(fixture.root, "technical", "sample");
    const settings = buildSettings({
      branchProtection: "partial",
      branchBase: "main",
      commitInterlock: "manual", // would refuse with 11; partial does not bypass that
    });
    const { deps } = buildDeps(fixture.root, {
      settings,
      currentBranch: "main",
    });

    const result = await runReleaseCommit(deps);

    // Branch-protection does not fire under partial; the next gate (interlock)
    // makes the decision. Interlock=manual → code 11.
    expect(result.exitCode).toBe(11);
  });

  it("does not refuse with full when currentBranch !== branch.base", async () => {
    await writeStatus(fixture.root, "technical", "sample");
    // Branch-protection passes (branch != base); fall through to interlock,
    // which refuses with 11 (interlock=manual). The cascade reaching 11
    // confirms 13 did not fire.
    const settings = buildSettings({
      branchProtection: "full",
      branchBase: "main",
      commitInterlock: "manual",
    });
    const { deps } = buildDeps(fixture.root, {
      settings,
      currentBranch: "feature/x",
    });

    const result = await runReleaseCommit(deps);

    expect(result.exitCode).toBe(11);
  });
});

// --- Code 11: interlock-not-authorized ---

describe("runReleaseCommit — code 11 (interlock-not-authorized)", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it("refuses with code 11 when commit_interlock=manual", async () => {
    await writeStatus(fixture.root, "technical", "sample");
    const settings = buildSettings({ commitInterlock: "manual" });
    const { deps, spawnGit, stderr } = buildDeps(fixture.root, {
      argv: ["-m", "subject"],
      settings,
    });

    const result = await runReleaseCommit(deps);

    expect(result.exitCode).toBe(11);
    expect(spawnGit).not.toHaveBeenCalled();

    const composed = stderr.join("");
    expect(composed).toContain("Refused: interlock-not-authorized (code 11)");
    expect(composed).toContain("session.commit_interlock");
    expect(composed).toContain("manual");

    const [entry] = await readAuditEntries(fixture.root);
    expect(entry).toMatchObject({
      command: "release-commit",
      decision: "refused",
      refusalCode: 11,
      interlockState: {
        command: "release-commit",
        commitInterlock: { value: "manual", source: "default" },
      },
    });
  });
});

// --- Cascade short-circuit order (§ 2.1: 12 → 10 → 13 → 11) ---

describe("runReleaseCommit — short-circuit order", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it("12 fires before 10 (destructive flag wins over no-active-wu)", async () => {
    // No active WU AND destructive flag — 12 wins.
    const { deps } = buildDeps(fixture.root, { argv: ["--amend"] });
    const result = await runReleaseCommit(deps);
    expect(result.exitCode).toBe(12);
  });

  it("10 fires before 13 (no-active-wu wins over branch-protection)", async () => {
    // No active WU AND on protected branch — 10 wins.
    const settings = buildSettings({
      branchProtection: "full",
      branchBase: "main",
      commitInterlock: "on-workflow",
    });
    const { deps } = buildDeps(fixture.root, {
      argv: ["-m", "subject"],
      settings,
      currentBranch: "main",
    });
    const result = await runReleaseCommit(deps);
    expect(result.exitCode).toBe(10);
  });

  it("13 fires before 11 (branch-protection wins over interlock)", async () => {
    await writeStatus(fixture.root, "technical", "sample");
    const settings = buildSettings({
      branchProtection: "full",
      branchBase: "main",
      commitInterlock: "manual",
    });
    const { deps } = buildDeps(fixture.root, {
      argv: ["-m", "subject"],
      settings,
      currentBranch: "main",
    });
    const result = await runReleaseCommit(deps);
    expect(result.exitCode).toBe(13);
  });
});
