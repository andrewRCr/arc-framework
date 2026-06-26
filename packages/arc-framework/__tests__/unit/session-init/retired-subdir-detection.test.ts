/**
 * Unit tests for `runRetiredSubdirDetection` — the read-only session-init slot
 * that surfaces lingering retired-WU user subdirs. Mirrors the load-path
 * decision (shipped against `origin/<base>`, drift-gated) but never removes;
 * follows the sweep slot's cheap-base / gated-expensive discipline.
 */

import { describe, it, expect } from "vitest";

import { runRetiredSubdirDetection } from "../../../src/lib/session-init/retired-subdir-detection.js";
import type { DirEntry, ReadFileFn } from "../../../src/lib/git/user-sync.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { computeDriftingSubdirs } from "../../../src/commands/user.js";

const cwd = "/repo";
const identity = "andrew";
const userDir = `${cwd}/.arc/user/${identity}`;

/** Recursive user-dir reader stub returning the given relative file paths. */
function readDirOf(paths: string[]): (dirPath: string) => Promise<DirEntry[]> {
  return async () => paths.map((name) => ({ name, size: 1 }));
}

/** File reader stub mapping a relative path under the user dir to its disk content. */
function readFileOf(contentByRel: Record<string, string>): ReadFileFn {
  return async (filePath: string) => {
    const rel = filePath.startsWith(`${userDir}/`) ? filePath.slice(userDir.length + 1) : filePath;
    return contentByRel[rel] ?? "x";
  };
}

/**
 * Git runner stub serving both the `ls-tree` shipped read (from a list of
 * `completed/` paths) and `readRecentUserNotes` (from a list of manifest
 * contents, most-recent first).
 */
function buildExec(opts: { completed?: string[]; notes?: string[] }): GitExec {
  const notes = opts.notes ?? [];
  const history = notes.map((_, i) => `histcommit${i}`);
  const byHistory = new Map<string, { path: string; content: string }>();
  history.forEach((h, i) => {
    const c = i.toString(16).padStart(40, "0");
    byHistory.set(h, { path: `${c.slice(0, 2)}/${c.slice(2)}`, content: notes[i]! });
  });
  return (async (_cmd: string, args: string[]) => {
    if (args[0] === "ls-tree") return { stdout: (opts.completed ?? []).join("\n") };
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

function manifest(files: Record<string, string>): string {
  return JSON.stringify({ version: 2, files });
}

/** A shipped `completed/` tree carrying each given slug under one quarter. */
function shippedPaths(slugs: string[]): string[] {
  return slugs.map((slug, i) => `.arc/completed/2026-q2/0${i + 1}_${slug}/meta-${slug}.md`);
}

const baseArgs = { cwd, identity, baseBranch: "main", computeDrift: computeDriftingSubdirs };

describe("runRetiredSubdirDetection", () => {
  it("returns no candidates when no per-WU subdir is present", async () => {
    const result = await runRetiredSubdirDetection({
      ...baseArgs,
      exec: buildExec({}),
      readDir: readDirOf(["SESSION-NOTES.md", "WORKING-MEMORY.md"]),
      readFile: readFileOf({}),
    });

    expect(result.candidates).toEqual([]);
  });

  it("returns no candidates when a present subdir has not shipped", async () => {
    const result = await runRetiredSubdirDetection({
      ...baseArgs,
      exec: buildExec({ completed: shippedPaths(["some-other-wu"]) }),
      readDir: readDirOf(["live-wu/SESSION-NOTES.md"]),
      readFile: readFileOf({ "live-wu/SESSION-NOTES.md": "saved" }),
    });

    expect(result.candidates).toEqual([]);
  });

  it("surfaces a shipped subdir whose disk matches its last-pushed note (no drift)", async () => {
    const result = await runRetiredSubdirDetection({
      ...baseArgs,
      exec: buildExec({
        completed: shippedPaths(["old-wu"]),
        notes: [manifest({ "old-wu/SESSION-NOTES.md": "saved" })],
      }),
      readDir: readDirOf(["old-wu/SESSION-NOTES.md"]),
      readFile: readFileOf({ "old-wu/SESSION-NOTES.md": "saved" }),
    });

    expect(result.candidates).toEqual(["old-wu"]);
  });

  it("surfaces a shipped subdir carried by no note in the window (no basis)", async () => {
    const result = await runRetiredSubdirDetection({
      ...baseArgs,
      exec: buildExec({
        completed: shippedPaths(["old-wu"]),
        notes: [manifest({ "WORKING-MEMORY.md": "x" })],
      }),
      readDir: readDirOf(["old-wu/SESSION-NOTES.md"]),
      readFile: readFileOf({ "old-wu/SESSION-NOTES.md": "saved" }),
    });

    expect(result.candidates).toEqual(["old-wu"]);
  });

  it("does not surface a shipped subdir carrying unpushed local drift", async () => {
    const result = await runRetiredSubdirDetection({
      ...baseArgs,
      exec: buildExec({
        completed: shippedPaths(["old-wu"]),
        notes: [manifest({ "old-wu/SESSION-NOTES.md": "saved" })],
      }),
      readDir: readDirOf(["old-wu/SESSION-NOTES.md"]),
      readFile: readFileOf({ "old-wu/SESSION-NOTES.md": "local-edit" }),
    });

    expect(result.candidates).toEqual([]);
  });
});
