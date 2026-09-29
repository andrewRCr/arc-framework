import { describe, expect, it } from "vitest";

import {
  createSessionRemoteContextReader,
  sessionRemotePrerequisites,
} from "../../../src/handlers/status-remote-context.js";
import type { GitExec, GitExecInput } from "../../../src/lib/git/exec.js";
import { makeGitProcessError } from "../../helpers/git-exec-fake.js";

const oid = "a".repeat(40);

describe("sessionRemotePrerequisites", () => {
  it("preserves the supplied availability and history objects", () => {
    const objectAvailability = { kind: "complete" as const, commits: { [oid]: true } };
    const history = { kind: "shallow" as const };
    const result = sessionRemotePrerequisites({
      kind: "available",
      snapshot: { kind: "available", scope: "all-heads", tips: { main: oid } },
      objectAvailability,
      history,
    });

    expect(result.kind).toBe("supplied");
    if (result.kind === "supplied") {
      expect(result.objectAvailability).toBe(objectAvailability);
      expect(result.history).toBe(history);
    }
  });

  it("carries unreachable evidence without inventing local prerequisite facts", () => {
    const snapshot = { kind: "unreachable" as const, failureReason: "auth" as const };
    const result = sessionRemotePrerequisites({ kind: "unreachable", snapshot });

    expect(result).toEqual({
      kind: "supplied",
      snapshot,
      objectAvailability: { kind: "unavailable", reason: "execution" },
      history: { kind: "unavailable", reason: "execution" },
    });
  });

  it("raises for an unavailable prerequisite rather than substituting evidence", () => {
    expect(() => sessionRemotePrerequisites({
      kind: "unavailable",
      prerequisite: "remote-configuration",
    })).toThrow("Session remote prerequisite failed: remote-configuration.");
  });

  it("preserves disabled-sync and no-origin short-circuits", () => {
    const disabled = { kind: "not-needed" as const, reason: "remote-sync-disabled" as const };
    const noRemote = { kind: "not-needed" as const, reason: "no-remote" as const };

    expect(sessionRemotePrerequisites(disabled)).toBe(disabled);
    expect(sessionRemotePrerequisites(noRemote)).toBe(noRemote);
  });
});

