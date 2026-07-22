/** Production-facing process ancestry acquisition tests. */

import { describe, expect, it } from "vitest";

import {
  acquireSessionAnchor,
  type AncestorProcessInspection,
  type AncestorProcessSnapshot,
  type ProcessAncestryInspector,
} from "../../../src/lib/locus/process-inspector.js";

function snapshot(
  pid: number,
  parentPid: number,
  commandIdentity: string,
  commandLine?: string,
): AncestorProcessSnapshot {
  return { pid, parentPid, commandIdentity, commandLine, startToken: `start-${pid}` };
}

function inspector(entries: ReadonlyMap<number, AncestorProcessInspection>): ProcessAncestryInspector {
  return {
    kind: "fixture-native",
    inspectAncestor: async (pid) => entries.get(pid) ?? { kind: "absent" },
  };
}

describe("session anchor acquisition", () => {
  it("walks recognized CLI wrappers and stops at the durable harness process", async () => {
    const entries = new Map<number, AncestorProcessInspection>([
      [30, { kind: "present", snapshot: snapshot(30, 20, "node", "node /repo/dist/cli.js errand open x") }],
      [20, { kind: "present", snapshot: snapshot(20, 15, "npx", "npx arc errand open x") }],
      [15, { kind: "present", snapshot: snapshot(15, 10, "/bin/bash", "bash -lc npx arc errand open x") }],
      [10, { kind: "present", snapshot: snapshot(10, 1, "/opt/codex", "codex") }],
    ]);

    await expect(acquireSessionAnchor(30, inspector(entries))).resolves.toEqual({
      kind: "process", pid: 10, startToken: "start-10", inspector: "fixture-native", selector: "codex",
    });
  });

  it("walks the quoted npm dash wrapper used by npx on Ubuntu", async () => {
    const entries = new Map<number, AncestorProcessInspection>([
      [40, { kind: "present", snapshot: snapshot(40, 30, "node", "node /repo/dist/cli.js recover audit --json") }],
      [30, {
        kind: "present",
        snapshot: snapshot(30, 20, "/usr/bin/dash", 'sh -c "arc" recover audit --json'),
      }],
      [20, { kind: "present", snapshot: snapshot(20, 15, "npm", "npm exec arc recover audit --json") }],
      [15, {
        kind: "present",
        snapshot: snapshot(15, 10, "/bin/bash", "bash -c npx arc recover audit --json"),
      }],
      [10, { kind: "present", snapshot: snapshot(10, 1, "/opt/codex", "codex") }],
    ]);

    await expect(acquireSessionAnchor(40, inspector(entries))).resolves.toEqual({
      kind: "process", pid: 10, startToken: "start-10", inspector: "fixture-native", selector: "codex",
    });
  });

  it("refuses dash when it is not a proven ARC wrapper", async () => {
    const entries = new Map<number, AncestorProcessInspection>([
      [30, { kind: "present", snapshot: snapshot(30, 10, "/usr/bin/dash", 'sh -c "other" status') }],
      [10, { kind: "present", snapshot: snapshot(10, 1, "/opt/codex", "codex") }],
    ]);

    await expect(acquireSessionAnchor(30, inspector(entries))).resolves.toEqual({
      kind: "unverifiable", reason: "Unrecognized process boundary: /usr/bin/dash",
    });
  });

  it.each([
    ["unknown boundary", new Map([[30, { kind: "present" as const, snapshot: snapshot(30, 10, "node", "node other.js") }]])],
    ["missing parent", new Map([[30, { kind: "present" as const, snapshot: snapshot(30, 20, "node", "node arc.js") }]])],
    ["unverifiable parent", new Map([
      [30, { kind: "present" as const, snapshot: snapshot(30, 20, "node", "node arc.js") }],
      [20, { kind: "unverifiable" as const, reason: "permission denied" }],
    ])],
    ["cycle", new Map([
      [30, { kind: "present" as const, snapshot: snapshot(30, 20, "node", "node arc.js") }],
      [20, { kind: "present" as const, snapshot: snapshot(20, 30, "npx", "npx arc status") }],
    ])],
  ])("refuses %s without selecting a short-lived child", async (_name, entries) => {
    await expect(acquireSessionAnchor(30, inspector(entries)))
      .resolves.toMatchObject({ kind: "unverifiable" });
  });
});
