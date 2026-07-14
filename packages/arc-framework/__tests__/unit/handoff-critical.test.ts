/**
 * Unit tests for the handoff-critical command allowlist.
 *
 * Pins which commands must fail-fast against a stale dev build vs. warn-only —
 * including the compaction-seed exemption — without importing cli.ts (whose
 * module body parses and runs the CLI).
 */

import { describe, expect, it } from "vitest";

import { isHandoffCritical, type HandoffCommand } from "../../src/lib/handoff-critical.js";

function cmd(name: string, parentName: string | undefined, opts: Record<string, unknown> = {}): HandoffCommand {
  return { name, parentName, opts };
}

describe("isHandoffCritical", () => {
  it("refuses stale dist for cross-machine and gating commands", () => {
    expect(isHandoffCritical(cmd("sync", "arc"))).toBe(true);
    expect(isHandoffCritical(cmd("save", "user"))).toBe(true);
    expect(isHandoffCritical(cmd("push", "user"))).toBe(true);
    expect(isHandoffCritical(cmd("sync", "user"))).toBe(true);
    expect(isHandoffCritical(cmd("commit", "release"))).toBe(true);
    expect(isHandoffCritical(cmd("push", "release"))).toBe(true);
  });

  it("refuses stale dist for the session-init / session-handoff status probes", () => {
    expect(isHandoffCritical(cmd("status", "arc", { json: true, sessionInit: true }))).toBe(true);
    expect(isHandoffCritical(cmd("status", "arc", { json: true, sessionHandoff: true }))).toBe(true);
  });

  it("exempts the compaction-seed write so a recovery seed always emits", () => {
    const seed = cmd("status", "arc", { json: true, sessionInit: true, writeCompactionSeed: true });
    expect(isHandoffCritical(seed)).toBe(false);
  });

  it("does not refuse non-critical or non-probe status invocations", () => {
    expect(isHandoffCritical(cmd("status", "arc", { sessionInit: true }))).toBe(false); // not json
    expect(isHandoffCritical(cmd("status", "arc", { json: true }))).toBe(false); // no session flag
    expect(isHandoffCritical(cmd("status", "arc"))).toBe(false);
    expect(isHandoffCritical(cmd("log", "arc"))).toBe(false);
    expect(isHandoffCritical(cmd("commit", "arc"))).toBe(false); // not `release commit`
  });
});
