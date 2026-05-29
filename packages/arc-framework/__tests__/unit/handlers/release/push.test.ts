/**
 * Unit tests for the `arc release push` refusal-path orchestrator.
 *
 * Covers the five runtime refusal codes in their documented short-circuit
 * order (12 → 10 → 13 → 14 → 11). Code 14 (pushability) tests exercise
 * each disposition class: `block`, `force-push-required` advisory, and
 * `auto-fixed` passthrough — the wrapper refuses on the first two and
 * ignores the third.
 *
 * Tests in this file exercise the refusal paths only; `spawnPush` is
 * asserted as never-called on every assertion path. Success-path coverage
 * (wrapped invocation + audit attribution) lives in a sibling describe
 * block once the authorize branch wires the spawn delegation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runReleasePush } from "../../../../src/handlers/release/push.js";
import type { ReleasePushDeps } from "../../../../src/handlers/release/push.js";
import type { AuditEntry } from "../../../../src/lib/release/types.js";
import type {
  PushabilityCondition,
  PushabilityResult,
} from "../../../../src/lib/git/pushability.js";
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
  const root = await mkdtemp(join(tmpdir(), "arc-release-push-"));
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
  const commitInterlock: CommitInterlock = overrides.commitInterlock ?? "manual";
  const pushInterlock: PushInterlock = overrides.pushInterlock ?? "on-workflow";
  const branchProtection = overrides.branchProtection ?? "partial";
  const branchBase = overrides.branchBase ?? "main";

  const settings: ConfigSettings = {
    "errands.staleness_days": "3",
    "branch.base": branchBase,
    "branch.protection": branchProtection,
    "worktree.location_template": "../{repo}.{branch}",
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

function pushabilityClean(): PushabilityResult {
  return { allowed: true, conditions: [] };
}

function pushabilityWith(conditions: PushabilityCondition[]): PushabilityResult {
  const allowed = !conditions.some(
    (c) => c.disposition === "block" || c.disposition === "caller-resolvable",
  );
  return { allowed, conditions };
}

interface BuildDepsOptions {
  argv?: readonly string[];
  settings?: ResolvedSettingsResult;
  currentBranch?: string;
  pushability?: PushabilityResult;
  spawnPush?: ReleasePushDeps["spawnPush"];
}

function buildDeps(root: string, opts: BuildDepsOptions = {}): {
  deps: ReleasePushDeps;
  stderr: string[];
  spawnPush: ReturnType<typeof vi.fn>;
  runPushability: ReturnType<typeof vi.fn>;
} {
  const stderr: string[] = [];
  const spawnPush = vi.fn(opts.spawnPush ?? (() => {
    throw new Error("spawnPush must not be called on a refusal path");
  }));
  const runPushability = vi.fn(() => Promise.resolve(opts.pushability ?? pushabilityClean()));
  const deps: ReleasePushDeps = {
    cwd: root,
    identity: IDENTITY,
    argv: opts.argv ?? [],
    settings: opts.settings ?? buildSettings(),
    currentBranch: opts.currentBranch ?? "feature/x",
    runPushability,
    spawnPush,
    writeStderr: (msg) => { stderr.push(msg); },
  };
  return { deps, stderr, spawnPush, runPushability };
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

describe("runReleasePush — code 12 (destructive-flag)", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it.each([
    ["--force"],
    ["-f"],
    ["--force-with-lease"],
    ["--delete"],
    ["-d"],
    ["--mirror"],
  ])("refuses with code 12 and audit entry carrying flag detail (%s)", async (flag) => {
    await writeStatus(fixture.root, "sample");
    const { deps, spawnPush } = buildDeps(fixture.root, { argv: [flag] });

    const result = await runReleasePush(deps);

    expect(result.exitCode).toBe(12);
    expect(spawnPush).not.toHaveBeenCalled();

    const entries = await readAuditEntries(fixture.root);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      schemaVersion: 1,
      command: "release-push",
      decision: "refused",
      refusalCode: 12,
      outcome: { kind: "refused" },
      args: [flag],
    });
  });

  it("refuses with code 12 on a leading-`+` refspec (force-push pattern)", async () => {
    await writeStatus(fixture.root, "sample");
    const { deps, spawnPush, stderr } = buildDeps(fixture.root, { argv: ["+main:main"] });

    const result = await runReleasePush(deps);

    expect(result.exitCode).toBe(12);
    expect(spawnPush).not.toHaveBeenCalled();

    const composed = stderr.join("");
    expect(composed).toContain("Refused: destructive-flag (code 12)");
    expect(composed).toContain("+refspec");
  });

  it("emits a three-line refusal message that names the flag", async () => {
    await writeStatus(fixture.root, "sample");
    const { deps, stderr } = buildDeps(fixture.root, { argv: ["--force"] });

    await runReleasePush(deps);

    const composed = stderr.join("");
    expect(composed).toContain("Refused: destructive-flag (code 12)");
    expect(composed).toContain("--force");
  });

  it("does not require an active WU for the code 12 decision", async () => {
    // No status file written — code 12 fires before code 10.
    const { deps } = buildDeps(fixture.root, { argv: ["--mirror"] });

    const result = await runReleasePush(deps);

    expect(result.exitCode).toBe(12);
  });
});

// --- Code 15: arg-grammar-fallthrough (positional ref-mismatch) ---

describe("runReleasePush — code 15 (arg-grammar-fallthrough)", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it("refuses with code 15 when positional `<remote> <branch>` does not match current target", async () => {
    const { deps, spawnPush, runPushability } = buildDeps(fixture.root, {
      argv: ["origin", "other-branch"],
      currentBranch: "feature/x",
    });

    const result = await runReleasePush(deps);

    expect(result.exitCode).toBe(15);
    expect(spawnPush).not.toHaveBeenCalled();
    // Arg-grammar check is argv-only — must short-circuit before any I/O probe.
    expect(runPushability).not.toHaveBeenCalled();
  });

  it("refuses with code 15 on `-u origin <other-branch>` — the documented failure mode", async () => {
    const { deps, stderr } = buildDeps(fixture.root, {
      argv: ["-u", "origin", "other-branch"],
      currentBranch: "feature/x",
    });

    const result = await runReleasePush(deps);

    expect(result.exitCode).toBe(15);
    const composed = stderr.join("");
    expect(composed).toContain("Refused: arg-grammar-fallthrough (code 15)");
    expect(composed).toContain("origin other-branch");
    expect(composed).toContain("origin feature/x");
  });

  it("writes a refused audit entry with the original argv preserved", async () => {
    await writeStatus(fixture.root, "sample");
    const { deps } = buildDeps(fixture.root, {
      argv: ["origin", "other-branch"],
      currentBranch: "feature/x",
    });

    await runReleasePush(deps);

    const entries = await readAuditEntries(fixture.root);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      command: "release-push",
      decision: "refused",
      refusalCode: 15,
      outcome: { kind: "refused" },
      args: ["origin", "other-branch"],
    });
  });

  it("does not require an active WU for the code 15 decision (argv-only)", async () => {
    // No status file written — code 15 fires before code 10.
    const { deps } = buildDeps(fixture.root, {
      argv: ["origin", "other-branch"],
      currentBranch: "feature/x",
    });

    const result = await runReleasePush(deps);

    expect(result.exitCode).toBe(15);
  });
});

// --- Code 10: no-active-wu (fs probe) ---

describe("runReleasePush — code 10 (no-active-wu)", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it("refuses with code 10 when .arc/active/ has no candidates", async () => {
    const { deps, spawnPush, runPushability } = buildDeps(fixture.root);

    const result = await runReleasePush(deps);

    expect(result.exitCode).toBe(10);
    expect(spawnPush).not.toHaveBeenCalled();
    // Pushability matrix is downstream of WU resolution — must not fire.
    expect(runPushability).not.toHaveBeenCalled();

    const entries = await readAuditEntries(fixture.root);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      command: "release-push",
      decision: "refused",
      refusalCode: 10,
      wu: null,
    });
  });

  it("refuses with code 10 + disambiguation hint on multi-candidate", async () => {
    await writeStatus(fixture.root, "alpha");
    await writeStatus(fixture.root, "beta");
    const { deps, stderr } = buildDeps(fixture.root);

    const result = await runReleasePush(deps);

    expect(result.exitCode).toBe(10);
    const composed = stderr.join("");
    expect(composed).toContain("Refused: no-active-wu (code 10)");
    expect(composed).toMatch(/multiple/i);

    const [entry] = await readAuditEntries(fixture.root);
    expect(entry?.wu).toBeNull();
    expect(entry?.refusalCode).toBe(10);
  });
});

// --- Code 13: branch-protection-violation ---

describe("runReleasePush — code 13 (branch-protection-violation)", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it("refuses with code 13 when branch.protection: full and currentBranch === branch.base", async () => {
    await writeStatus(fixture.root, "sample");
    const settings = buildSettings({
      branchProtection: "full",
      branchBase: "main",
      pushInterlock: "on-workflow",
    });
    const { deps, spawnPush, runPushability, stderr } = buildDeps(fixture.root, {
      settings,
      currentBranch: "main",
    });

    const result = await runReleasePush(deps);

    expect(result.exitCode).toBe(13);
    expect(spawnPush).not.toHaveBeenCalled();
    // Branch-protection short-circuits before pushability — matrix never fires.
    expect(runPushability).not.toHaveBeenCalled();

    const composed = stderr.join("");
    expect(composed).toContain("Refused: branch-protection-violation (code 13)");
    expect(composed).toContain("main");

    const [entry] = await readAuditEntries(fixture.root);
    expect(entry).toMatchObject({
      command: "release-push",
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
      pushInterlock: "manual",
    });
    const { deps } = buildDeps(fixture.root, {
      settings,
      currentBranch: "main",
    });

    const result = await runReleasePush(deps);

    // Partial does not fire 13 → pushability passes (clean) → interlock=manual → 11.
    expect(result.exitCode).toBe(11);
  });
});

// --- Code 14: pushability-precheck-failed ---

describe("runReleasePush — code 14 (pushability-precheck-failed)", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it.each<[string, PushabilityCondition]>([
    [
      "rebase-in-progress",
      {
        kind: "rebase-in-progress",
        disposition: "block",
        rebaseForm: "rebase-merge",
        guidance: "Rebase in progress.",
      },
    ],
    [
      "detached-head",
      { kind: "detached-head", disposition: "block", guidance: "Detached HEAD." },
    ],
    [
      "worktree-not-aligned-with-origin",
      {
        kind: "worktree-not-aligned-with-origin",
        disposition: "block",
        worktreeAlignment: { state: "diverged", ahead: 2, behind: 1 },
        guidance: "Worktree not aligned.",
      },
    ],
  ])("refuses with code 14 on blocking condition: %s", async (_, condition) => {
    await writeStatus(fixture.root, "sample");
    const { deps, spawnPush, stderr } = buildDeps(fixture.root, {
      pushability: pushabilityWith([condition]),
    });

    const result = await runReleasePush(deps);

    expect(result.exitCode).toBe(14);
    expect(spawnPush).not.toHaveBeenCalled();

    const composed = stderr.join("");
    expect(composed).toContain("Refused: pushability-precheck-failed (code 14)");
    expect(composed).toContain(condition.kind);

    const [entry] = await readAuditEntries(fixture.root);
    expect(entry).toMatchObject({
      command: "release-push",
      decision: "refused",
      refusalCode: 14,
      wu: { name: "sample" },
    });
  });

  it("refuses with code 14 on advisory force-push-required (always-refuse contract)", async () => {
    await writeStatus(fixture.root, "sample");
    const condition: PushabilityCondition = {
      kind: "force-push-required",
      disposition: "advisory",
      guidance: "Force-push needed.",
    };
    // pushability.allowed is true (no `block`), but the wrapper refuses anyway —
    // the always-refuse contract is the wrapper's, not the matrix's.
    const matrix = pushabilityWith([condition]);
    expect(matrix.allowed).toBe(true);
    const { deps, spawnPush } = buildDeps(fixture.root, { pushability: matrix });

    const result = await runReleasePush(deps);

    expect(result.exitCode).toBe(14);
    expect(spawnPush).not.toHaveBeenCalled();
  });

  it("does not refuse on auto-fixed disposition (matrix self-resolved)", async () => {
    await writeStatus(fixture.root, "sample");
    const condition: PushabilityCondition = {
      kind: "missing-notes-refspec",
      disposition: "auto-fixed",
      guidance: "Auto-configured.",
    };
    const settings = buildSettings({ pushInterlock: "manual" });
    const { deps } = buildDeps(fixture.root, {
      settings,
      pushability: pushabilityWith([condition]),
    });

    const result = await runReleasePush(deps);

    // Auto-fixed passes the pushability gate; the cascade reaches interlock,
    // which is `manual` → 11. The 11 outcome confirms 14 did not fire.
    expect(result.exitCode).toBe(11);
  });

  it("never spawns push on any pushability refusal path", async () => {
    await writeStatus(fixture.root, "sample");
    const { deps, spawnPush } = buildDeps(fixture.root, {
      pushability: pushabilityWith([
        { kind: "detached-head", disposition: "block", guidance: "—" },
      ]),
    });

    await runReleasePush(deps);

    expect(spawnPush).not.toHaveBeenCalled();
  });
});

// --- Caller-resolvable `no-upstream-branch` auto-resolution ---

describe("runReleasePush — caller-resolvable no-upstream-branch", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  const noUpstream: PushabilityCondition = {
    kind: "no-upstream-branch",
    disposition: "caller-resolvable",
    branch: "feature/x",
    guidance: "Set upstream first: `git push -u origin feature/x`",
  };

  it("auto-injects -u when push_interlock=on-workflow and argv lacks -u", async () => {
    await writeStatus(fixture.root, "sample");
    const { deps, spawnPush } = buildDeps(fixture.root, {
      argv: [],
      pushability: pushabilityWith([noUpstream]),
      spawnPush: () => Promise.resolve({ status: "success", stdout: "", stderr: "" }),
    });

    const result = await runReleasePush(deps);

    expect(result.exitCode).toBe(0);
    expect(spawnPush).toHaveBeenCalledTimes(1);
    const callArg = spawnPush.mock.calls[0]?.[0] as { args: string[] } | undefined;
    expect(callArg?.args).toEqual(["-u"]);
  });

  it("passes argv through unchanged when -u is already present", async () => {
    await writeStatus(fixture.root, "sample");
    const { deps, spawnPush } = buildDeps(fixture.root, {
      argv: ["-u"],
      pushability: pushabilityWith([noUpstream]),
      spawnPush: () => Promise.resolve({ status: "success", stdout: "", stderr: "" }),
    });

    const result = await runReleasePush(deps);

    expect(result.exitCode).toBe(0);
    expect(spawnPush).toHaveBeenCalledTimes(1);
    const callArg = spawnPush.mock.calls[0]?.[0] as { args: string[] } | undefined;
    // No double-injection — single `-u` from the original argv.
    expect(callArg?.args).toEqual(["-u"]);
  });

  it("recognizes --set-upstream as the same intent signal as -u", async () => {
    await writeStatus(fixture.root, "sample");
    const { deps, spawnPush } = buildDeps(fixture.root, {
      argv: ["--set-upstream"],
      pushability: pushabilityWith([noUpstream]),
      spawnPush: () => Promise.resolve({ status: "success", stdout: "", stderr: "" }),
    });

    const result = await runReleasePush(deps);

    expect(result.exitCode).toBe(0);
    const callArg = spawnPush.mock.calls[0]?.[0] as { args: string[] } | undefined;
    expect(callArg?.args).toEqual(["--set-upstream"]);
  });

  it("refuses with code 14 when push_interlock=manual and argv lacks -u", async () => {
    await writeStatus(fixture.root, "sample");
    const settings = buildSettings({ pushInterlock: "manual" });
    const { deps, spawnPush, stderr } = buildDeps(fixture.root, {
      argv: [],
      settings,
      pushability: pushabilityWith([noUpstream]),
    });

    const result = await runReleasePush(deps);

    expect(result.exitCode).toBe(14);
    expect(spawnPush).not.toHaveBeenCalled();
    expect(stderr.join("")).toContain("no-upstream-branch");
  });

  it("auto-resolves when push_interlock=manual but argv carries -u", async () => {
    await writeStatus(fixture.root, "sample");
    const settings = buildSettings({ pushInterlock: "manual" });
    const { deps, spawnPush } = buildDeps(fixture.root, {
      argv: ["-u"],
      settings,
      pushability: pushabilityWith([noUpstream]),
      spawnPush: () => Promise.resolve({ status: "success", stdout: "", stderr: "" }),
    });

    const result = await runReleasePush(deps);

    // Pushability auto-resolves. Interlock=manual then refuses at step 5
    // with code 11 — confirming pushability did not refuse with 14.
    expect(result.exitCode).toBe(11);
    expect(spawnPush).not.toHaveBeenCalled();
  });
});

// --- Code 11: interlock-not-authorized ---

describe("runReleasePush — code 11 (interlock-not-authorized)", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it.each<[PushInterlock]>([["manual"], ["on-sync"]])(
    "refuses with code 11 when push_interlock=%s",
    async (pushInterlock) => {
      await writeStatus(fixture.root, "sample");
      const settings = buildSettings({ pushInterlock });
      const { deps, spawnPush, stderr } = buildDeps(fixture.root, { settings });

      const result = await runReleasePush(deps);

      expect(result.exitCode).toBe(11);
      expect(spawnPush).not.toHaveBeenCalled();

      const composed = stderr.join("");
      expect(composed).toContain("Refused: interlock-not-authorized (code 11)");
      expect(composed).toContain("arc.pushInterlock");
      expect(composed).toContain(pushInterlock);

      const [entry] = await readAuditEntries(fixture.root);
      expect(entry).toMatchObject({
        command: "release-push",
        decision: "refused",
        refusalCode: 11,
        interlockState: {
          command: "release-push",
          pushInterlock: { value: pushInterlock, source: "default" },
          syncInterlock: { value: "on-handoff", source: "default" },
        },
      });
    },
  );
});

// --- Cascade short-circuit order (12 → 10 → 13 → 14 → 11) ---

describe("runReleasePush — short-circuit order", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it("12 fires before 10 (destructive flag wins over no-active-wu)", async () => {
    const { deps } = buildDeps(fixture.root, { argv: ["--force"] });
    const result = await runReleasePush(deps);
    expect(result.exitCode).toBe(12);
  });

  it("12 fires before 15 (destructive flag wins over arg-grammar)", async () => {
    // Argv carries both a destructive flag and a mismatched positional pair.
    // Code 12 should win — destructive intent is the higher-priority signal.
    const { deps } = buildDeps(fixture.root, {
      argv: ["--force", "origin", "other-branch"],
      currentBranch: "feature/x",
    });
    const result = await runReleasePush(deps);
    expect(result.exitCode).toBe(12);
  });

  it("15 fires before 10 (arg-grammar wins over no-active-wu)", async () => {
    // No status file written — code 10 would normally fire. Argv-only checks
    // (15) must short-circuit ahead of the fs probe (10).
    const { deps } = buildDeps(fixture.root, {
      argv: ["origin", "other-branch"],
      currentBranch: "feature/x",
    });
    const result = await runReleasePush(deps);
    expect(result.exitCode).toBe(15);
  });

  it("10 fires before 13 (no-active-wu wins over branch-protection)", async () => {
    const settings = buildSettings({
      branchProtection: "full",
      branchBase: "main",
      pushInterlock: "on-workflow",
    });
    const { deps } = buildDeps(fixture.root, {
      settings,
      currentBranch: "main",
    });
    const result = await runReleasePush(deps);
    expect(result.exitCode).toBe(10);
  });

  it("13 fires before 14 (branch-protection wins over pushability)", async () => {
    await writeStatus(fixture.root, "sample");
    const settings = buildSettings({
      branchProtection: "full",
      branchBase: "main",
      pushInterlock: "on-workflow",
    });
    const { deps, runPushability } = buildDeps(fixture.root, {
      settings,
      currentBranch: "main",
      pushability: pushabilityWith([
        { kind: "detached-head", disposition: "block", guidance: "—" },
      ]),
    });
    const result = await runReleasePush(deps);
    expect(result.exitCode).toBe(13);
    // Pushability matrix never invoked — 13 short-circuits.
    expect(runPushability).not.toHaveBeenCalled();
  });

  it("14 fires before 11 (pushability wins over interlock)", async () => {
    await writeStatus(fixture.root, "sample");
    const settings = buildSettings({ pushInterlock: "manual" });
    const { deps } = buildDeps(fixture.root, {
      settings,
      pushability: pushabilityWith([
        { kind: "detached-head", disposition: "block", guidance: "—" },
      ]),
    });
    const result = await runReleasePush(deps);
    expect(result.exitCode).toBe(14);
  });
});

// --- Success path: wrapped push invocation + audit attribution ---

describe("runReleasePush — success path", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  function authorizingSettings(): ResolvedSettingsResult {
    return buildSettings({ pushInterlock: "on-workflow" });
  }

  it("forwards branch + argv to spawnPush when authorized and bubbles exit 0", async () => {
    await writeStatus(fixture.root, "sample");
    const argv = ["--dry-run"];
    const { deps, spawnPush } = buildDeps(fixture.root, {
      argv,
      settings: authorizingSettings(),
      currentBranch: "feature/x",
      spawnPush: () => Promise.resolve({
        status: "success",
        stdout: "",
        stderr: "To origin\n   abc1234..def5678  feature/x -> feature/x\n",
      }),
    });

    const result = await runReleasePush(deps);

    expect(spawnPush).toHaveBeenCalledTimes(1);
    expect(spawnPush).toHaveBeenCalledWith({
      branch: "feature/x",
      args: argv,
      cwd: fixture.root,
    });
    expect(result.exitCode).toBe(0);
  });

  it("strips a matching positional `<remote> <branch>` pair before spawnPush", async () => {
    await writeStatus(fixture.root, "sample");
    const { deps, spawnPush } = buildDeps(fixture.root, {
      argv: ["origin", "feature/x"],
      settings: authorizingSettings(),
      currentBranch: "feature/x",
      spawnPush: () => Promise.resolve({
        status: "success",
        stdout: "",
        stderr: "Everything up-to-date\n",
      }),
    });

    await runReleasePush(deps);

    expect(spawnPush).toHaveBeenCalledWith({
      branch: "feature/x",
      args: [],
      cwd: fixture.root,
    });

    const [entry] = await readAuditEntries(fixture.root);
    expect(entry?.args).toEqual(["origin", "feature/x"]);
  });

  it("strips a matching `-u origin <branch>` triple but preserves the flag", async () => {
    await writeStatus(fixture.root, "sample");
    const { deps, spawnPush } = buildDeps(fixture.root, {
      argv: ["-u", "origin", "feature/x"],
      settings: authorizingSettings(),
      currentBranch: "feature/x",
      spawnPush: () => Promise.resolve({
        status: "success",
        stdout: "",
        stderr: "Everything up-to-date\n",
      }),
    });

    await runReleasePush(deps);

    expect(spawnPush).toHaveBeenCalledWith({
      branch: "feature/x",
      args: ["-u"],
      cwd: fixture.root,
    });
  });

  it("writes a proceeded audit entry with kind: push and parsed refStatus", async () => {
    await writeStatus(fixture.root, "sample");
    const { deps } = buildDeps(fixture.root, {
      argv: [],
      settings: authorizingSettings(),
      currentBranch: "feature/x",
      spawnPush: () => Promise.resolve({
        status: "success",
        stdout: "",
        stderr: "To origin\n   abc1234..def5678  feature/x -> feature/x\nDone\n",
      }),
    });

    await runReleasePush(deps);

    const entries = await readAuditEntries(fixture.root);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      command: "release-push",
      decision: "proceeded",
      refusalCode: null,
      outcome: { kind: "push", refStatus: "abc1234..def5678  feature/x -> feature/x" },
      wu: { name: "sample" },
    });
  });

  it("falls back to refStatus: 'ok' when stderr has no parseable ref-status line", async () => {
    await writeStatus(fixture.root, "sample");
    const { deps } = buildDeps(fixture.root, {
      settings: authorizingSettings(),
      spawnPush: () => Promise.resolve({
        status: "success",
        stdout: "",
        stderr: "Everything up-to-date\n",
      }),
    });

    await runReleasePush(deps);

    const [entry] = await readAuditEntries(fixture.root);
    expect(entry?.outcome).toMatchObject({ kind: "push", refStatus: "ok" });
  });

  it("bubbles non-zero exit and writes hook-failed entry attributed to pre-push", async () => {
    await writeStatus(fixture.root, "sample");
    const { deps } = buildDeps(fixture.root, {
      settings: authorizingSettings(),
      spawnPush: () => Promise.resolve({
        status: "failed",
        exitCode: 1,
        stdout: "",
        stderr: "pre-push hook rejected: commits failed lint\n",
      }),
    });

    const result = await runReleasePush(deps);

    expect(result.exitCode).toBe(1);
    const entries = await readAuditEntries(fixture.root);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      command: "release-push",
      decision: "proceeded",
      refusalCode: null,
      outcome: { kind: "hook-failed", hook: "pre-push", exitCode: 1 },
    });
  });

  it.each<[string, string]>([
    ["non-fast-forward", "! [rejected]        feature/x -> feature/x (non-fast-forward)\n"],
    ["remote rejected", "remote rejected feature/x (branch policy)\n"],
    ["bracketed rejected", "! [rejected]        main -> main (fetch first)\n"],
  ])("attributes server-side reject (%s) to hook: 'server'", async (_, stderr) => {
    await writeStatus(fixture.root, "sample");
    const { deps } = buildDeps(fixture.root, {
      settings: authorizingSettings(),
      spawnPush: () => Promise.resolve({
        status: "failed",
        exitCode: 1,
        stdout: "",
        stderr,
      }),
    });

    await runReleasePush(deps);

    const [entry] = await readAuditEntries(fixture.root);
    expect(entry?.outcome).toMatchObject({
      kind: "hook-failed",
      hook: "server",
      exitCode: 1,
    });
  });

  it("falls back to hook: 'unknown' when no marker matches", async () => {
    await writeStatus(fixture.root, "sample");
    const { deps } = buildDeps(fixture.root, {
      settings: authorizingSettings(),
      spawnPush: () => Promise.resolve({
        status: "failed",
        exitCode: 128,
        stdout: "",
        stderr: "fatal: unable to access 'origin': network error\n",
      }),
    });

    const result = await runReleasePush(deps);

    expect(result.exitCode).toBe(128);
    const [entry] = await readAuditEntries(fixture.root);
    expect(entry?.outcome).toMatchObject({
      kind: "hook-failed",
      hook: "unknown",
      exitCode: 128,
    });
  });

  it("writes the audit entry with release-push interlockState (push + sync)", async () => {
    await writeStatus(fixture.root, "sample");
    const { deps } = buildDeps(fixture.root, {
      settings: authorizingSettings(),
      spawnPush: () => Promise.resolve({
        status: "success",
        stdout: "",
        stderr: "Everything up-to-date\n",
      }),
    });

    await runReleasePush(deps);

    const [entry] = await readAuditEntries(fixture.root);
    expect(entry?.interlockState).toMatchObject({
      command: "release-push",
      pushInterlock: { value: "on-workflow", source: "default" },
      syncInterlock: { value: "on-handoff", source: "default" },
    });
  });
});
