/**
 * Unit tests for `runRetiredSubdirDetection` — the read-only session-init slot
 * that surfaces lingering retired-WU user subdirs. Mirrors the load-path
 * decision but never removes; follows the sweep slot's cheap-base /
 * gated-expensive discipline (the recent-notes read fires only when a shipped
 * subdir is actually present).
 */

import { describe, it, expect, vi } from "vitest";

import { runRetiredSubdirDetection } from "../../../src/lib/session-init/retired-subdir-detection.js";
import type { DirEntry } from "../../../src/lib/git/user-sync.js";
import type { CompletedIndexFs } from "../../../src/lib/work-unit/completed-index.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

const cwd = "/repo";
const identity = "andrew";
const completed = `${cwd}/.arc/completed`;

/** Recursive user-dir reader stub returning the given relative file paths. */
function readDirOf(paths: string[]): (dirPath: string) => Promise<DirEntry[]> {
  return async () => paths.map((name) => ({ name, size: 1 }));
}

/** `.arc/completed/` reader stub from a quarter → archive-dirs map. */
function shippedFs(quarters: Record<string, string[]>): CompletedIndexFs {
  return {
    readdir: async (path) => {
      const norm = path.replace(/\/$/u, "");
      if (norm === completed) return Object.keys(quarters);
      const quarter = norm.slice(completed.length + 1);
      const entry = quarters[quarter];
      if (entry === undefined) throw new Error(`ENOENT: ${path}`);
      return entry;
    },
  };
}

/** Git runner stub driving `readRecentUserNotes` from a list of manifest contents. */
function notesExec(noteContents: string[]): GitExec {
  const history = noteContents.map((_, i) => `histcommit${i}`);
  const byHistory = new Map<string, { path: string; content: string }>();
  history.forEach((h, i) => {
    const c = i.toString(16).padStart(40, "0");
    byHistory.set(h, { path: `${c.slice(0, 2)}/${c.slice(2)}`, content: noteContents[i]! });
  });
  return (async (_cmd: string, args: string[]) => {
    if (args[0] === "log") return { stdout: history.join("\n") };
    if (args[0] === "diff-tree") {
      const entry = byHistory.get(args[args.length - 1] ?? "");
      return { stdout: entry?.path ?? "" };
    }
    if (args[0] === "show") {
      const entry = byHistory.get((args[1] ?? "").split(":")[0] ?? "");
      return { stdout: entry?.content ?? "" };
    }
    throw new Error(`unexpected git: ${args.join(" ")}`);
  }) as unknown as GitExec;
}

function manifest(paths: string[]): string {
  return JSON.stringify({ version: 2, files: Object.fromEntries(paths.map((p) => [p, "x"])) });
}

describe("runRetiredSubdirDetection", () => {
  it("returns no candidates and reads no notes when no per-WU subdir is present", async () => {
    const exec = vi.fn(notesExec([]));
    const result = await runRetiredSubdirDetection({
      cwd,
      identity,
      exec,
      readDir: readDirOf(["SESSION-NOTES.md", "WORKING-MEMORY.md"]),
      fs: shippedFs({}),
    });

    expect(result.candidates).toEqual([]);
    expect(exec).not.toHaveBeenCalled();
  });

  it("returns no candidates and reads no notes when a present subdir has not shipped", async () => {
    const exec = vi.fn(notesExec([]));
    const result = await runRetiredSubdirDetection({
      cwd,
      identity,
      exec,
      readDir: readDirOf(["live-wu/SESSION-NOTES.md"]),
      fs: shippedFs({}),
    });

    expect(result.candidates).toEqual([]);
    expect(exec).not.toHaveBeenCalled();
  });

  it("surfaces a shipped subdir absent from the recent-notes window", async () => {
    const result = await runRetiredSubdirDetection({
      cwd,
      identity,
      exec: notesExec([manifest(["WORKING-MEMORY.md"])]),
      readDir: readDirOf(["old-wu/SESSION-NOTES.md"]),
      fs: shippedFs({ "2026-q2": ["01_old-wu"] }),
    });

    expect(result.candidates).toEqual(["old-wu"]);
  });

  it("does not surface a shipped subdir still carried in the recent-notes window", async () => {
    const result = await runRetiredSubdirDetection({
      cwd,
      identity,
      exec: notesExec([manifest(["live-wu/SESSION-NOTES.md"])]),
      readDir: readDirOf(["live-wu/SESSION-NOTES.md"]),
      fs: shippedFs({ "2026-q2": ["02_live-wu"] }),
    });

    expect(result.candidates).toEqual([]);
  });
});
