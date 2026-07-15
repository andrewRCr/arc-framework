/**
 * Unit tests for the `arc release commit` refusal-path orchestrator.
 *
 * Covers the four runtime refusal codes in their documented short-circuit
 * order (12 → 10 → 13 → 11): each refusal returns the matched exit code,
 * formats the message via the shared `formatRefusal` composer, records
 * the refusal as an audit entry, and never spawns the wrapped
 * `git commit` subprocess.
 *
 * The authorize/success path is exercised by sibling tests; this file
 * passes inputs that always resolve to refusal.
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

function statusBody(state = "Active"): string {
  return [
    "# Metadata: Sample",
    "",
    `- **State:** ${state}`,
    "- **Branch:** technical/sample",
    "- **Task List:** `tasks-sample.md`",
    "",
  ].join("\n");
}

async function writeStatus(
  root: string,
  name: string,
): Promise<void> {
  await writeFile(
    join(root, ".arc", "active", `meta-${name}.md`),
    statusBody(),
  );
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
    "inbox.remind_after_days": "1",
    "integration.stale_after_days": "2",
    "branch.base": branchBase,
    "branch.protection": branchProtection,
    "worktree.location_template": "../{repo}.{name}",
    "worktree.post_create": "",
    "worktree.harness_dirs": ".claude,.codex,.gemini,.opencode",
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
    "session.init_pull.base": "prompt",
    "session.init_load.notes": "prompt",
    "sync.auto_pull": "false",
    "archive.cadence": "with-integration",
    "user.notes_push": "on-sync",
  };

  return {
    settings,
    resolved: {
      commitInterlock: { value: commitInterlock, source: "default" },
      pushInterlock: { value: pushInterlock, source: "default" },
      syncInterlock: { value: "on-handoff", source: "default" },
      notesPush: { value: "on-sync", source: "default" },
      releaseOptedIn: { value: "true", source: "default" },
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
  resolveHead?: ReleaseCommitDeps["resolveHead"];
  preflightCommitMessage?: ReleaseCommitDeps["preflightCommitMessage"];
  createMessageSnapshot?: ReleaseCommitDeps["createMessageSnapshot"];
  persistMessageRetry?: ReleaseCommitDeps["persistMessageRetry"];
  cleanupConsumedMessageRetry?: ReleaseCommitDeps["cleanupConsumedMessageRetry"];
}

function buildDeps(root: string, opts: BuildDepsOptions = {}): {
  deps: ReleaseCommitDeps;
  stderr: string[];
  spawnGit: ReturnType<typeof vi.fn>;
  resolveHead: ReturnType<typeof vi.fn>;
  preflightCommitMessage: ReturnType<typeof vi.fn>;
} {
  const stderr: string[] = [];
  const spawnGit = vi.fn(opts.spawnGit ?? (() => {
    throw new Error("spawnGit must not be called on a refusal path");
  }));
  const resolveHead = vi.fn(opts.resolveHead ?? (() => {
    throw new Error("resolveHead must not be called without an authorized success");
  }));
  const preflightCommitMessage = vi.fn(
    opts.preflightCommitMessage ?? (() => Promise.resolve({ kind: "pass-through" as const })),
  );
  const deps: ReleaseCommitDeps = {
    cwd: root,
    identity: IDENTITY,
    argv: opts.argv ?? [],
    settings: opts.settings ?? buildSettings(),
    currentBranch: opts.currentBranch ?? "feature/x",
    writeStderr: (msg) => { stderr.push(msg); },
    spawnGit,
    resolveHead,
    preflightCommitMessage,
    createMessageSnapshot: opts.createMessageSnapshot ?? (() => {
      throw new Error("createMessageSnapshot must not be called without a captured file source");
    }),
    persistMessageRetry: opts.persistMessageRetry ?? (() => {
      throw new Error("persistMessageRetry must not be called without a qualifying Git failure");
    }),
    cleanupConsumedMessageRetry: opts.cleanupConsumedMessageRetry ?? (async () => false),
    preflightRemedy: "arc release commit -F <message-file>",
  };
  return { deps, stderr, spawnGit, resolveHead, preflightCommitMessage };
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
    ["-n"],
  ])("refuses with code 12 and audit entry carrying flag detail (%s)", async (flag) => {
    await writeStatus(fixture.root, "sample");
    const { deps, spawnGit, preflightCommitMessage } = buildDeps(fixture.root, {
      argv: [flag, "-m", "subject"],
    });

    const result = await runReleaseCommit(deps);

    expect(result.exitCode).toBe(12);
    expect(spawnGit).not.toHaveBeenCalled();
    expect(preflightCommitMessage).not.toHaveBeenCalled();

    const entries = await readAuditEntries(fixture.root);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      schemaVersion: 2,
      command: "release-commit",
      decision: "refused",
      refusalCode: 12,
      outcome: { kind: "refused" },
    });
  });

  it("emits a three-line refusal message that names the flag", async () => {
    await writeStatus(fixture.root, "sample");
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
    await writeStatus(fixture.root, "sample");
    const { deps } = buildDeps(fixture.root, { argv: ["--amend", "-qamsecret"] });

    await runReleaseCommit(deps);

    const [entry] = await readAuditEntries(fixture.root);
    expect(entry?.args).toEqual(["--amend", "-qam<redacted>"]);
  });
});

// --- Code 10: ambiguous-active-wu (fs probe) ---

describe("runReleaseCommit — code 10 (ambiguous-active-wu)", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it("refuses with code 10 + disambiguation hint on multi-candidate, never spawning git", async () => {
    await writeStatus(fixture.root, "alpha");
    await writeStatus(fixture.root, "beta");
    const { deps, stderr, spawnGit } = buildDeps(fixture.root, { argv: ["-m", "subject"] });

    const result = await runReleaseCommit(deps);

    expect(result.exitCode).toBe(10);
    expect(spawnGit).not.toHaveBeenCalled();
    const composed = stderr.join("");
    expect(composed).toContain("Refused: ambiguous-active-wu (code 10)");
    expect(composed).toMatch(/multiple/i);

    const [entry] = await readAuditEntries(fixture.root);
    expect(entry?.wu).toBeNull();
    expect(entry?.refusalCode).toBe(10);
  });
});

// --- Code 13: branch-protection-violation ---

describe("runReleaseCommit — code 13 (branch-protection-violation)", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it("refuses with code 13 when branch.protection: full and currentBranch === branch.base", async () => {
    await writeStatus(fixture.root, "sample");
    const settings = buildSettings({
      branchProtection: "full",
      branchBase: "main",
      commitInterlock: "on-workflow",
    });
    const { deps, spawnGit, stderr, preflightCommitMessage } = buildDeps(fixture.root, {
      argv: ["-m", "subject"],
      settings,
      currentBranch: "main",
    });

    const result = await runReleaseCommit(deps);

    expect(result.exitCode).toBe(13);
    expect(spawnGit).not.toHaveBeenCalled();
    expect(preflightCommitMessage).not.toHaveBeenCalled();

    const composed = stderr.join("");
    expect(composed).toContain("Refused: branch-protection-violation (code 13)");
    expect(composed).toContain("main");

    const [entry] = await readAuditEntries(fixture.root);
    expect(entry).toMatchObject({
      command: "release-commit",
      decision: "refused",
      refusalCode: 13,
      wu: { name: "sample" },
    });
  });

  it("does not refuse under branch.protection: partial regardless of branch", async () => {
    await writeStatus(fixture.root, "sample");
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
    await writeStatus(fixture.root, "sample");
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
    await writeStatus(fixture.root, "sample");
    const settings = buildSettings({ commitInterlock: "manual" });
    const { deps, spawnGit, stderr, preflightCommitMessage } = buildDeps(fixture.root, {
      argv: ["-m", "subject"],
      settings,
    });

    const result = await runReleaseCommit(deps);

    expect(result.exitCode).toBe(11);
    expect(spawnGit).not.toHaveBeenCalled();
    expect(preflightCommitMessage).not.toHaveBeenCalled();

    const composed = stderr.join("");
    expect(composed).toContain("Refused: interlock-not-authorized (code 11)");
    expect(composed).toContain("arc.commitInterlock");
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

// --- Cascade short-circuit order (12 → 10 → 13 → 11) ---

describe("runReleaseCommit — short-circuit order", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it("12 fires before WU resolution (destructive flag wins)", async () => {
    // No active WU AND destructive flag — 12 fires at the argv step, ahead of
    // the fs probe.
    const { deps } = buildDeps(fixture.root, { argv: ["--amend"] });
    const result = await runReleaseCommit(deps);
    expect(result.exitCode).toBe(12);
  });

  it("zero-candidate on the protected base refuses 13 (accept reachable only off-base)", async () => {
    // No active WU AND on the protected base — the accept clears gate 10 but
    // branch-protection (13) still refuses, so acceptance is off-base only.
    const settings = buildSettings({
      branchProtection: "full",
      branchBase: "main",
      commitInterlock: "on-workflow",
    });
    const { deps, spawnGit } = buildDeps(fixture.root, {
      argv: ["-m", "subject"],
      settings,
      currentBranch: "main",
    });
    const result = await runReleaseCommit(deps);
    expect(result.exitCode).toBe(13);
    expect(spawnGit).not.toHaveBeenCalled();
  });

  it("13 fires before 11 (branch-protection wins over interlock)", async () => {
    await writeStatus(fixture.root, "sample");
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

// --- Success path: git invocation + audit entry ---

describe("runReleaseCommit — success path", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  const FULL_HASH = "1a2b3c4d5e6f7890abcdef1234567890abcdef12";

  function authorizingSettings(): ResolvedSettingsResult {
    return buildSettings({ commitInterlock: "on-task-approval" });
  }

  it.each(["validation", "input"] as const)(
    "refuses %s preflight before spawning Git",
    async (reason) => {
      await writeStatus(fixture.root, "sample");
      const { deps, spawnGit, stderr } = buildDeps(fixture.root, {
        argv: ["-qamsecret"],
        settings: authorizingSettings(),
        preflightCommitMessage: () => Promise.resolve({
          kind: "refused",
          reason,
          message: `preflight ${reason}`,
        }),
      });

      const result = await runReleaseCommit(deps);

      expect(result.exitCode).toBe(16);
      expect(spawnGit).not.toHaveBeenCalled();
      expect(stderr.join("")).toBe([
        `preflight ${reason}`,
        "Refused: commit-message-preflight-failed (code 16)",
        `Commit-message preflight failed (${reason}).`,
        "Correct the commit-message input and retry.",
        "arc release commit -F <message-file>",
        "",
      ].join("\n"));
      const [entry] = await readAuditEntries(fixture.root);
      expect(entry).toMatchObject({
        args: ["-qam<redacted>"],
        decision: "refused",
        refusalCode: 16,
        outcome: { kind: "preflight-failed", reason },
      });
    },
  );

  it.each(["pass", "pass-with-warnings"] as const)(
    "spawns Git once after preflight %s",
    async (verdict) => {
      await writeStatus(fixture.root, "sample");
      const { deps, spawnGit } = buildDeps(fixture.root, {
        argv: ["-m", "subject"],
        settings: authorizingSettings(),
        preflightCommitMessage: () => Promise.resolve({
          kind: "passed",
          verdict,
          messageBytes: new Uint8Array(),
        }),
        spawnGit: () => Promise.resolve({ exitCode: 0, stdout: "", stderr: "" }),
        resolveHead: () => Promise.resolve(FULL_HASH),
      });

      expect((await runReleaseCommit(deps)).exitCode).toBe(0);
      expect(spawnGit).toHaveBeenCalledTimes(1);
    },
  );

  it("rewrites a captured file source to a private snapshot and cleans it", async () => {
    await writeStatus(fixture.root, "sample");
    const rawBytes = Buffer.from("message source");
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const { deps, spawnGit } = buildDeps(fixture.root, {
      argv: ["-aF", "caller.txt"],
      settings: authorizingSettings(),
      preflightCommitMessage: () => Promise.resolve({
        kind: "passed",
        verdict: "pass",
        messageBytes: rawBytes,
        transport: { kind: "file", rawBytes, sourcePath: "caller.txt" },
      }),
      createMessageSnapshot: async ({ bytes }) => {
        expect(bytes).toEqual(rawBytes);
        return { path: "/repo/.git/private-message", cleanup };
      },
      spawnGit: () => Promise.resolve({ exitCode: 0, stdout: "", stderr: "" }),
      resolveHead: () => Promise.resolve(FULL_HASH),
    });

    expect((await runReleaseCommit(deps)).exitCode).toBe(0);
    expect(spawnGit).toHaveBeenCalledWith({
      args: ["-aF", "/repo/.git/private-message"],
      cwd: fixture.root,
    });
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("pipes captured stdin bytes while ordinary preflight keeps inherited stdin", async () => {
    await writeStatus(fixture.root, "sample");
    const rawBytes = Buffer.from("stdin message");
    const { deps, spawnGit } = buildDeps(fixture.root, {
      argv: ["-F", "-"],
      settings: authorizingSettings(),
      preflightCommitMessage: () => Promise.resolve({
        kind: "passed",
        verdict: "pass",
        messageBytes: rawBytes,
        transport: { kind: "stdin", rawBytes },
      }),
      spawnGit: () => Promise.resolve({ exitCode: 1, stdout: "", stderr: "hook failed" }),
    });

    expect((await runReleaseCommit(deps)).exitCode).toBe(1);
    expect(spawnGit).toHaveBeenCalledWith({ args: ["-F", "-"], cwd: fixture.root, stdin: rawBytes });
  });

  it("persists approved message bytes after a resolved non-zero Git result", async () => {
    await writeStatus(fixture.root, "sample");
    const messageBytes = Buffer.from("feat(release): a sufficiently long valid subject\n");
    const persistMessageRetry = vi.fn().mockResolvedValue({ path: "/repo with spaces/.git/latest-retry" });
    const { deps, stderr } = buildDeps(fixture.root, {
      argv: ["-m", "feat(release): a sufficiently long valid subject"],
      settings: authorizingSettings(),
      preflightCommitMessage: () => Promise.resolve({
        kind: "passed",
        verdict: "pass",
        messageBytes,
        transport: { kind: "messages" },
      }),
      spawnGit: () => Promise.resolve({ exitCode: 7, stdout: "", stderr: "failed" }),
    });

    const result = await runReleaseCommit({ ...deps, persistMessageRetry });

    expect(result.exitCode).toBe(7);
    expect(persistMessageRetry).toHaveBeenCalledWith({ cwd: fixture.root, bytes: messageBytes });
    expect(stderr.join("")).toContain("arc release commit -F '/repo with spaces/.git/latest-retry'");
  });

  it("preserves Git's exit code when retry persistence fails without offering an unusable path", async () => {
    await writeStatus(fixture.root, "sample");
    const { deps, stderr } = buildDeps(fixture.root, {
      argv: ["-m", "feat(release): a sufficiently long valid subject"],
      settings: authorizingSettings(),
      preflightCommitMessage: () => Promise.resolve({
        kind: "passed",
        verdict: "pass",
        messageBytes: Buffer.from("approved message"),
        transport: { kind: "messages" },
      }),
      spawnGit: () => Promise.resolve({ exitCode: 9, stdout: "", stderr: "failed" }),
      persistMessageRetry: () => Promise.reject(new Error("disk full")),
    });

    expect((await runReleaseCommit(deps)).exitCode).toBe(9);
    expect(stderr.join("")).toContain("latest commit-message retry could not be persisted: disk full");
    expect(stderr.join("")).not.toContain("arc release commit -F");
  });

  it.each([
    { label: "pass-through", preflight: { kind: "pass-through" as const } },
    {
      label: "preflight refusal",
      preflight: {
        kind: "refused" as const,
        reason: "validation" as const,
        message: "invalid message",
      },
    },
  ])("does not persist $label message bytes", async ({ preflight }) => {
    await writeStatus(fixture.root, "sample");
    const persistMessageRetry = vi.fn().mockResolvedValue({ path: "/unused" });
    const { deps } = buildDeps(fixture.root, {
      argv: ["-m", "message"],
      settings: authorizingSettings(),
      preflightCommitMessage: () => Promise.resolve(preflight),
      spawnGit: () => Promise.resolve({ exitCode: 1, stdout: "", stderr: "failed" }),
      persistMessageRetry,
    });

    await runReleaseCommit(deps);

    expect(persistMessageRetry).not.toHaveBeenCalled();
  });

  it("turns snapshot setup failure into an input refusal before Git", async () => {
    await writeStatus(fixture.root, "sample");
    const { deps, spawnGit } = buildDeps(fixture.root, {
      argv: ["-F", "caller.txt"],
      settings: authorizingSettings(),
      preflightCommitMessage: () => Promise.resolve({
        kind: "passed",
        verdict: "pass",
        messageBytes: Buffer.from("message"),
        transport: { kind: "file", rawBytes: Buffer.from("message"), sourcePath: "caller.txt" },
      }),
      createMessageSnapshot: async () => Promise.reject(new Error("disk full")),
    });

    expect((await runReleaseCommit(deps)).exitCode).toBe(16);
    expect(spawnGit).not.toHaveBeenCalled();
  });

  it("cleans the exact retry source only after its successful wrapper invocation", async () => {
    await writeStatus(fixture.root, "sample");
    const rawBytes = Buffer.from("approved retry");
    const cleanupConsumedMessageRetry = vi.fn().mockResolvedValue(true);
    const { deps } = buildDeps(fixture.root, {
      argv: ["-F", "/repo/.git/.arc-release-commit-message-retry"],
      settings: authorizingSettings(),
      preflightCommitMessage: () => Promise.resolve({
        kind: "passed",
        verdict: "pass",
        messageBytes: rawBytes,
        transport: {
          kind: "file",
          rawBytes,
          sourcePath: "/repo/.git/.arc-release-commit-message-retry",
          sourceIdentity: "retry-generation",
        },
      }),
      createMessageSnapshot: async () => ({ path: "/private", cleanup: async () => undefined }),
      spawnGit: () => Promise.resolve({ exitCode: 0, stdout: "", stderr: "" }),
      resolveHead: () => Promise.resolve(FULL_HASH),
    });

    await runReleaseCommit({ ...deps, cleanupConsumedMessageRetry });

    expect(cleanupConsumedMessageRetry).toHaveBeenCalledWith({
      cwd: fixture.root,
      sourcePath: "/repo/.git/.arc-release-commit-message-retry",
      sourceIdentity: "retry-generation",
    });
  });

  it("cleans a file snapshot after spawn failure", async () => {
    await writeStatus(fixture.root, "sample");
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const { deps } = buildDeps(fixture.root, {
      argv: ["-F", "caller.txt"],
      settings: authorizingSettings(),
      preflightCommitMessage: () => Promise.resolve({
        kind: "passed",
        verdict: "pass",
        messageBytes: Buffer.from("message"),
        transport: { kind: "file", rawBytes: Buffer.from("message"), sourcePath: "caller.txt" },
      }),
      createMessageSnapshot: async () => ({ path: "/private", cleanup }),
      spawnGit: async () => Promise.reject(new Error("spawn failed")),
    });

    await expect(runReleaseCommit(deps)).rejects.toThrow("spawn failed");
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("surfaces snapshot cleanup failure without changing Git's exit code", async () => {
    await writeStatus(fixture.root, "sample");
    const { deps, stderr } = buildDeps(fixture.root, {
      argv: ["-F", "caller.txt"],
      settings: authorizingSettings(),
      preflightCommitMessage: () => Promise.resolve({
        kind: "passed",
        verdict: "pass",
        messageBytes: Buffer.from("message"),
        transport: { kind: "file", rawBytes: Buffer.from("message"), sourcePath: "caller.txt" },
      }),
      createMessageSnapshot: async () => ({
        path: "/private",
        cleanup: async () => Promise.reject(new Error("busy")),
      }),
      spawnGit: () => Promise.resolve({ exitCode: 7, stdout: "", stderr: "failed" }),
    });

    expect((await runReleaseCommit(deps)).exitCode).toBe(7);
    expect(stderr.join("")).toContain("snapshot cleanup failed: busy");
  });

  it("forwards argv to spawnGit when authorized and bubbles exit code 0", async () => {
    await writeStatus(fixture.root, "sample");
    const argv = ["-m", "subject"];
    const { deps, spawnGit } = buildDeps(fixture.root, {
      argv,
      settings: authorizingSettings(),
      spawnGit: () => Promise.resolve({
        exitCode: 0,
        stdout: "[feature/x 1a2b3c4] subject\n",
        stderr: "",
      }),
      resolveHead: () => Promise.resolve(FULL_HASH),
    });

    const result = await runReleaseCommit(deps);

    expect(spawnGit).toHaveBeenCalledTimes(1);
    expect(spawnGit).toHaveBeenCalledWith({ args: argv, cwd: fixture.root });
    expect(result.exitCode).toBe(0);
  });

  it("proceeds with a null work unit on a zero-candidate context off-base", async () => {
    // No status file written → resolver returns `none`; off the protected base
    // under full protection + authorizing interlock, the cascade proceeds and
    // records a null work unit (the ceremony-invocation accept path).
    const settings = buildSettings({
      branchProtection: "full",
      branchBase: "main",
      commitInterlock: "on-workflow",
    });
    const { deps, spawnGit } = buildDeps(fixture.root, {
      argv: ["-m", "subject"],
      settings,
      currentBranch: "chore/errand",
      spawnGit: () => Promise.resolve({ exitCode: 0, stdout: "", stderr: "" }),
      resolveHead: () => Promise.resolve(FULL_HASH),
    });

    const result = await runReleaseCommit(deps);

    expect(result.exitCode).toBe(0);
    expect(spawnGit).toHaveBeenCalledTimes(1);
    const entries = await readAuditEntries(fixture.root);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      command: "release-commit",
      decision: "proceeded",
      refusalCode: null,
      outcome: { kind: "commit", hash: FULL_HASH },
      wu: null,
    });
  });

  it("writes a proceeded audit entry with kind: commit and the resolved hash", async () => {
    await writeStatus(fixture.root, "sample");
    const { deps, resolveHead } = buildDeps(fixture.root, {
      argv: ["-amsubject"],
      settings: authorizingSettings(),
      spawnGit: () => Promise.resolve({
        exitCode: 0,
        stdout: "[feature/x 1a2b3c4] subject\n",
        stderr: "",
      }),
      resolveHead: () => Promise.resolve(FULL_HASH),
    });

    await runReleaseCommit(deps);

    expect(resolveHead).toHaveBeenCalledWith({ cwd: fixture.root });
    const entries = await readAuditEntries(fixture.root);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      command: "release-commit",
      decision: "proceeded",
      refusalCode: null,
      outcome: { kind: "commit", hash: FULL_HASH },
      wu: { name: "sample" },
    });
    // -m payload still redacted on the success path.
    expect(entries[0]?.args).toEqual(["-am<redacted>"]);
  });

  it("bubbles non-zero git exit code and writes a hook-failed entry attributed via stderr", async () => {
    await writeStatus(fixture.root, "sample");
    const { deps, resolveHead } = buildDeps(fixture.root, {
      argv: ["-qamsubject"],
      settings: authorizingSettings(),
      spawnGit: () => Promise.resolve({
        exitCode: 1,
        stdout: "",
        stderr: "pre-commit hook failed: lint errors\n",
      }),
    });

    const result = await runReleaseCommit(deps);

    expect(result.exitCode).toBe(1);
    expect(resolveHead).not.toHaveBeenCalled();

    const entries = await readAuditEntries(fixture.root);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      command: "release-commit",
      decision: "proceeded",
      refusalCode: null,
      outcome: { kind: "hook-failed", hook: "pre-commit", exitCode: 1 },
    });
    expect(entries[0]?.args).toEqual(["-qam<redacted>"]);
  });

  it("attributes commit-msg hook rejection from captured output", async () => {
    await writeStatus(fixture.root, "sample");
    const { deps } = buildDeps(fixture.root, {
      argv: ["-m", "subject"],
      settings: authorizingSettings(),
      spawnGit: () => Promise.resolve({
        exitCode: 1,
        stdout: "",
        stderr: "Aborting commit due to commit-msg hook rejection\n",
      }),
    });

    await runReleaseCommit(deps);

    const [entry] = await readAuditEntries(fixture.root);
    expect(entry?.outcome).toMatchObject({
      kind: "hook-failed",
      hook: "commit-msg",
      exitCode: 1,
    });
  });

  it("attributes prepare-commit-msg ahead of commit-msg when both substrings appear", async () => {
    await writeStatus(fixture.root, "sample");
    const { deps } = buildDeps(fixture.root, {
      argv: ["-m", "subject"],
      settings: authorizingSettings(),
      spawnGit: () => Promise.resolve({
        exitCode: 1,
        stdout: "",
        stderr: "prepare-commit-msg hook exited with status 2\n",
      }),
    });

    await runReleaseCommit(deps);

    const [entry] = await readAuditEntries(fixture.root);
    expect(entry?.outcome).toMatchObject({
      kind: "hook-failed",
      hook: "prepare-commit-msg",
      exitCode: 1,
    });
  });

  it("falls back to hook: 'unknown' when no hook keyword matches", async () => {
    await writeStatus(fixture.root, "sample");
    const { deps } = buildDeps(fixture.root, {
      argv: ["-m", "subject"],
      settings: authorizingSettings(),
      spawnGit: () => Promise.resolve({
        exitCode: 128,
        stdout: "",
        stderr: "fatal: pathspec did not match any files\n",
      }),
    });

    const result = await runReleaseCommit(deps);

    expect(result.exitCode).toBe(128);
    const [entry] = await readAuditEntries(fixture.root);
    expect(entry?.outcome).toMatchObject({
      kind: "hook-failed",
      hook: "unknown",
      exitCode: 128,
    });
  });
});
