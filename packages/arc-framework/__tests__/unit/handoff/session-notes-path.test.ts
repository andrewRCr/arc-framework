import { describe, it, expect } from "vitest";
import { join } from "node:path";

import { resolveSessionNotesPath } from "../../../src/lib/handoff/session-notes-path.js";
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

  it("returns the flat path when no subdir SESSION-NOTES exists but flat does", async () => {
    const io = makeIO([
      { name: "SESSION-NOTES.md", size: 100 },
      { name: "USER-INBOX.md", size: 50 },
    ]);

    const result = await resolveSessionNotesPath(CWD, IDENTITY, io);

    expect(result).toBe(join(USER_DIR, "SESSION-NOTES.md"));
  });

  it("prefers the subdir path when both subdir and flat are present", async () => {
    const io = makeIO([
      { name: "feature-x/SESSION-NOTES.md", size: 100 },
      { name: "SESSION-NOTES.md", size: 50 },
      { name: "USER-INBOX.md", size: 30 },
    ]);

    const result = await resolveSessionNotesPath(CWD, IDENTITY, io);

    expect(result).toBe(join(USER_DIR, "feature-x", "SESSION-NOTES.md"));
  });

  it("falls through to flat when multiple subdir matches are present (ambiguous)", async () => {
    const io = makeIO([
      { name: "feature-x/SESSION-NOTES.md", size: 100 },
      { name: "feature-y/SESSION-NOTES.md", size: 80 },
      { name: "SESSION-NOTES.md", size: 50 },
    ]);

    const result = await resolveSessionNotesPath(CWD, IDENTITY, io);

    expect(result).toBe(join(USER_DIR, "SESSION-NOTES.md"));
  });

  it("returns null when neither subdir nor flat SESSION-NOTES is present", async () => {
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
      { name: "SESSION-NOTES.md", size: 50 },
    ]);

    const result = await resolveSessionNotesPath(CWD, IDENTITY, io);

    expect(result).toBe(join(USER_DIR, "SESSION-NOTES.md"));
  });
});