describe("createSessionRemoteContextReader", () => {
  it("memoizes one immutable all-heads context with local prerequisites", async () => {
    const calls: string[] = [];
    const exec: GitExec = async (_command, args) => {
      calls.push(args.join(" "));
      if (args[0] === "remote") return { stdout: "origin\n", stderr: "" };
      if (args[0] === "ls-remote") {
        return {
          stdout: `${oid}\trefs/heads/main\n${oid}\trefs/heads/topic\n`,
          stderr: "",
        };
      }
      if (args[0] === "rev-parse") return { stdout: "false", stderr: "" };
      throw new Error(`Unexpected Git command: ${args.join(" ")}`);
    };
    const execInput: GitExecInput = async (_args, input) => {
      calls.push(`batch:${input}`);
      return `${oid} commit 123\n`;
    };
    const read = createSessionRemoteContextReader({
      cwd: "/repo",
      exec,
      execInput,
      remoteSyncEnabled: async () => true,
    });

    const [first, second] = await Promise.all([read(), read()]);

    expect(second).toBe(first);
    expect(first).toEqual({
      kind: "available",
      snapshot: { kind: "available", scope: "all-heads", tips: { main: oid, topic: oid } },
      objectAvailability: { kind: "complete", commits: { [oid]: true } },
      history: { kind: "complete" },
    });
    expect(Object.isFrozen(first)).toBe(true);
    if (first.kind !== "available") return;
    expect(Object.isFrozen(first.snapshot.tips)).toBe(true);
    expect(Object.isFrozen(first.objectAvailability)).toBe(true);
    // The commits map is the shared evidence dependents read; freezing only its
    // wrapper would still let one slot mutate what every other slot sees.
    expect(first.objectAvailability.kind).toBe("complete");
    if (first.objectAvailability.kind === "complete") {
      expect(Object.isFrozen(first.objectAvailability.commits)).toBe(true);
    }
    expect(calls.filter((call) => call.startsWith("ls-remote"))).toHaveLength(1);
    expect(calls.filter((call) => call.startsWith("batch:"))).toEqual([`batch:${oid}\n`]);
  });

  it("resolves the snapshot and degrades only availability without a stdin-capable executor", async () => {
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "remote") return { stdout: "origin\r\n", stderr: "" };
      if (args[0] === "ls-remote") return { stdout: `${oid}\trefs/heads/main\n`, stderr: "" };
      if (args[0] === "rev-parse") return { stdout: "false", stderr: "" };
      throw new Error(`Unexpected Git command: ${args.join(" ")}`);
    };
    const read = createSessionRemoteContextReader({
      cwd: "/repo",
      exec,
      remoteSyncEnabled: async () => true,
    });

    // The CRLF remote listing must still resolve `origin`; a silent no-remote here
    // would strip remote evidence from every dependent slot.
    await expect(read()).resolves.toEqual({
      kind: "available",
      snapshot: { kind: "available", scope: "all-heads", tips: { main: oid } },
      objectAvailability: { kind: "unavailable", reason: "execution" },
      history: { kind: "complete" },
    });
  });

  it("returns not-needed without Git reads when remote sync is disabled", async () => {
    let gitRead = false;
    const read = createSessionRemoteContextReader({
      cwd: "/repo",
      exec: async () => {
        gitRead = true;
        throw new Error("Git must not run.");
      },
      execInput: async () => {
        gitRead = true;
        throw new Error("Git input must not run.");
      },
      remoteSyncEnabled: async () => false,
    });

    await expect(read()).resolves.toEqual({
      kind: "not-needed",
      reason: "remote-sync-disabled",
    });
    expect(gitRead).toBe(false);
  });

  it("proves an absent origin without remote or object acquisition", async () => {
    const calls: string[] = [];
    const read = createSessionRemoteContextReader({
      cwd: "/repo",
      exec: async (_command, args) => {
        calls.push(args.join(" "));
        return { stdout: "upstream\n", stderr: "" };
      },
      execInput: async () => {
        calls.push("object-input");
        throw new Error("Object inspection must not run.");
      },
      remoteSyncEnabled: async () => true,
    });

    await expect(read()).resolves.toEqual({ kind: "not-needed", reason: "no-remote" });
    expect(calls).toEqual(["remote"]);
  });

  it("retains remote-configuration inspection failure as an internal prerequisite failure", async () => {
    const read = createSessionRemoteContextReader({
      cwd: "/repo",
      exec: async (command, args) => {
        throw makeGitProcessError({ command, args, exitCode: 128, stderr: "cannot inspect local config" });
      },
      execInput: async () => {
        throw new Error("Object inspection must not run.");
      },
      remoteSyncEnabled: async () => true,
    });

    await expect(read()).resolves.toEqual({
      kind: "unavailable",
      prerequisite: "remote-configuration",
    });
  });

  it("retains one failed all-heads read as typed unreachable evidence", async () => {
    let localPrerequisiteRead = false;
    const exec: GitExec = async (command, args) => {
      if (args[0] === "remote") return { stdout: "origin\n", stderr: "" };
      if (args[0] === "ls-remote") {
        throw makeGitProcessError({ command, args, exitCode: 128, stderr: "network is unreachable" });
      }
      localPrerequisiteRead = true;
      throw new Error("Local prerequisites must not run.");
    };
    const read = createSessionRemoteContextReader({
      cwd: "/repo",
      exec,
      execInput: async () => {
        localPrerequisiteRead = true;
        throw new Error("Object inspection must not run.");
      },
      remoteSyncEnabled: async () => true,
    });

    await expect(read()).resolves.toEqual({
      kind: "unreachable",
      snapshot: { kind: "unreachable", failureReason: "network" },
    });
    expect(localPrerequisiteRead).toBe(false);
  });

  it("carries shallow history beside an unavailable local object inspection", async () => {
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "remote") return { stdout: "origin\n", stderr: "" };
      if (args[0] === "ls-remote") {
        return { stdout: `${oid}\trefs/heads/topic\n`, stderr: "" };
      }
      if (args[0] === "rev-parse") return { stdout: "true", stderr: "" };
      throw new Error(`Unexpected Git command: ${args.join(" ")}`);
    };
    const read = createSessionRemoteContextReader({
      cwd: "/repo",
      exec,
      execInput: async (args) => {
        throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "local object inspection denied" });
      },
      remoteSyncEnabled: async () => true,
    });

    await expect(read()).resolves.toEqual({
      kind: "available",
      snapshot: { kind: "available", scope: "all-heads", tips: { topic: oid } },
      objectAvailability: { kind: "unavailable", reason: "execution" },
      history: { kind: "shallow" },
    });
  });

  it("retains malformed local history state as an internal prerequisite failure", async () => {
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "remote") return { stdout: "origin\n", stderr: "" };
      if (args[0] === "ls-remote") {
        return { stdout: `${oid}\trefs/heads/topic\n`, stderr: "" };
      }
      if (args[0] === "rev-parse") return { stdout: "indeterminate", stderr: "" };
      throw new Error(`Unexpected Git command: ${args.join(" ")}`);
    };
    const read = createSessionRemoteContextReader({
      cwd: "/repo",
      exec,
      execInput: async () => `${oid} commit 123\n`,
      remoteSyncEnabled: async () => true,
    });

    await expect(read()).resolves.toMatchObject({
      kind: "available",
      objectAvailability: { kind: "complete", commits: { [oid]: true } },
      history: { kind: "unavailable", reason: "malformed" },
    });
  });
});
