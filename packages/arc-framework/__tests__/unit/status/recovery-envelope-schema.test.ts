/** Strict contract coverage for the lean recovery status envelope. */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../helpers/schema-assertion.js";

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
    assertSchemaRefuses(SessionRecoverProbeResultSchema, withoutKey(recovery(), key));
  });

  it("rejects undeclared root keys and malformed mapped routing fields", () => {
    assertSchemaRefuses(SessionRecoverProbeResultSchema, { ...recovery(), undeclared: true });

    const invalidWorktree = recovery();
    (invalidWorktree.worktree as { value: { identity: { kind: string } } }).value.identity.kind = "other";
    assertSchemaRefuses(SessionRecoverProbeResultSchema, invalidWorktree);
  });

  it("rejects undeclared dirty-state fields at the recovery slot", () => {
    const value = recovery();
    (value.dirty as { value: Record<string, unknown> }).value.unexpected = true;
    expect(() => assertSessionRecoverProbeResult(value)).toThrow(/dirty\.value:.*unexpected/u);
  });

  it("rejects undeclared extension fields at the recovery slot", () => {
    const value = recovery();
    (value.extensions as { value: Record<string, unknown> }).value.unexpected = true;
    expect(() => assertSessionRecoverProbeResult(value)).toThrow(/extensions\.value:.*unexpected/u);
  });

  it("rejects undeclared config fields at the recovery slot", () => {
    const value = recovery();
    (value.config as { value: Record<string, unknown> }).value.unexpected = true;
    expect(() => assertSessionRecoverProbeResult(value)).toThrow(/config\.value:.*unexpected/u);
  });

  it("rejects undeclared release-routing fields at the recovery slot", () => {
    const value = recovery();
    const routing = (value.releaseRouting as { value: { rationale: Record<string, unknown> } }).value;
    routing.rationale.unexpected = true;
    expect(() => assertSessionRecoverProbeResult(value)).toThrow(/releaseRouting\.value\.rationale:.*unexpected/u);
  });

  it("rejects undeclared worktree fields at the recovery slot", () => {
    const value = recovery();
    (value.worktree as { value: Record<string, unknown> }).value.unexpected = true;
    expect(() => assertSessionRecoverProbeResult(value)).toThrow(/worktree\.value:.*unexpected/u);
  });

  it("requires typed failure evidence exactly for an unreachable worktree read", () => {
    const unreachableWithoutReason = recovery();
    const unreachableWorktree = unreachableWithoutReason.worktree as {
      value: { remoteEvidence: string; failureReason?: string };
    };
    unreachableWorktree.value.remoteEvidence = "unreachable";
    assertSchemaRefuses(SessionRecoverProbeResultSchema, unreachableWithoutReason);

    unreachableWorktree.value.failureReason = "network";
    assertSchemaAccepts(SessionRecoverProbeResultSchema, unreachableWithoutReason);

    const exactWithReason = recovery();
    const exactWorktree = exactWithReason.worktree as {
      value: { remoteEvidence: string; failureReason?: string };
    };
    exactWorktree.value.remoteEvidence = "exact";
    exactWorktree.value.failureReason = "auth";
    assertSchemaRefuses(SessionRecoverProbeResultSchema, exactWithReason);
  });

  it("requires strategic cursors and permits cursor evidence for resolved integration", () => {
    assertSchemaRefuses(SessionRecoverProbeResultSchema, withoutKey(recovery(), "taskCursor"));

    const noTask = recovery();
    delete noTask.taskCursor;
    const loadSet = noTask.loadSet as { value: { entries: Array<{ readMode: { kind: string } }> } };
    loadSet.value.entries = loadSet.value.entries.filter((entry) => entry.readMode.kind !== "partial-strategic");
    assertSchemaAccepts(SessionRecoverProbeResultSchema, noTask);

    noTask.taskCursor = recovery().taskCursor;
    assertSchemaRefuses(SessionRecoverProbeResultSchema, noTask);

    const integration = structuredClone(noTask);
    const recoveryFrame = integration.recoveryFrame as {
      value: { workflow: string; sessionType: string };
    };
    recoveryFrame.value.workflow = "integrate-work-unit";
    recoveryFrame.value.sessionType = "integration";
    assertSchemaAccepts(SessionRecoverProbeResultSchema, integration);

    delete integration.taskCursor;
    assertSchemaAccepts(SessionRecoverProbeResultSchema, integration);
  });
});
