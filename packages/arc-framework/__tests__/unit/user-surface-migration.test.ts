import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  linkedIdentityGlobalUserSurfacesAreSafe,
  nodeUserSurfaceMigrationFs,
  reconcileLinkedIdentityGlobalUserSurfaces,
} from "../../src/lib/user-surface-migration.js";

describe("user-surface migration", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "arc-user-surface-migration-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("discards divergent linked STATUS.USER caches instead of blocking teardown", async () => {
    const primary = join(root, "primary");
    const linked = join(root, "linked");
    const primaryUserDir = join(primary, ".arc", "user", "andrew");
    const linkedUserDir = join(linked, ".arc", "user", "andrew");
    await mkdir(primaryUserDir, { recursive: true });
    await mkdir(linkedUserDir, { recursive: true });
    await writeFile(join(primaryUserDir, "STATUS.USER.md"), "primary cache\n");
    await writeFile(join(linkedUserDir, "STATUS.USER.md"), "linked stale cache\n");

    await expect(linkedIdentityGlobalUserSurfacesAreSafe({
      worktreePath: linked,
      primaryWorktreePath: primary,
      fs: nodeUserSurfaceMigrationFs,
    })).resolves.toBe(true);

    const result = await reconcileLinkedIdentityGlobalUserSurfaces({
      worktreePath: linked,
      primaryWorktreePath: primary,
      fs: nodeUserSurfaceMigrationFs,
    });

    expect(result).toEqual({ status: "ok", reconciled: [] });
    await expect(readFile(join(primaryUserDir, "STATUS.USER.md"), "utf8")).resolves.toBe("primary cache\n");
  });
});
