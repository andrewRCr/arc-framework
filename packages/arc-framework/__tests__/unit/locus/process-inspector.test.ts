/** Session-anchor selection and liveness coverage. */

import { describe, expect, it } from "vitest";

import {
  selectSessionAnchor,
  verifyProcessAnchor,
  type AncestorProcessSnapshot,
  type ProcessInspector,
} from "../../../src/lib/locus/process-inspector.js";

function process(
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
      process(30, 20, "node", { commandLine: "node /repo/dist/cli.js locus" }),
      process(20, 10, "npm exec", { commandLine: "npm exec arc locus" }),
      process(10, 1, identity),
    ]);
    expect(result).toMatchObject({ kind: "process", pid: 10, selector });
  });

  it("accepts only a directly verified interactive shell", () => {
    expect(selectSessionAnchor([
      process(20, 10, "/bin/zsh", { interactive: true, controllingTty: true }),
    ])).toMatchObject({ kind: "process", pid: 20, selector: "interactive-shell" });
    expect(selectSessionAnchor([
      process(20, 10, "/bin/zsh", { interactive: false, controllingTty: true }),
    ])).toMatchObject({ kind: "unverifiable" });
  });

  it("stops at unknown wrappers, shared hosts, ambiguity, and depth exhaustion", () => {
    const fixtures = [
      [process(30, 20, "mystery-wrapper"), process(20, 1, "codex")],
      [process(30, 20, "electron"), process(20, 1, "codex")],
      [process(30, 20, "codex"), process(20, 1, "claude")],
      Array.from({ length: 33 }, (_, index) => process(100 - index, 99 - index, "node", {
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
