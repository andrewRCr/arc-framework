/** Unit coverage for the release audit-entry schema family. */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  AuditEntrySchema,
  RefusalCodeSchema,
} from "../../../src/lib/release/schema.js";
import {
  ConfigOverrideSourceSchema,
  createResolvedConfigOverrideSchema,
} from "../../../src/lib/config/resolve-override.js";

function common(command: "release-commit" | "release-push" | "sync") {
  return {
    schemaVersion: 2,
    timestamp: "2026-07-21T00:00:00.000Z",
    command,
    args: [],
    wu: null,
  } as const;
}

const commitInterlocks = {
  command: "release-commit",
  commitInterlock: { value: "on-workflow", source: "git-config" },
  pushInterlock: { value: "on-workflow", source: "git-config" },
} as const;

const pushInterlocks = {
  command: "release-push",
  pushInterlock: { value: "on-workflow", source: "git-config" },
  syncInterlock: { value: "on-workflow", source: "git-config" },
} as const;

const syncInterlocks = {
  command: "sync",
  pushInterlock: { value: "on-workflow", source: "git-config" },
  notesPush: { value: "on-sync", source: "yaml" },
  syncInterlock: { value: "on-workflow", source: "default" },
} as const;

const syncOutcome = {
  kind: "sync",
  cell: "clean",
  worktree: "ran",
  notes: "ran",
  exitCode: 0,
} as const;

describe("AuditEntrySchema", () => {
  it("accepts a proceeded release-commit record", () => {
    const entry = {
      schemaVersion: 2,
      timestamp: "2026-07-21T00:00:00.000Z",
      command: "release-commit",
      args: ["-m", "<redacted>"],
      wu: { name: "cli-validation-surfaces" },
      interlockState: {
        command: "release-commit",
        commitInterlock: { value: "on-workflow", source: "git-config" },
        pushInterlock: { value: "on-workflow", source: "git-config" },
      },
      decision: "proceeded",
      refusalCode: null,
      outcome: { kind: "commit", hash: "abc1234" },
    };

    expect(AuditEntrySchema.parse(entry)).toEqual(entry);
  });

  it.each([
    { outcome: { kind: "commit", hash: "abc1234" } },
    { outcome: { kind: "hook-failed", hook: "pre-commit", exitCode: 1 } },
  ])("accepts proceeded release-commit outcome $outcome.kind", ({ outcome }) => {
    expect(AuditEntrySchema.safeParse({
      ...common("release-commit"),
      interlockState: commitInterlocks,
      decision: "proceeded",
      refusalCode: null,
      outcome,
    }).success).toBe(true);
  });

  it.each([10, 11, 12, 13])("accepts release-commit refusal code %i", (refusalCode) => {
    expect(AuditEntrySchema.safeParse({
      ...common("release-commit"),
      interlockState: commitInterlocks,
      decision: "refused",
      refusalCode,
      outcome: { kind: "refused" },
    }).success).toBe(true);
  });

  it.each(["validation", "input"])("accepts release-commit preflight reason %s", (reason) => {
    expect(AuditEntrySchema.safeParse({
      ...common("release-commit"),
      interlockState: commitInterlocks,
      decision: "refused",
      refusalCode: 16,
      outcome: { kind: "preflight-failed", reason },
    }).success).toBe(true);
  });

  it.each([
    { decision: "proceeded", refusalCode: null, outcome: { kind: "push", refStatus: "fast-forward" } },
    { decision: "proceeded", refusalCode: null, outcome: { kind: "hook-failed", hook: "pre-push", exitCode: 1 } },
    ...[10, 11, 12, 13, 14, 15].map((refusalCode) => ({
      decision: "refused",
      refusalCode,
      outcome: { kind: "refused" },
    })),
  ])("accepts release-push cell $decision/$refusalCode/$outcome.kind", (cell) => {
    expect(AuditEntrySchema.safeParse({
      ...common("release-push"),
      interlockState: pushInterlocks,
      ...cell,
    }).success).toBe(true);
  });

  it.each([
    { decision: "proceeded", refusalCode: null },
    { decision: "refused", refusalCode: 14 },
  ])("accepts sync cell $decision/$refusalCode", (cell) => {
    expect(AuditEntrySchema.safeParse({
      ...common("sync"),
      interlockState: syncInterlocks,
      ...cell,
      outcome: syncOutcome,
    }).success).toBe(true);
  });

  it.each([
    { label: "command/interlock", entry: { ...common("release-commit"), interlockState: pushInterlocks, decision: "proceeded", refusalCode: null, outcome: { kind: "commit", hash: "abc" } } },
    { label: "decision/code", entry: { ...common("release-commit"), interlockState: commitInterlocks, decision: "proceeded", refusalCode: 10, outcome: { kind: "commit", hash: "abc" } } },
    { label: "code/outcome", entry: { ...common("release-commit"), interlockState: commitInterlocks, decision: "refused", refusalCode: 16, outcome: { kind: "refused" } } },
    { label: "command/outcome", entry: { ...common("release-push"), interlockState: pushInterlocks, decision: "proceeded", refusalCode: null, outcome: { kind: "commit", hash: "abc" } } },
    { label: "refused sync shape", entry: { ...common("sync"), interlockState: syncInterlocks, decision: "refused", refusalCode: 14, outcome: { kind: "refused" } } },
  ])("rejects a $label mismatch", ({ entry }) => {
    expect(AuditEntrySchema.safeParse(entry).success).toBe(false);
  });

  it.each([
    { ...common("release-commit"), interlockState: commitInterlocks, decision: "proceeded", refusalCode: null, outcome: { kind: "commit", hash: "abc" }, extra: true },
    { ...common("release-commit"), interlockState: { ...commitInterlocks, extra: true }, decision: "proceeded", refusalCode: null, outcome: { kind: "commit", hash: "abc" } },
    { ...common("release-commit"), interlockState: commitInterlocks, decision: "proceeded", refusalCode: null, outcome: { kind: "commit", hash: "abc", extra: true } },
  ])("rejects unknown keys at every record level", (entry) => {
    expect(AuditEntrySchema.safeParse(entry).success).toBe(false);
  });

  it("projects the complete schema to JSON Schema", () => {
    expect(() => z.toJSONSchema(AuditEntrySchema)).not.toThrow();
  });
});

describe("audit schema primitives", () => {
  it("derives the complete refusal-code domain", () => {
    expect(RefusalCodeSchema.options.map((option) => option.value)).toEqual([
      10, 11, 12, 13, 14, 15, 16,
    ]);
  });

  it("builds strict setting-specific resolved-override schemas", () => {
    const schema = createResolvedConfigOverrideSchema(z.enum(["manual", "on-workflow"]));

    expect(schema.parse({ value: "manual", source: "default" })).toEqual({
      value: "manual",
      source: "default",
    });
    expect(schema.safeParse({ value: "invalid", source: "default" }).success).toBe(false);
    expect(schema.safeParse({ value: "manual", source: "unknown" }).success).toBe(false);
    expect(schema.safeParse({ value: "manual", source: "default", extra: true }).success).toBe(false);
    expect(ConfigOverrideSourceSchema.options).toEqual(["git-config", "yaml", "default"]);
  });
});
