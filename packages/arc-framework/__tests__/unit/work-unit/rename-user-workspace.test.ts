import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  reconcileRenameUserWorkspaceDirectory,
  type RenameUserWorkspaceFs,
} from "../../../src/lib/work-unit/rename-user-workspace.js";

describe("reconcileRenameUserWorkspaceDirectory", () => {
  let root: string;
  let source: string;
  let destination: string;
  let fs: RenameUserWorkspaceFs;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "arc-rename-user-workspace-"));
    source = join(root, "old-name");
    destination = join(root, "new-name");
    fs = {
      directoryExists: async (path) => {
        try {
          return (await stat(path)).isDirectory();
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
          throw error;
        }
      },
      renameDirectory: rename,
    };
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("moves the workspace with its session notes intact", async () => {
    await mkdir(source);
    await writeFile(join(source, "SESSION-NOTES.md"), "continuity\n");

    await expect(reconcileRenameUserWorkspaceDirectory(fs, { source, destination }))
      .resolves.toEqual({ status: "moved" });
    await expect(readFile(join(destination, "SESSION-NOTES.md"), "utf8")).resolves.toBe("continuity\n");
    await expect(fs.directoryExists(source)).resolves.toBe(false);
  });

  it("accepts an already-moved workspace", async () => {
    await mkdir(destination);

    await expect(reconcileRenameUserWorkspaceDirectory(fs, { source, destination }))
      .resolves.toEqual({ status: "already-moved" });
  });

  it("skips when no workspace exists", async () => {
    await expect(reconcileRenameUserWorkspaceDirectory(fs, { source, destination }))
      .resolves.toEqual({ status: "absent" });
  });

  it("refuses an interrupted state with both paths present", async () => {
    await mkdir(source);
    await mkdir(destination);

    await expect(reconcileRenameUserWorkspaceDirectory(fs, { source, destination }))
      .rejects.toThrow(new RegExp(`${source}.*${destination}`));
  });
});
