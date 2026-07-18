import { describe, it, expect } from "vitest";
import { join } from "node:path";

import {
  resolveSessionNotesPath,
  resolveWorkUnitSessionNotesPath,
} from "../../../src/lib/handoff/session-notes-path.js";
import type { SessionNotesPathIO } from "../../../src/lib/handoff/session-notes-path.js";
import type { DirEntry } from "../../../src/lib/git/index.js";

const CWD = "/repo";
const IDENTITY = "test-user";
const USER_DIR = join(CWD, ".arc", "user", IDENTITY);

function makeIO(entriesOrError: DirEntry[] | Error): SessionNotesPathIO {
  return {
    readDir: async (dirPath: string) => {
      expect(dirPath).toBe(USER_DIR);
      if (entriesOrError instanceof Error) {
        throw entriesOrError;
      }
      return entriesOrError;
    },
  };
}

describe("resolveSessionNotesPath", () => {
  it("returns the subdir path when a single <wu-name>/SESSION-NOTES.md entry exists", async () => {
    const io = makeIO([
      { name: "feature-x/SESSION-NOTES.md", size: 100 },
      { name: "USER-INBOX.md", size: 50 },
      { name: "WORKING-MEMORY.md", size: 30 },
    ]);

    const result = await resolveSessionNotesPath(CWD, IDENTITY, io);

    expect(result).toBe(join(USER_DIR, "feature-x", "SESSION-NOTES.md"));
  });

  it("returns null when multiple <wu-name>/SESSION-NOTES.md entries are present (can't pick safely)", async () => {
    const io = makeIO([
      { name: "feature-x/SESSION-NOTES.md", size: 100 },
      { name: "feature-y/SESSION-NOTES.md", size: 80 },
    ]);

    const result = await resolveSessionNotesPath(CWD, IDENTITY, io);

    expect(result).toBeNull();
  });

  it("returns null when no SESSION-NOTES is present under the user dir", async () => {
    const io = makeIO([
      { name: "USER-INBOX.md", size: 50 },
      { name: "WORKING-MEMORY.md", size: 30 },
    ]);

    const result = await resolveSessionNotesPath(CWD, IDENTITY, io);

    expect(result).toBeNull();
  });

  it("returns null when readDir throws (graceful failure on missing user dir)", async () => {
    const io = makeIO(new Error("ENOENT: no such directory"));

    const result = await resolveSessionNotesPath(CWD, IDENTITY, io);

    expect(result).toBeNull();
  });

  it("ignores deeper-nested SESSION-NOTES paths (single-segment subdir only)", async () => {
    // Per the per-WU subdir layout: exactly one segment under user/{identity}/.
    // Files at deeper depths (e.g., user/{identity}/<wu>/sub/SESSION-NOTES.md)
    // are not part of the convention and must not match.
    const io = makeIO([
      { name: "feature-x/nested/SESSION-NOTES.md", size: 100 },
    ]);

    const result = await resolveSessionNotesPath(CWD, IDENTITY, io);

    expect(result).toBeNull();
  });
});

describe("resolveWorkUnitSessionNotesPath", () => {
  it("selects the named work unit when sibling SESSION-NOTES files exist", async () => {
    const result = await resolveWorkUnitSessionNotesPath(CWD, IDENTITY, "feature-y", makeIO([
      { name: "feature-x/SESSION-NOTES.md", size: 100 },
      { name: "feature-y/SESSION-NOTES.md", size: 80 },
    ]));

    expect(result).toEqual({
      status: "resolved",
      path: join(USER_DIR, "feature-y", "SESSION-NOTES.md"),
    });
  });

  it("distinguishes normal absence from an unreadable directory", async () => {
    await expect(resolveWorkUnitSessionNotesPath(CWD, IDENTITY, "feature-x", makeIO([])))
      .resolves.toEqual({ status: "absent" });
    await expect(resolveWorkUnitSessionNotesPath(
      CWD,
      IDENTITY,
      "feature-x",
      makeIO(new Error("EACCES: permission denied")),
    )).resolves.toEqual({
      status: "error",
      message: "Unable to read SESSION-NOTES directory: EACCES: permission denied",
    });
  });

  it("reports duplicate named paths as ambiguous", async () => {
    const result = await resolveWorkUnitSessionNotesPath(CWD, IDENTITY, "feature-x", makeIO([
      { name: "feature-x/SESSION-NOTES.md", size: 100 },
      { name: "feature-x/SESSION-NOTES.md", size: 100 },
    ]));

    expect(result).toEqual({
      status: "error",
      message: "SESSION-NOTES path is ambiguous for work unit \"feature-x\".",
    });
  });
});
