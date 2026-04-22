/**
 * Unit tests for the save-load command layer (ancestor walk cap + diagnostic).
 *
 * Covers `findNearestUserNote`'s rev-list cap (default 1000), explicit
 * --max-walk override, walk-exhausted detection, and the `onWalkExhausted`
 * callback surfaced by `runUserLoad`.
 */

import { describe, it, expect, vi } from "vitest";

import { findNearestUserNote, runUserLoad } from "../../src/commands/user/save-load.js";
import type { UserIOContext } from "../../src/commands/user/types.js";

interface GitMockConfig {
  head?: string;
  notedCommits?: string[];
  history?: string[];
  noteContent?: string | null;
}

function mockIO(config: GitMockConfig = {}): { io: UserIOContext; execCalls: [string, string[]][] } {
  const head = config.head ?? "h0";
  const notedCommits = config.notedCommits ?? [];
  const history = config.history ?? [head];
  const noteContent = config.noteContent === undefined
    ? JSON.stringify({ version: 2, files: {} })
    : config.noteContent;

  const execCalls: [string, string[]][] = [];

  const exec = vi.fn(async (cmd: string, args: string[]) => {
    execCalls.push([cmd, args]);
    if (args[0] === "rev-parse" && args[1] === "HEAD") {
      return { stdout: head, stderr: "" };
    }
    if (args[0] === "notes" && args[args.length - 1] === "list") {
      const lines = notedCommits.map((c) => `noteobj ${c}`).join("\n");
      return { stdout: lines, stderr: "" };
    }
    if (args[0] === "rev-list") {
      const maxCountIdx = args.indexOf("--max-count");
      const maxCount = maxCountIdx >= 0 ? Number(args[maxCountIdx + 1]) : history.length;
      return { stdout: history.slice(0, maxCount).join("\n"), stderr: "" };
    }
    throw new Error(`unexpected git call: ${cmd} ${args.join(" ")}`);
  });

  const io: UserIOContext = {
    exec,
    readFile: vi.fn(async () => ""),
    writeFile: vi.fn(async () => undefined),
    readDir: vi.fn(async () => []),
    mkdir: vi.fn(async () => undefined),
    writeNote: vi.fn(async () => undefined),
    readNote: vi.fn(async () => noteContent),
  };

  return { io, execCalls };
}

describe("findNearestUserNote — ancestor walk cap", () => {
  it("applies default cap of 1000 to the rev-list walk", async () => {
    const { io, execCalls } = mockIO({
      notedCommits: ["c500"],
      history: Array.from({ length: 1500 }, (_, i) => `c${i}`),
    });

    await findNearestUserNote({ cwd: "/repo", io, identity: "andrew" });

    const revList = execCalls.find(([, args]) => args[0] === "rev-list");
    expect(revList).toBeDefined();
    const maxCountIdx = revList![1].indexOf("--max-count");
    expect(maxCountIdx).toBeGreaterThan(-1);
    expect(revList![1][maxCountIdx + 1]).toBe("1000");
  });

  it("honors explicit maxAncestorWalk override smaller than default", async () => {
    const { io, execCalls } = mockIO({
      notedCommits: ["c5"],
      history: Array.from({ length: 50 }, (_, i) => `c${i}`),
    });

    await findNearestUserNote({ cwd: "/repo", io, identity: "andrew", maxAncestorWalk: 10 });

    const revList = execCalls.find(([, args]) => args[0] === "rev-list");
    const maxCountIdx = revList![1].indexOf("--max-count");
    expect(revList![1][maxCountIdx + 1]).toBe("10");
  });

  it("honors explicit maxAncestorWalk override larger than default", async () => {
    const { io, execCalls } = mockIO({
      notedCommits: ["c3000"],
      history: Array.from({ length: 5000 }, (_, i) => `c${i}`),
    });

    await findNearestUserNote({ cwd: "/repo", io, identity: "andrew", maxAncestorWalk: 5000 });

    const revList = execCalls.find(([, args]) => args[0] === "rev-list");
    const maxCountIdx = revList![1].indexOf("--max-count");
    expect(revList![1][maxCountIdx + 1]).toBe("5000");
  });

  it("reports capped=true and walked=maxWalk when cap hit without match", async () => {
    const { io } = mockIO({
      head: "h0",
      notedCommits: ["c-deep"],
      history: Array.from({ length: 1000 }, (_, i) => `c${i}`),
    });

    const result = await findNearestUserNote({ cwd: "/repo", io, identity: "andrew" });

    expect(result.note).toBeNull();
    expect(result.capped).toBe(true);
    expect(result.walked).toBe(1000);
    expect(result.maxWalk).toBe(1000);
  });

  it("reports capped=false and returns the note when found within cap", async () => {
    const { io } = mockIO({
      head: "c0",
      notedCommits: ["c5"],
      history: Array.from({ length: 100 }, (_, i) => `c${i}`),
    });

    const result = await findNearestUserNote({ cwd: "/repo", io, identity: "andrew" });

    expect(result.note).not.toBeNull();
    expect(result.note!.commit).toBe("c5");
    expect(result.note!.ancestorDistance).toBe(5);
    expect(result.note!.fromAncestor).toBe(true);
    expect(result.capped).toBe(false);
  });

  it("reports capped=false and walked=0 when no notes ref exists", async () => {
    const { io } = mockIO({ notedCommits: [], history: ["h0"] });

    const result = await findNearestUserNote({ cwd: "/repo", io, identity: "andrew" });

    expect(result.note).toBeNull();
    expect(result.capped).toBe(false);
    expect(result.walked).toBe(0);
  });
});

describe("runUserLoad — onWalkExhausted callback", () => {
  it("fires onWalkExhausted with walked and maxWalk when cap hit without match", async () => {
    const { io } = mockIO({
      notedCommits: ["c-unreachable"],
      history: Array.from({ length: 50 }, (_, i) => `c${i}`),
    });
    const onWalkExhausted = vi.fn();

    const result = await runUserLoad({
      cwd: "/repo",
      io,
      identity: "andrew",
      maxAncestorWalk: 50,
      onWalkExhausted,
    });

    expect(result).toBeNull();
    expect(onWalkExhausted).toHaveBeenCalledTimes(1);
    expect(onWalkExhausted).toHaveBeenCalledWith(50, 50);
  });

  it("does not fire onWalkExhausted when no notes ref exists", async () => {
    const { io } = mockIO({ notedCommits: [], history: ["h0"] });
    const onWalkExhausted = vi.fn();

    const result = await runUserLoad({
      cwd: "/repo",
      io,
      identity: "andrew",
      onWalkExhausted,
    });

    expect(result).toBeNull();
    expect(onWalkExhausted).not.toHaveBeenCalled();
  });
});
