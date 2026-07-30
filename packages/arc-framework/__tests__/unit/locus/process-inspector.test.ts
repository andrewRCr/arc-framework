/** Session-anchor selection and liveness coverage. */

import { describe, expect, it } from "vitest";

import {
  classifyLeaseAuthority,
  sameProcessAnchor,
  selectSessionAnchor,
  verifyProcessAnchor,
  type AncestorProcessSnapshot,
  type ProcessInspector,
} from "../../../src/lib/locus/process-inspector.js";

function snapshotOf(
  pid: number,
  parentPid: number,
  commandIdentity: string,
  extra: Partial<AncestorProcessSnapshot> = {},
): AncestorProcessSnapshot {
  return { pid, parentPid, commandIdentity, startToken: `start-${pid}`, ...extra };
}

describe("session anchor selection", () => {
  it.each([
    ["codex", "/opt/codex"],
    ["claude", "/usr/local/bin/claude"],
    ["gemini", "gemini"],
  ] as const)("selects a bounded %s session above exact wrappers", (selector, identity) => {
    const result = selectSessionAnchor([
      snapshotOf(30, 20, "node", { commandLine: "node /repo/dist/cli.js locus" }),
      snapshotOf(20, 10, "npm exec", { commandLine: "npm exec arc locus" }),
      snapshotOf(10, 1, identity),
    ]);
    expect(result).toMatchObject({ kind: "process", pid: 10, selector });
  });

  it("accepts only a directly verified interactive shell", () => {
    expect(selectSessionAnchor([
      snapshotOf(20, 10, "/bin/zsh", { interactive: true, controllingTty: true }),
    ])).toMatchObject({ kind: "process", pid: 20, selector: "interactive-shell" });
    expect(selectSessionAnchor([
      snapshotOf(20, 10, "/bin/zsh", { interactive: false, controllingTty: true }),
    ])).toMatchObject({ kind: "unverifiable" });
  });

  it("stops at unknown wrappers, shared hosts, ambiguity, and depth exhaustion", () => {
    const fixtures = [
      [snapshotOf(30, 20, "mystery-wrapper"), snapshotOf(20, 1, "codex")],
      [snapshotOf(30, 20, "electron"), snapshotOf(20, 1, "codex")],
      [snapshotOf(30, 20, "codex"), snapshotOf(20, 1, "claude")],
      Array.from({ length: 33 }, (_, index) => snapshotOf(100 - index, 99 - index, "node", {
        commandLine: "node /repo/dist/cli.js locus",
      })),
    ];
    for (const snapshots of fixtures) expect(selectSessionAnchor(snapshots)).toMatchObject({
      kind: "unverifiable",
    });
  });
});

describe("process-anchor liveness", () => {
  const anchor = {
    kind: "process" as const,
    pid: 42,
    startToken: "start-42",
    inspector: "fixture",
    selector: "codex",
  };

  it("requires exact PID and start-token equality", async () => {
    const inspector = (inspection: Awaited<ReturnType<ProcessInspector["inspect"]>>): ProcessInspector => ({
      kind: "fixture",
      inspect: async () => inspection,
    });
    await expect(verifyProcessAnchor(anchor, inspector({
      kind: "present", pid: 42, parentPid: 1, startToken: "start-42", commandIdentity: "codex",
    }))).resolves.toBe("live");
    await expect(verifyProcessAnchor(anchor, inspector({
      kind: "present", pid: 42, parentPid: 1, startToken: "new-generation", commandIdentity: "codex",
    }))).resolves.toBe("dead");
    await expect(verifyProcessAnchor(anchor, inspector({ kind: "absent" }))).resolves.toBe("dead");
    await expect(verifyProcessAnchor(anchor, inspector({ kind: "unverifiable", reason: "denied" })))
      .resolves.toBe("unknown");
  });
});

describe("lease authority", () => {
  const anchor = {
    kind: "process" as const,
    pid: 42,
    startToken: "start-42",
    inspector: "fixture",
    selector: "codex",
  };
  const inspector = (inspection: Awaited<ReturnType<ProcessInspector["inspect"]>>): ProcessInspector => ({
    kind: "fixture",
    inspect: async () => inspection,
  });
  const present = inspector({
    kind: "present", pid: 42, parentPid: 1, startToken: "start-42", commandIdentity: "codex",
  });

  it("resolves self when the recorded anchor names this process", async () => {
    await expect(classifyLeaseAuthority(anchor, present, anchor)).resolves.toBe("self");
  });

  it("resolves self without inspection, where inspection cannot reach", async () => {
    const exploded: ProcessInspector = {
      kind: "fixture",
      inspect: () => Promise.reject(new Error("process table is unreadable")),
    };
    await expect(classifyLeaseAuthority(anchor, exploded, anchor)).resolves.toBe("self");
    await expect(classifyLeaseAuthority(anchor, inspector({ kind: "unverifiable", reason: "denied" }), anchor))
      .resolves.toBe("self");
    await expect(classifyLeaseAuthority({ ...anchor, inspector: "other-platform" }, present, {
      ...anchor, inspector: "other-platform",
    })).resolves.toBe("self");
  });

  it("separates a foreign holder on every identity axis, selector included", async () => {
    await expect(classifyLeaseAuthority(anchor, present, { ...anchor, pid: 43 })).resolves.toBe("foreign");
    await expect(classifyLeaseAuthority(anchor, present, { ...anchor, startToken: "start-43" }))
      .resolves.toBe("foreign");
    await expect(classifyLeaseAuthority(anchor, present, { ...anchor, inspector: "other-platform" }))
      .resolves.toBe("foreign");
    await expect(classifyLeaseAuthority(anchor, present, { ...anchor, selector: "interactive-shell" }))
      .resolves.toBe("foreign");
  });

  it("shares one self-test with frame selection", () => {
    expect(sameProcessAnchor(anchor, anchor)).toBe(true);
    expect(sameProcessAnchor(anchor, { ...anchor, selector: "interactive-shell" })).toBe(false);
    expect(sameProcessAnchor(null, anchor)).toBe(false);
    expect(sameProcessAnchor(anchor, { kind: "unverifiable", reason: "shared host" })).toBe(false);
  });

  it("falls back to liveness when this process has no verifiable anchor of its own", async () => {
    const own = { kind: "unverifiable" as const, reason: "shared host" };
    await expect(classifyLeaseAuthority(anchor, present, own)).resolves.toBe("foreign");
    await expect(classifyLeaseAuthority(anchor, inspector({ kind: "absent" }), own)).resolves.toBe("dead");
    await expect(classifyLeaseAuthority(anchor, inspector({ kind: "unverifiable", reason: "denied" }), own))
      .resolves.toBe("unverifiable");
  });

  it("leaves occupancy liveness reading live for a self-held lease", async () => {
    await expect(classifyLeaseAuthority(anchor, present, anchor)).resolves.toBe("self");
    await expect(verifyProcessAnchor(anchor, present)).resolves.toBe("live");
  });
});
