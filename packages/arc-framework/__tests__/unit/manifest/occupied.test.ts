import { describe, test, expect, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findOccupiedPaths, occupiedPathsError } from "../../../src/lib/manifest/occupied.js";
import { UserFacingError } from "../../../src/lib/errors.js";

function readError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

describe("findOccupiedPaths", () => {
  test("names a path holding other content, but not a missing one or one already holding the content", async () => {
    const files: Record<string, string> = {
      [join("/project", ".arc/other.md")]: "# Theirs\n",
      [join("/project", ".arc/same.md")]: "# ARC\n",
    };
    const readFile = vi.fn(async (path: string) => {
      const content = files[path];
      if (content === undefined) throw readError("ENOENT");
      return content;
    });

    const occupied = await findOccupiedPaths("/project", [
      { path: ".arc/missing.md", content: "# ARC\n" },
      { path: ".arc/other.md", content: "# ARC\n" },
      { path: ".arc/same.md", content: "# ARC\n" },
    ], readFile);

    expect(occupied).toEqual([".arc/other.md"]);
    expect(readFile).toHaveBeenCalledWith(join("/project", ".arc/missing.md"));
  });

  test.each(["EISDIR", "ENOTDIR"])("names a path whose read fails with %s", async (code) => {
    const readFile = async (): Promise<string> => { throw readError(code); };

    expect(await findOccupiedPaths("/project", [{ path: ".arc/a.md", content: "" }], readFile)).toEqual([".arc/a.md"]);
  });

  test("names a symlink at the path even when its target does not exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-occupied-"));
    try {
      await mkdir(join(root, ".arc"));
      await symlink(join(root, "elsewhere.md"), join(root, ".arc", "a.md"), "file");

      const occupied = await findOccupiedPaths(root, [{ path: ".arc/a.md", content: "# ARC\n" }],
        (path) => readFile(path, "utf-8"));

      expect(occupied).toEqual([".arc/a.md"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rethrows any other read failure", async () => {
    const readFile = async (): Promise<string> => { throw readError("EACCES"); };

    await expect(findOccupiedPaths("/project", [{ path: ".arc/a.md", content: "" }], readFile))
      .rejects.toMatchObject({ code: "EACCES" });
  });
});

describe("occupiedPathsError", () => {
  test("names each file and an update's remedy", () => {
    const err = occupiedPathsError([".arc/system/workflows/README.md"], "update");

    expect(err).toBeInstanceOf(UserFacingError);
    expect(err.code).toBe("manifest.install-paths-occupied");
    expect(err.whatHappened).toContain("update would overwrite");
    expect(err.why).toContain(".arc/system/workflows/README.md");
    expect(err.whatToDo).toContain("retry `arc update`");
  });

  test("names the first ten files and counts the rest, with init's remedy", () => {
    const paths = Array.from({ length: 12 }, (_, index) => `.arc/file-${index}.md`);

    const err = occupiedPathsError(paths, "init");

    expect(err.why).toContain(".arc/file-9.md, and 2 more");
    expect(err.why).not.toContain(".arc/file-10.md");
    expect(err.whatToDo).toContain("the existing .arc/ directory");
    expect(err.whatToDo).toContain("retry `arc init`");
  });
});
