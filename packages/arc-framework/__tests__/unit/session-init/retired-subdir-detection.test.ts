/**
 * Unit tests for `runRetiredSubdirDetection` — the read-only session-init slot
 * that surfaces lingering retired-WU user subdirs. Mirrors the load-path
 * decision (every subdir shipped against `origin/<base>`) but never removes;
 * follows the sweep slot's cheap-base / gated-expensive discipline.
 */

import { describe, it, expect } from "vitest";

import { runRetiredSubdirDetection } from "../../../src/lib/session-init/retired-subdir-detection.js";
import type { DirEntry, ReadFileFn } from "../../../src/lib/git/user-sync.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

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

/** Git runner stub serving the `ls-tree` shipped read from a list of `completed/` paths. */
function buildExec(opts: { completed?: string[] }): GitExec {
  return (async (_cmd: string, args: string[]) => {
    if (args[0] === "ls-tree") return { stdout: (opts.completed ?? []).join("\n") };
    throw new Error(`unexpected git: ${args.join(" ")}`);
  }) as unknown as GitExec;
}

/** A shipped `completed/` tree carrying each given slug under one quarter. */
function shippedPaths(slugs: string[]): string[] {
  return slugs.map((slug, i) => `.arc/completed/2026-q2/0${i + 1}_${slug}/meta-${slug}.md`);
}

const baseArgs = { cwd, identity, baseBranch: "main" };

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

  it("surfaces a shipped subdir", async () => {
    const result = await runRetiredSubdirDetection({
      ...baseArgs,
      exec: buildExec({ completed: shippedPaths(["old-wu"]) }),
      readDir: readDirOf(["old-wu/SESSION-NOTES.md"]),
      readFile: readFileOf({ "old-wu/SESSION-NOTES.md": "saved" }),
    });

    expect(result.candidates).toEqual(["old-wu"]);
  });

  it("surfaces a shipped subdir regardless of local edits (drift no longer gates)", async () => {
    const result = await runRetiredSubdirDetection({
      ...baseArgs,
      exec: buildExec({ completed: shippedPaths(["old-wu"]) }),
      readDir: readDirOf(["old-wu/SESSION-NOTES.md", "old-wu/scratch.py"]),
      readFile: readFileOf({ "old-wu/SESSION-NOTES.md": "local-edit", "old-wu/scratch.py": "stashed" }),
    });

    expect(result.candidates).toEqual(["old-wu"]);
  });
});
