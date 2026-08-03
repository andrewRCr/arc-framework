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

  it("walks the shipped PreCompact seed hook to the durable Codex process", async () => {
    const entries = new Map<number, AncestorProcessInspection>([
      [40, {
        kind: "present",
        snapshot: snapshot(40, 30, "node", "node /repo/dist/cli.js status --session-init --write-compaction-seed --json"),
      }],
      [30, {
        kind: "present",
        snapshot: snapshot(30, 20, "/bin/sh", "sh -c arc status --session-init --write-compaction-seed --json"),
      }],
      [20, {
        kind: "present",
        snapshot: snapshot(
          20,
          15,
          "/usr/bin/node",
          "node /repo/.arc/system/.internal/harness-hooks/common/pre-compact-seed.mjs",
        ),
      }],
      [15, {
        kind: "present",
        snapshot: snapshot(
          15,
          10,
          "/bin/bash",
          "bash -lc 'repo_root=$(git rev-parse --show-toplevel)"
            + " && cd $repo_root"
            + " && ARC_HOOK_HARNESS=codex-cli node $primary/.arc/system/.internal/harness-hooks/common/pre-compact-seed.mjs"
            + " || exit 0'",
        ),
      }],
      [10, { kind: "present", snapshot: snapshot(10, 1, "/opt/codex", "codex") }],
    ]);

    await expect(acquireSessionAnchor(40, inspector(entries))).resolves.toEqual({
      kind: "process", pid: 10, startToken: "start-10", inspector: "fixture-native", selector: "codex",
    });
  });

  it("walks the shipped Windows PreCompact hook to the durable Codex process", async () => {
    const hookCommand = String.raw`for /f "delims=" %i in ('git rev-parse --show-toplevel') do for /f "delims=" %j in ('git rev-parse --path-format=absolute --git-common-dir') do (cd /d "%i" && set "ARC_HOOK_HARNESS=codex-cli" && node "%j\..\.arc\system\.internal\harness-hooks\common\pre-compact-seed.mjs") || exit /b 0`;
    const entries = new Map<number, AncestorProcessInspection>([
      [50, {
        kind: "present",
        snapshot: snapshot(50, 40, "node.exe", "node.exe C:\\repo\\dist\\cli.js status --session-init --write-compaction-seed --json"),
      }],
      [40, {
        kind: "present",
        snapshot: snapshot(40, 30, String.raw`C:\Windows\System32\cmd.exe`,
          'cmd.exe /d /s /c "arc status --session-init --write-compaction-seed --json"'),
      }],
      [30, {
        kind: "present",
        snapshot: snapshot(30, 20, "node.exe",
          String.raw`node.exe C:\repo\.arc\system\.internal\harness-hooks\common\pre-compact-seed.mjs`),
      }],
      [20, {
        kind: "present",
        snapshot: snapshot(20, 10, String.raw`C:\Windows\System32\cmd.exe`, `cmd.exe /d /s /c "${hookCommand}"`),
      }],
      [10, { kind: "present", snapshot: snapshot(10, 1, String.raw`C:\tools\codex.exe`, "codex.exe") }],
    ]);

    await expect(acquireSessionAnchor(50, inspector(entries))).resolves.toEqual({
      kind: "process", pid: 10, startToken: "start-10", inspector: "fixture-native", selector: "codex",
    });
  });

  it("walks a flattened BSD PreCompact hook command to the durable Codex process", async () => {
    const flattenedHook = "sh -c repo_root=\"$(git rev-parse --show-toplevel)\""
      + " && primary=\"$(dirname \"$(git rev-parse --path-format=absolute --git-common-dir)\")\""
      + " && cd \"$repo_root\""
      + " && ARC_HOOK_HARNESS=codex-cli node"
      + " \"$primary/.arc/system/.internal/harness-hooks/common/pre-compact-seed.mjs\" || exit 0";
    const entries = new Map<number, AncestorProcessInspection>([
      [20, { kind: "present", snapshot: snapshot(20, 10, "/bin/sh", flattenedHook) }],
      [10, { kind: "present", snapshot: snapshot(10, 1, "/opt/codex", "codex") }],
    ]);

    await expect(acquireSessionAnchor(20, inspector(entries))).resolves.toEqual({
      kind: "process", pid: 10, startToken: "start-10", inspector: "fixture-native", selector: "codex",
    });
  });

  it("walks a proven ARC shell wrapper even when it inherits an interactive terminal", async () => {
    const entries = new Map<number, AncestorProcessInspection>([
      [20, {
        kind: "present",
        snapshot: {
          ...snapshot(20, 10, "/bin/bash", "bash -lc npx arc status"),
          interactive: true,
          controllingTty: true,
        },
      }],
      [10, { kind: "present", snapshot: snapshot(10, 1, "/opt/codex", "codex") }],
    ]);

    await expect(acquireSessionAnchor(20, inspector(entries))).resolves.toEqual({
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
      [20, {
        kind: "present",
        snapshot: {
          ...snapshot(20, 15, "/opt/node/bin/node", "npm exec arc recover audit --json"),
          commandArguments: ["npm exec arc recover audit --json"],
        },
      }],
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

  it("walks the snapshot-sourcing agent tool shell to the versioned harness binary", async () => {
    const toolShell = "/bin/bash -c source /home/dev/.claude/shell-snapshots/snapshot-bash-1784721318921-6hnnbc.sh"
      + " 2>/dev/null || true && shopt -u extglob 2>/dev/null || true"
      + " && eval 'pwd && npx arc status --session-init --json' < /dev/null && pwd -P >| /tmp/claude-cwd";
    const entries = new Map<number, AncestorProcessInspection>([
      [40, { kind: "present", snapshot: snapshot(40, 30, "node", "node /repo/dist/cli.js status --session-init --json") }],
      [30, {
        kind: "present",
        snapshot: snapshot(30, 20, "/opt/node/bin/node", "npm exec arc status --session-init --json"),
      }],
      [20, { kind: "present", snapshot: snapshot(20, 10, "/usr/bin/bash", toolShell) }],
      [10, {
        kind: "present",
        snapshot: snapshot(10, 1, "/home/dev/.local/share/claude/versions/2.1.217", "claude"),
      }],
    ]);

    await expect(acquireSessionAnchor(40, inspector(entries))).resolves.toEqual({
      kind: "process", pid: 10, startToken: "start-10", inspector: "fixture-native", selector: "claude",
    });
  });

  it("uses the exact shell operand when snapshot and working paths contain spaces", async () => {
    const command = "source '/home/dev/ARC Project/.claude/shell-snapshots/snapshot-bash-1.sh'"
      + " 2>/dev/null || true && eval 'cd \"/home/dev/ARC Project\" && npx arc status' < /dev/null";
    const entries = new Map<number, AncestorProcessInspection>([
      [20, {
        kind: "present",
        snapshot: {
          ...snapshot(20, 10, "/usr/bin/bash", `/usr/bin/bash -c ${command}`),
          commandArguments: ["/usr/bin/bash", "-c", command],
        },
      }],
      [10, {
        kind: "present",
        snapshot: snapshot(10, 1, "/home/dev/.local/share/claude/versions/2.1.217", "claude"),
      }],
    ]);

    await expect(acquireSessionAnchor(20, inspector(entries))).resolves.toEqual({
      kind: "process", pid: 10, startToken: "start-10", inspector: "fixture-native", selector: "claude",
    });
  });

  it("does not trust ARC text outside the exact snapshot-shell operand", async () => {
    const commandLine = "/usr/bin/bash -c source /home/dev/.claude/shell-snapshots/snapshot-bash-1.sh"
      + " && eval 'npx arc status'";
    const entries = new Map<number, AncestorProcessInspection>([
      [20, {
        kind: "present",
        snapshot: {
          ...snapshot(20, 10, "/usr/bin/bash", commandLine),
          commandArguments: ["/usr/bin/bash", "-c", "printf harmless"],
        },
      }],
      [10, { kind: "present", snapshot: snapshot(10, 1, "/opt/codex", "codex") }],
    ]);

    await expect(acquireSessionAnchor(20, inspector(entries))).resolves.toEqual({
      kind: "unverifiable", reason: "Unrecognized process boundary: /usr/bin/bash",
    });
  });

  it("does not trust quoted source and eval text as shell commands", async () => {
    const command = "printf 'source \"/tmp/shell-snapshots/snapshot-1.sh\"; eval \"arc\"'";
    const entries = new Map<number, AncestorProcessInspection>([
      [20, {
        kind: "present",
        snapshot: {
          ...snapshot(20, 10, "/usr/bin/bash", `/usr/bin/bash -c ${command}`),
          commandArguments: ["/usr/bin/bash", "-c", command],
        },
      }],
      [10, { kind: "present", snapshot: snapshot(10, 1, "/opt/codex", "codex") }],
    ]);

    await expect(acquireSessionAnchor(20, inspector(entries))).resolves.toEqual({
      kind: "unverifiable", reason: "Unrecognized process boundary: /usr/bin/bash",
    });
  });

  it("refuses the agent tool shell when its eval payload does not invoke arc", async () => {
    const toolShell = "/bin/bash -c source /home/dev/.claude/shell-snapshots/snapshot-bash-1.sh 2>/dev/null || true"
      + " && eval 'cd /repo/arc-framework && make build' < /dev/null";
    const entries = new Map<number, AncestorProcessInspection>([
      [20, { kind: "present", snapshot: snapshot(20, 10, "/usr/bin/bash", toolShell) }],
      [10, {
        kind: "present",
        snapshot: snapshot(10, 1, "/home/dev/.local/share/claude/versions/2.1.217", "claude"),
      }],
    ]);

    await expect(acquireSessionAnchor(20, inspector(entries))).resolves.toEqual({
      kind: "unverifiable", reason: "Unrecognized process boundary: /usr/bin/bash",
    });
  });

  it("refuses an arbitrary Node command that merely mentions npm exec arc", async () => {
    const entries = new Map<number, AncestorProcessInspection>([
      [30, {
        kind: "present",
        snapshot: snapshot(30, 10, "/opt/node/bin/node", "node other.js npm exec arc status"),
      }],
      [10, { kind: "present", snapshot: snapshot(10, 1, "/opt/codex", "codex") }],
    ]);

    await expect(acquireSessionAnchor(30, inspector(entries))).resolves.toEqual({
      kind: "unverifiable", reason: "Unrecognized process boundary: /opt/node/bin/node",
    });
  });

  it.each([
    "/repo/tools/pre-compact-seed.mjs",
    "/repo/.arc/system/.internal/harness-hooks/common/pre-compact-seed.mjs.backup",
  ])("refuses a Node script outside the exact shipped PreCompact hook path: %s", async (script) => {
    const entries = new Map<number, AncestorProcessInspection>([
      [20, { kind: "present", snapshot: snapshot(20, 10, "/usr/bin/node", `node ${script}`) }],
      [10, { kind: "present", snapshot: snapshot(10, 1, "/opt/codex", "codex") }],
    ]);

    await expect(acquireSessionAnchor(20, inspector(entries))).resolves.toEqual({
      kind: "unverifiable", reason: "Unrecognized process boundary: /usr/bin/node",
    });
  });

  it.each([
    ["Node", "/opt/node/bin/node", "node /repo/tool.js /repo/dist/cli.js status"],
    ["npm", "/opt/node/bin/npm", "npm exec prettier -- arc"],
    ["npx", "/opt/node/bin/npx", "npx prettier arc"],
  ])("refuses an unrelated %s process with a later ARC-shaped argument", async (
    _name,
    commandIdentity,
    commandLine,
  ) => {
    const entries = new Map<number, AncestorProcessInspection>([
      [30, { kind: "present", snapshot: snapshot(30, 10, commandIdentity, commandLine) }],
      [10, { kind: "present", snapshot: snapshot(10, 1, "/opt/codex", "codex") }],
    ]);

    await expect(acquireSessionAnchor(30, inspector(entries))).resolves.toEqual({
      kind: "unverifiable", reason: `Unrecognized process boundary: ${commandIdentity}`,
    });
  });

  it("uses preserved process arguments instead of ambiguous display text", async () => {
    const commandIdentity = "/opt/node/bin/node";
    const entries = new Map<number, AncestorProcessInspection>([
      [30, {
        kind: "present",
        snapshot: {
          ...snapshot(30, 10, commandIdentity, "node /repo/dist/cli.js status"),
          commandArguments: ["node", "/repo/tool.js", "/repo/dist/cli.js", "status"],
        },
      }],
      [10, { kind: "present", snapshot: snapshot(10, 1, "/opt/codex", "codex") }],
    ]);

    await expect(acquireSessionAnchor(30, inspector(entries))).resolves.toEqual({
      kind: "unverifiable", reason: `Unrecognized process boundary: ${commandIdentity}`,
    });
  });

  it("does not reinterpret an unrelated flattened Node process title as npm", async () => {
    const commandIdentity = "/opt/node/bin/node";
    const entries = new Map<number, AncestorProcessInspection>([
      [30, {
        kind: "present",
        snapshot: {
          ...snapshot(30, 10, commandIdentity, "node other.js npm exec arc status"),
          commandArguments: ["node other.js npm exec arc status"],
        },
      }],
      [10, { kind: "present", snapshot: snapshot(10, 1, "/opt/codex", "codex") }],
    ]);

    await expect(acquireSessionAnchor(30, inspector(entries))).resolves.toEqual({
      kind: "unverifiable", reason: `Unrecognized process boundary: ${commandIdentity}`,
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
