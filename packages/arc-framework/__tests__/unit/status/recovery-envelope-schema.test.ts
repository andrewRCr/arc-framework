/** Strict contract coverage for the lean recovery status envelope. */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SessionRecoverProbeResultSchema } from "../../../src/commands/status/schema.js";

const READY_PATH = join(
  import.meta.dirname,
  "..",
  "..",
  "fixtures",
  "session-envelope",
  "recovery-audit-ready.json",
);

function recovery(): Record<string, unknown> {
  const report = JSON.parse(readFileSync(READY_PATH, "utf8")) as { recover: Record<string, unknown> };
  return structuredClone(report.recover);
}

function withoutKey(value: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([candidate]) => candidate !== key));
}

describe("lean recovery envelope schema", () => {
  it("accepts the characterized recovery value and preserves nested payloads", () => {
    const value = recovery();
    expect(SessionRecoverProbeResultSchema.parse(value)).toEqual(value);
  });

  it.each([
    "mode",
    "identity",
    "worktree",
    "dirty",
    "extensions",
    "config",
    "active",
    "releaseRouting",
    "loadSet",
  ])("requires the %s slot", (key) => {
    expect(SessionRecoverProbeResultSchema.safeParse(withoutKey(recovery(), key)).success).toBe(false);
  });

  it("rejects undeclared root keys and malformed mapped routing fields", () => {
    expect(SessionRecoverProbeResultSchema.safeParse({ ...recovery(), undeclared: true }).success).toBe(false);

    const invalidActive = recovery();
    (invalidActive.active as { value: { resolution: string } }).value.resolution = "ambiguous";
    expect(SessionRecoverProbeResultSchema.safeParse(invalidActive).success).toBe(false);

    const invalidWorktree = recovery();
    (invalidWorktree.worktree as { value: { identity: { kind: string } } }).value.identity.kind = "other";
    expect(SessionRecoverProbeResultSchema.safeParse(invalidWorktree).success).toBe(false);
  });

  it("allows cohort omission but rejects it outside a single active path", () => {
    expect(SessionRecoverProbeResultSchema.safeParse(withoutKey(recovery(), "cohortDocPath")).success).toBe(true);

    const invalid = recovery();
    (invalid.active as { value: { resolution: string; path: string | null } }).value.resolution = "none";
    (invalid.active as { value: { resolution: string; path: string | null } }).value.path = null;
    delete invalid.taskCursor;
    expect(SessionRecoverProbeResultSchema.safeParse(invalid).success).toBe(false);
  });

  it("requires a cursor exactly when the active task-list path is safe", () => {
    expect(SessionRecoverProbeResultSchema.safeParse(withoutKey(recovery(), "taskCursor")).success).toBe(false);

    const noTask = recovery();
    delete noTask.taskCursor;
    delete noTask.cohortDocPath;
    const active = noTask.active as { value: { taskListPath: string | null } };
    active.value.taskListPath = null;
    expect(SessionRecoverProbeResultSchema.safeParse(noTask).success).toBe(true);

    noTask.taskCursor = recovery().taskCursor;
    expect(SessionRecoverProbeResultSchema.safeParse(noTask).success).toBe(false);
  });
});
