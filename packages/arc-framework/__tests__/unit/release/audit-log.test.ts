/**
 * Unit tests for the release-wrapper audit-log writer.
 *
 * Covers path resolution under `.arc/user/{identity}/.internal/`,
 * idempotent parent-directory bootstrap, commit-message argv
 * sanitization, and append-only schema-validated JSONL writes with the
 * schema-violation vs. I/O-failure error split (validation throws;
 * filesystem errors return `{ ok: false, error }`).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  appendAuditEntry,
  ensureAuditLogParent,
  resolveAuditLogPath,
  sanitizeArgs,
  toAuditWorkUnit,
} from "../../../src/lib/release/audit-log.js";
import type { AuditEntry } from "../../../src/lib/release/types.js";

interface Fixture {
  root: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "arc-audit-log-"));
  return { root };
}

describe("resolveAuditLogPath", () => {
  it("returns `.arc/user/{identity}/.internal/.audit-log.jsonl` under cwd", () => {
    const path = resolveAuditLogPath({ cwd: "/repo", identity: "alice" });

    expect(path).toBe("/repo/.arc/user/alice/.internal/.audit-log.jsonl");
  });
});

describe("ensureAuditLogParent", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it("creates `.arc/user/{identity}/.internal/` when missing", async () => {
    await ensureAuditLogParent({ cwd: fixture.root, identity: "alice" });

    const parent = join(fixture.root, ".arc", "user", "alice", ".internal");
    const info = await stat(parent);
    expect(info.isDirectory()).toBe(true);
  });

  it("is idempotent — running twice does not error", async () => {
    await ensureAuditLogParent({ cwd: fixture.root, identity: "alice" });
    await expect(
      ensureAuditLogParent({ cwd: fixture.root, identity: "alice" }),
    ).resolves.toBeUndefined();

    const parent = join(fixture.root, ".arc", "user", "alice", ".internal");
    const info = await stat(parent);
    expect(info.isDirectory()).toBe(true);
  });
});

describe("sanitizeArgs — commit-message redaction rules", () => {
  it("redacts the `-m` payload (separated form)", () => {
    expect(sanitizeArgs(["commit", "-m", "subject"])).toEqual([
      "commit",
      "-m",
      "<redacted>",
    ]);
  });

  it("redacts the `--message` payload (separated form)", () => {
    expect(sanitizeArgs(["commit", "--message", "subject"])).toEqual([
      "commit",
      "--message",
      "<redacted>",
    ]);
  });

  it("redacts `-msubject` attached-short form, preserving the `-m` prefix", () => {
    expect(sanitizeArgs(["commit", "-msubject"])).toEqual([
      "commit",
      "-m<redacted>",
    ]);
  });

  it("redacts `--message=subject` attached-long form, preserving the `--message=` prefix", () => {
    expect(sanitizeArgs(["commit", "--message=subject"])).toEqual([
      "commit",
      "--message=<redacted>",
    ]);
  });

  it("redacts each `-m` flag independently when chained", () => {
    expect(sanitizeArgs(["commit", "-m", "subject", "-m", "body"])).toEqual([
      "commit",
      "-m",
      "<redacted>",
      "-m",
      "<redacted>",
    ]);
  });

  it("keeps `--file path` verbatim (path is not sensitive)", () => {
    expect(sanitizeArgs(["commit", "--file", "/tmp/msg.txt"])).toEqual([
      "commit",
      "--file",
      "/tmp/msg.txt",
    ]);
  });

  it("keeps `--file=path` verbatim", () => {
    expect(sanitizeArgs(["commit", "--file=/tmp/msg.txt"])).toEqual([
      "commit",
      "--file=/tmp/msg.txt",
    ]);
  });

  it("keeps remote URLs and refspecs verbatim on push", () => {
    expect(
      sanitizeArgs(["push", "git@github.com:foo/bar.git", "main"]),
    ).toEqual(["push", "git@github.com:foo/bar.git", "main"]);
  });

  it("keeps unrelated args verbatim", () => {
    expect(sanitizeArgs(["status", "--porcelain"])).toEqual([
      "status",
      "--porcelain",
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(sanitizeArgs([])).toEqual([]);
  });
});

describe("toAuditWorkUnit — resolver-result mapping", () => {
  it("returns null for resolver-empty (lite layout — empty name)", () => {
    expect(toAuditWorkUnit({ name: "" })).toBeNull();
  });

  it("returns null when input is null", () => {
    expect(toAuditWorkUnit(null)).toBeNull();
  });

  it("maps a resolved name to the audit wu field", () => {
    expect(toAuditWorkUnit({ name: "foo" })).toEqual({ name: "foo" });
  });
});

function commitEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    schemaVersion: 1,
    timestamp: "2026-05-08T12:00:00.000Z",
    command: "release-commit",
    args: ["-m", "<redacted>"],
    wu: { name: "foo" },
    interlockState: {
      command: "release-commit",
      commitInterlock: { value: "on-task-approval", source: "git-config" },
      pushInterlock: { value: "on-sync", source: "git-config" },
    },
    decision: "proceeded",
    refusalCode: null,
    outcome: { kind: "commit", hash: "abc1234" },
    ...overrides,
  };
}

function pushEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    schemaVersion: 1,
    timestamp: "2026-05-08T12:00:01.000Z",
    command: "release-push",
    args: ["push", "origin", "main"],
    wu: { name: "foo" },
    interlockState: {
      command: "release-push",
      pushInterlock: { value: "on-sync", source: "git-config" },
      syncInterlock: { value: "on-handoff", source: "git-config" },
    },
    decision: "proceeded",
    refusalCode: null,
    outcome: { kind: "push", refStatus: "fast-forward" },
    ...overrides,
  };
}

function syncEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    schemaVersion: 1,
    timestamp: "2026-05-08T12:00:02.000Z",
    command: "sync",
    args: ["sync"],
    wu: null,
    interlockState: {
      command: "sync",
      pushInterlock: { value: "on-sync", source: "git-config" },
      notesPush: { value: "on-sync", source: "default" },
      syncInterlock: { value: "on-handoff", source: "git-config" },
    },
    decision: "proceeded",
    refusalCode: null,
    outcome: { kind: "sync", cell: "clean", worktree: "ran", notes: "ran", exitCode: 0 },
    ...overrides,
  };
}

describe("appendAuditEntry — append + round-trip", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it("appends one JSONL line per call (no overwrite)", async () => {
    const a = commitEntry();
    const b = commitEntry({ timestamp: "2026-05-08T12:01:00.000Z" });

    expect(await appendAuditEntry({ cwd: fixture.root, identity: "alice", entry: a })).toEqual({ ok: true });
    expect(await appendAuditEntry({ cwd: fixture.root, identity: "alice", entry: b })).toEqual({ ok: true });

    const path = resolveAuditLogPath({ cwd: fixture.root, identity: "alice" });
    const content = await readFile(path, "utf8");
    const lines = content.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
  });

  it("round-trips a release-commit entry through JSON", async () => {
    const entry = commitEntry();
    await appendAuditEntry({ cwd: fixture.root, identity: "alice", entry });
    const path = resolveAuditLogPath({ cwd: fixture.root, identity: "alice" });
    const content = await readFile(path, "utf8");
    const [line] = content.split("\n");
    expect(JSON.parse(line!)).toEqual(entry);
  });

  it("round-trips a release-push entry", async () => {
    const entry = pushEntry();
    await appendAuditEntry({ cwd: fixture.root, identity: "alice", entry });
    const content = await readFile(
      resolveAuditLogPath({ cwd: fixture.root, identity: "alice" }),
      "utf8",
    );
    expect(JSON.parse(content.trim())).toEqual(entry);
  });

  it("round-trips a sync entry", async () => {
    const entry = syncEntry();
    await appendAuditEntry({ cwd: fixture.root, identity: "alice", entry });
    const content = await readFile(
      resolveAuditLogPath({ cwd: fixture.root, identity: "alice" }),
      "utf8",
    );
    expect(JSON.parse(content.trim())).toEqual(entry);
  });
});

describe("appendAuditEntry — schema enforcement (throws on violation)", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  const ctx = (root: string) => ({ cwd: root, identity: "alice" });

  it("throws when schemaVersion is not 1", async () => {
    const entry = commitEntry({ schemaVersion: 2 as unknown as 1 });
    await expect(
      appendAuditEntry({ ...ctx(fixture.root), entry }),
    ).rejects.toThrow(/schemaVersion/);
  });

  it("throws on unknown command discriminator", async () => {
    const entry = commitEntry({ command: "release-clone" as AuditEntry["command"] });
    await expect(
      appendAuditEntry({ ...ctx(fixture.root), entry }),
    ).rejects.toThrow(/command/);
  });

  it("throws when interlockState.command does not match top-level command", async () => {
    const entry = commitEntry({
      interlockState: {
        command: "release-push",
        pushInterlock: { value: "on-sync", source: "git-config" },
        syncInterlock: { value: "on-handoff", source: "git-config" },
      },
    });
    await expect(
      appendAuditEntry({ ...ctx(fixture.root), entry }),
    ).rejects.toThrow(/interlockState/);
  });

  it("throws when outcome.kind is not allowed for the command (release-commit + push)", async () => {
    const entry = commitEntry({
      outcome: { kind: "push", refStatus: "fast-forward" },
    });
    await expect(
      appendAuditEntry({ ...ctx(fixture.root), entry }),
    ).rejects.toThrow(/outcome/);
  });

  it("throws when outcome.kind is not allowed for the command (sync + commit)", async () => {
    const entry = syncEntry({
      outcome: { kind: "commit", hash: "abc" },
    });
    await expect(
      appendAuditEntry({ ...ctx(fixture.root), entry }),
    ).rejects.toThrow(/outcome/);
  });

  it("allows hook-failed outcome for release-commit", async () => {
    const entry = commitEntry({
      outcome: { kind: "hook-failed", hook: "pre-commit", exitCode: 1 },
    });
    await expect(
      appendAuditEntry({ ...ctx(fixture.root), entry }),
    ).resolves.toEqual({ ok: true });
  });

  it("allows hook-failed outcome for release-push", async () => {
    const entry = pushEntry({
      outcome: { kind: "hook-failed", hook: "pre-push", exitCode: 1 },
    });
    await expect(
      appendAuditEntry({ ...ctx(fixture.root), entry }),
    ).resolves.toEqual({ ok: true });
  });

  it("rejects hook-failed outcome for sync (sync has no hook-failed arm)", async () => {
    const entry = syncEntry({
      outcome: { kind: "hook-failed", hook: "pre-push", exitCode: 1 },
    });
    await expect(
      appendAuditEntry({ ...ctx(fixture.root), entry }),
    ).rejects.toThrow(/outcome/);
  });

  it("throws when decision is `proceeded` but refusalCode is non-null", async () => {
    const entry = commitEntry({ decision: "proceeded", refusalCode: 10 });
    await expect(
      appendAuditEntry({ ...ctx(fixture.root), entry }),
    ).rejects.toThrow(/refusalCode/);
  });

  it("throws when decision is `refused` but refusalCode is null", async () => {
    const entry = commitEntry({
      decision: "refused",
      refusalCode: null,
      outcome: { kind: "refused" },
    });
    await expect(
      appendAuditEntry({ ...ctx(fixture.root), entry }),
    ).rejects.toThrow(/refusalCode/);
  });

  it("allows refused entries with refusalCode populated and outcome.kind === 'refused'", async () => {
    const entry = commitEntry({
      decision: "refused",
      refusalCode: 10,
      outcome: { kind: "refused" },
    });
    await expect(
      appendAuditEntry({ ...ctx(fixture.root), entry }),
    ).resolves.toEqual({ ok: true });
  });
});

describe("appendAuditEntry — I/O failure returns {ok: false}", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it("returns {ok: false, error} when `.internal` exists as a file (cannot create directory)", async () => {
    // Pre-create `.arc/user/alice/` and place `.internal` as a regular file at that level.
    const userDir = join(fixture.root, ".arc", "user", "alice");
    await mkdir(userDir, { recursive: true });
    await writeFile(join(userDir, ".internal"), "not a directory");

    const result = await appendAuditEntry({
      cwd: fixture.root,
      identity: "alice",
      entry: commitEntry(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });
});
