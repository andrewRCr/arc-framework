/**
 * Unit tests for `runRetiredSubdirDetection` — the read-only session-init slot
 * that surfaces lingering retired-WU user subdirs. Mirrors the load-path
 * decision (every subdir shipped against `origin/<base>`) but never removes;
 * follows the sweep slot's cheap-base / gated-expensive discipline.
 */

import { describe, it, expect } from "vitest";

import {
  analyzeRetiredSubdirSnapshot,
  RetiredSubdirCandidatesSchema,
  RetiredSubdirDetectionResultSchema,
  runRetiredSubdirDetection,
} from "../../../src/lib/session-init/retired-subdir-detection.js";
import type { DirEntry, ReadFileFn } from "../../../src/lib/git/user-sync.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import type { ObjectAvailabilityResult } from "../../../src/lib/git/object-availability.js";
import type { RemoteHeadSnapshotResult } from "../../../src/lib/git/remote-ref-reader.js";

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

  it("reads shipped state from the supplied advertised base OID", async () => {
    const baseOid = "2".repeat(40);
    const exec: GitExec = async (_command, args, options) => {
      if (args[0] !== "ls-tree" || args[4] !== baseOid) {
        throw new Error(`tracking-ref fallback: ${args.join(" ")}`);
      }
      if (options?.objectAccess !== "local-only") throw new Error("object access was not local-only");
      return { stdout: shippedPaths(["old-wu"]).join("\n") };
    };

    const result = await runRetiredSubdirDetection({
      ...baseArgs,
      exec,
      readDir: readDirOf(["old-wu/SESSION-NOTES.md"]),
      readFile: readFileOf({ "old-wu/SESSION-NOTES.md": "saved" }),
      baseEvidence: {
        remoteSyncEnabled: true,
        snapshot: { kind: "available", scope: "all-heads", tips: { main: baseOid } },
        objectAvailability: { kind: "complete", commits: { [baseOid]: true } },
        history: { kind: "complete" },
      },
    });

    expect(result).toEqual({ candidates: ["old-wu"] });
  });
});

describe("analyzeRetiredSubdirSnapshot", () => {
  it("detects retired subdirectories from the exact advertised base commit", async () => {
    const baseOid = "1111111111111111111111111111111111111111";
    const exec: GitExec = async (_cmd, args, options) => {
      if (args[0] !== "ls-tree" || args[4] !== baseOid) throw new Error("unexpected completed-index operand");
      if (options?.objectAccess !== "local-only") throw new Error("object access was not local-only");
      return { stdout: shippedPaths(["old-wu"]).join("\n") };
    };

    const result = await analyzeRetiredSubdirSnapshot({
      exec,
      localSubdirs: ["old-wu", "live-wu"],
      baseBranch: "main",
      remoteSyncEnabled: true,
      snapshot: { kind: "available", scope: "all-heads", tips: { main: baseOid } },
      objectAvailability: { kind: "complete", commits: { [baseOid]: true } },
    });

    expect(result).toEqual({ candidates: ["old-wu"] });
  });

  it.each([
    {
      name: "pending-fetch",
      remoteSyncEnabled: true,
      snapshot: {
        kind: "available",
        scope: "all-heads",
        tips: { main: "1111111111111111111111111111111111111111" },
      } as RemoteHeadSnapshotResult,
      objectAvailability: {
        kind: "complete",
        commits: { "1111111111111111111111111111111111111111": false },
      } as ObjectAvailabilityResult,
    },
    {
      name: "unreachable",
      remoteSyncEnabled: true,
      snapshot: { kind: "unreachable", failureReason: "network" } as RemoteHeadSnapshotResult,
      objectAvailability: { kind: "complete", commits: {} } as ObjectAvailabilityResult,
    },
    {
      name: "remote-base-absent",
      remoteSyncEnabled: true,
      snapshot: { kind: "available", scope: "all-heads", tips: {} } as RemoteHeadSnapshotResult,
      objectAvailability: { kind: "complete", commits: {} } as ObjectAvailabilityResult,
    },
    {
      name: "not-applicable",
      remoteSyncEnabled: false,
      snapshot: { kind: "unreachable", failureReason: "network" } as RemoteHeadSnapshotResult,
      objectAvailability: { kind: "unavailable", reason: "execution" } as ObjectAvailabilityResult,
    },
  ])("does not authorize retired-subdirectory cleanup for $name evidence", async ({
    remoteSyncEnabled,
    snapshot,
    objectAvailability,
  }: {
    remoteSyncEnabled: boolean;
    snapshot: RemoteHeadSnapshotResult;
    objectAvailability: ObjectAvailabilityResult;
  }) => {
    const result = await analyzeRetiredSubdirSnapshot({
      exec: buildExec({ completed: shippedPaths(["old-wu"]) }),
      localSubdirs: ["old-wu"],
      baseBranch: "main",
      remoteSyncEnabled,
      snapshot,
      objectAvailability,
    });

    expect(result).toEqual({ candidates: [] });
  });

  it("propagates an unreadable completed index", async () => {
    const baseOid = "1111111111111111111111111111111111111111";

    await expect(analyzeRetiredSubdirSnapshot({
      exec: async () => {
        throw new Error("completed tree unavailable");
      },
      localSubdirs: ["old-wu"],
      baseBranch: "main",
      remoteSyncEnabled: true,
      snapshot: { kind: "available", scope: "all-heads", tips: { main: baseOid } },
      objectAvailability: { kind: "complete", commits: { [baseOid]: true } },
    })).rejects.toThrow("completed tree unavailable");
  });
});

describe("RetiredSubdirDetectionResultSchema", () => {
  it.each([
    { candidates: [] },
    { candidates: ["old-wu", "older-wu"] },
  ])("accepts candidate arrays", ({ candidates }) => {
    expect(RetiredSubdirDetectionResultSchema.parse({ candidates })).toEqual({ candidates });
  });

  it.each([
    "old-wu",
    ["Not A Slug"],
    [42],
  ])("rejects malformed candidates", (candidates) => {
    expect(RetiredSubdirCandidatesSchema.safeParse(candidates).success).toBe(false);
  });

  it("rejects undeclared result fields", () => {
    expect(RetiredSubdirDetectionResultSchema.safeParse({ candidates: [], leaked: true }).success).toBe(false);
  });
});
