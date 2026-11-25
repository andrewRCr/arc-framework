import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findSymlinkedWritePaths, symlinkedWritePathsError } from "../../../src/lib/manifest/symlinked.js";
import { UserFacingError } from "../../../src/lib/errors.js";

describe("findSymlinkedWritePaths", () => {
  let scratch: string;
  let root: string;
  let outside: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), "arc-symlinked-"));
    root = join(scratch, "project");
    outside = join(scratch, "outside");
    await mkdir(root);
    await mkdir(outside);
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  test("names a linked .arc/ once for every write below it, and reads nothing through it", async () => {
    await mkdir(join(outside, "system"));
    await symlink(join(scratch, "elsewhere"), join(outside, "system", "linked"), "junction");
    await symlink(outside, join(root, ".arc"), "junction");

    const linked = await findSymlinkedWritePaths(root, [
      ".arc/README.md", ".arc/system/linked/a.md", join(root, ".arc", "system", "rules", "b.md"),
    ]);

    expect(linked).toEqual([".arc"]);
  });

  test("names a linked directory and a dangling linked file under .arc/", async () => {
    await mkdir(join(root, ".arc", "system"), { recursive: true });
    await symlink(outside, join(root, ".arc", "system", "rules"), "junction");
    await symlink(join(outside, "missing.md"), join(root, ".arc", "README.md"), "file");

    const linked = await findSymlinkedWritePaths(root, [
      ".arc/README.md", ".arc/system/rules/DEV-RULES.md", ".arc/system/arc-config.yml",
    ]);

    expect(linked).toEqual([".arc/README.md", ".arc/system/rules"]);
  });

  test("names nothing for regular directories, missing paths, or a file where a directory belongs", async () => {
    await mkdir(join(root, ".arc", "system"), { recursive: true });
    await writeFile(join(root, ".arc", "system", "rules"), "a file\n");

    const linked = await findSymlinkedWritePaths(root, [
      ".arc/system/arc-config.yml", ".arc/system/rules/DEV-RULES.md", ".arc/user/someone/notes.md",
    ]);

    expect(linked).toEqual([]);
  });

  test("leaves the repository root and paths outside it unread", async () => {
    const linkedRoot = join(scratch, "linked-root");
    await mkdir(join(root, ".arc"));
    await symlink(root, linkedRoot, "junction");

    const linked = await findSymlinkedWritePaths(linkedRoot, [
      ".arc/README.md", linkedRoot, join(scratch, "outside", "a.md"),
    ]);

    expect(linked).toEqual([]);
  });
});

describe("symlinkedWritePathsError", () => {
  test.each([
    ["init", "retry `arc init`"],
    ["update", "retry `arc update`"],
    ["reconfigure", "retry `arc init --reconfigure`"],
  ] as const)("names each link and %s's remedy", (command, remedy) => {
    const err = symlinkedWritePathsError([".arc", ".arc/system/rules"], command);

    expect(err).toBeInstanceOf(UserFacingError);
    expect(err.code).toBe("manifest.install-path-symlinked");
    expect(err.whatHappened).toBe(`${command} would write through a symbolic link`);
    expect(err.why).toContain(".arc, .arc/system/rules");
    expect(err.whatToDo).toContain(remedy);
  });
});
