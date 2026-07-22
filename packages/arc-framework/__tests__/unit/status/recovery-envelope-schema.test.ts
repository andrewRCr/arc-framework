/** Strict contract coverage for the lean recovery status envelope. */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertSessionRecoverProbeResult,
  SessionRecoverProbeResultSchema,
} from "../../../src/commands/status/schema.js";

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
  const value = structuredClone(report.recover);
  value.locusState = {
    ok: true,
    value: {
      roster: { mode: "locus", ok: true, primaryPath: "/repo", rows: [], diagnostics: [] },
      current: { kind: "none" },
      primaryAvailability: { kind: "free", checkoutPath: "/repo" },
      inFlightIdentities: [],
      recovery: { kind: "none" },
      reconciliation: { kind: "clean" },
    },
  };
  value.recoveryFrame = {
    ok: true,
    value: {
      kind: "resolved",
      workflow: "process-task-loop",
      sessionType: "execution",
      activeRecordId: `sha256:${"a".repeat(64)}`,
      parentRecordId: null,
    },
  };
  value.cohortDocPath = ".arc/backlog/planned/fixture-cohort/cohort-fixture-cohort.md";
  value.loadSet = {
    ok: true,
    value: {
      manifestVersion: 1,
      entries: [
        { path: ".arc/active/tasks-active-widget.md", readMode: { kind: "partial-strategic" } },
      ],
    },
  };
  value.taskCursor = {
    ok: true,
    value: {
      status: "found",
      cursor: {
        section: { id: "1.1", title: "Exercise the envelope", lineHint: 11 },
        leaf: { id: "1.1", title: "Exercise the envelope", lineHint: 11 },
      },
    },
  };
  return value;
}

function withoutKey(value: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([candidate]) => candidate !== key));
}

describe("lean recovery envelope schema", () => {
  it("validates additive precomposed locus guidance when present", () => {
    const value = recovery();
    value.locusGuidance = { kind: "unavailable", message: "Locus state is unavailable." };
    expect(SessionRecoverProbeResultSchema.safeParse(value).success).toBe(true);
    value.locusGuidance = { kind: "ready", currentFrame: 42 };
    expect(SessionRecoverProbeResultSchema.safeParse(value).success).toBe(false);
  });

  it("asserts mapped producer defects with the registered contract identity", () => {
    const value = recovery();
    (value.active as { value: { resolution: string } }).value.resolution = "ambiguous";
    expect(() => assertSessionRecoverProbeResult(value)).toThrow(
      /session-recover-envelope: active\.value\.resolution:/u,
    );
  });

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
    "locusState",
    "recoveryFrame",
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

  it("requires a cursor exactly when the locus-derived load set has a strategic task list", () => {
    expect(SessionRecoverProbeResultSchema.safeParse(withoutKey(recovery(), "taskCursor")).success).toBe(false);

    const noTask = recovery();
    delete noTask.taskCursor;
    delete noTask.cohortDocPath;
    const loadSet = noTask.loadSet as { value: { entries: Array<{ readMode: { kind: string } }> } };
    loadSet.value.entries = loadSet.value.entries.filter((entry) => entry.readMode.kind !== "partial-strategic");
    expect(SessionRecoverProbeResultSchema.safeParse(noTask).success).toBe(true);

    noTask.taskCursor = recovery().taskCursor;
    expect(SessionRecoverProbeResultSchema.safeParse(noTask).success).toBe(false);
  });
});
