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
  return structuredClone(report.recover);
}

function withoutKey(value: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([candidate]) => candidate !== key));
}

describe("lean recovery envelope schema", () => {
  it("asserts mapped producer defects with the registered contract identity", () => {
    const value = recovery();
    (value.recoveryFrame as { value: { kind: string } }).value.kind = "unknown";
    expect(() => assertSessionRecoverProbeResult(value)).toThrow(
      /session-recover-envelope: recoveryFrame\.value\.kind:/u,
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
    "releaseRouting",
    "derivedLocusState",
    "locusGuidance",
    "recoveryFrame",
    "loadSet",
  ])("requires the %s slot", (key) => {
    expect(SessionRecoverProbeResultSchema.safeParse(withoutKey(recovery(), key)).success).toBe(false);
  });

  it("rejects undeclared root keys and malformed mapped routing fields", () => {
    expect(SessionRecoverProbeResultSchema.safeParse({ ...recovery(), undeclared: true }).success).toBe(false);

    const invalidWorktree = recovery();
    (invalidWorktree.worktree as { value: { identity: { kind: string } } }).value.identity.kind = "other";
    expect(SessionRecoverProbeResultSchema.safeParse(invalidWorktree).success).toBe(false);
  });

  it("rejects undeclared dirty-state fields at the recovery slot", () => {
    const value = recovery();
    (value.dirty as { value: Record<string, unknown> }).value.unexpected = true;
    expect(() => assertSessionRecoverProbeResult(value)).toThrow(/dirty\.value:.*unexpected/u);
  });

  it("requires typed failure evidence exactly for an unreachable worktree read", () => {
    const unreachableWithoutReason = recovery();
    const unreachableWorktree = unreachableWithoutReason.worktree as {
      value: { remoteEvidence: string; failureReason?: string };
    };
    unreachableWorktree.value.remoteEvidence = "unreachable";
    expect(SessionRecoverProbeResultSchema.safeParse(unreachableWithoutReason).success).toBe(false);

    unreachableWorktree.value.failureReason = "network";
    expect(SessionRecoverProbeResultSchema.safeParse(unreachableWithoutReason).success).toBe(true);

    const exactWithReason = recovery();
    const exactWorktree = exactWithReason.worktree as {
      value: { remoteEvidence: string; failureReason?: string };
    };
    exactWorktree.value.remoteEvidence = "exact";
    exactWorktree.value.failureReason = "auth";
    expect(SessionRecoverProbeResultSchema.safeParse(exactWithReason).success).toBe(false);
  });

  it("requires strategic cursors and permits cursor evidence for resolved integration", () => {
    expect(SessionRecoverProbeResultSchema.safeParse(withoutKey(recovery(), "taskCursor")).success).toBe(false);

    const noTask = recovery();
    delete noTask.taskCursor;
    const loadSet = noTask.loadSet as { value: { entries: Array<{ readMode: { kind: string } }> } };
    loadSet.value.entries = loadSet.value.entries.filter((entry) => entry.readMode.kind !== "partial-strategic");
    expect(SessionRecoverProbeResultSchema.safeParse(noTask).success).toBe(true);

    noTask.taskCursor = recovery().taskCursor;
    expect(SessionRecoverProbeResultSchema.safeParse(noTask).success).toBe(false);

    const integration = structuredClone(noTask);
    const recoveryFrame = integration.recoveryFrame as {
      value: { workflow: string; sessionType: string };
    };
    recoveryFrame.value.workflow = "integrate-work-unit";
    recoveryFrame.value.sessionType = "integration";
    expect(SessionRecoverProbeResultSchema.safeParse(integration).success).toBe(true);

    delete integration.taskCursor;
    expect(SessionRecoverProbeResultSchema.safeParse(integration).success).toBe(true);
  });
});
