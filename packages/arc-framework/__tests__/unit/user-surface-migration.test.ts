import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  isSignpostStub,
  linkedIdentityGlobalUserSurfacesAreSafe,
  nodeUserSurfaceMigrationFs,
  reconcileLinkedIdentityGlobalUserSurfaces,
} from "../../src/lib/user-surface-migration.js";

/** Build a linked/primary worktree pair sharing an identity user dir. */
async function makeWorktrees(root: string, identity = "andrew"): Promise<{
  primary: string;
  linked: string;
  primaryUserDir: string;
  linkedUserDir: string;
}> {
  const primary = join(root, "primary");
  const linked = join(root, "linked");
  const primaryUserDir = join(primary, ".arc", "user", identity);
  const linkedUserDir = join(linked, ".arc", "user", identity);
  await mkdir(primaryUserDir, { recursive: true });
  await mkdir(linkedUserDir, { recursive: true });
  return { primary, linked, primaryUserDir, linkedUserDir };
}

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

    expect(result).toEqual({ status: "ok", reconciled: [], signposted: [] });
    await expect(readFile(join(primaryUserDir, "STATUS.USER.md"), "utf8")).resolves.toBe("primary cache\n");
    // Without signposting (teardown path), the linked copy is left in place — git removes the worktree.
    await expect(readFile(join(linkedUserDir, "STATUS.USER.md"), "utf8")).resolves.toBe("linked stale cache\n");
  });

  it("signposts a durable surface in place after copying it up to canonical", async () => {
    const { primary, linked, primaryUserDir, linkedUserDir } = await makeWorktrees(root);
    await writeFile(join(linkedUserDir, "WORKING-MEMORY.md"), "linked memory\n");

    const result = await reconcileLinkedIdentityGlobalUserSurfaces({
      worktreePath: linked,
      primaryWorktreePath: primary,
      fs: nodeUserSurfaceMigrationFs,
      signpost: true,
    });

    expect(result).toEqual({
      status: "ok",
      reconciled: ["andrew/WORKING-MEMORY.md"],
      signposted: ["andrew/WORKING-MEMORY.md"],
    });
    // Content preserved to canonical; linked copy replaced by a signpost stub naming it.
    await expect(readFile(join(primaryUserDir, "WORKING-MEMORY.md"), "utf8")).resolves.toBe("linked memory\n");
    const linkedAfter = await readFile(join(linkedUserDir, "WORKING-MEMORY.md"), "utf8");
    expect(isSignpostStub(linkedAfter)).toBe(true);
    expect(linkedAfter).not.toContain("linked memory");
    expect(linkedAfter).toContain(join(primaryUserDir, "WORKING-MEMORY.md"));
  });

  it("signposts a durable surface even when it already matches canonical (removing the duplicate)", async () => {
    const { primary, linked, primaryUserDir, linkedUserDir } = await makeWorktrees(root);
    await writeFile(join(primaryUserDir, "USER-INBOX.md"), "shared inbox\n");
    await writeFile(join(linkedUserDir, "USER-INBOX.md"), "shared inbox\n");

    const result = await reconcileLinkedIdentityGlobalUserSurfaces({
      worktreePath: linked,
      primaryWorktreePath: primary,
      fs: nodeUserSurfaceMigrationFs,
      signpost: true,
    });

    // Identical content is not a merge (reconciled empty) but is still a stale duplicate to retire.
    expect(result).toEqual({ status: "ok", reconciled: [], signposted: ["andrew/USER-INBOX.md"] });
    await expect(readFile(join(primaryUserDir, "USER-INBOX.md"), "utf8")).resolves.toBe("shared inbox\n");
    expect(isSignpostStub(await readFile(join(linkedUserDir, "USER-INBOX.md"), "utf8"))).toBe(true);
  });

  it("skips a linked copy that is already a signpost stub — never merging the notice into canonical", async () => {
    const { primary, linked, primaryUserDir, linkedUserDir } = await makeWorktrees(root);
    await writeFile(join(primaryUserDir, "WORKING-MEMORY.md"), "canonical memory\n");
    const stub = "<!-- arc:signpost surface=WORKING-MEMORY.md -->\n# not here\n";
    await writeFile(join(linkedUserDir, "WORKING-MEMORY.md"), stub);

    const result = await reconcileLinkedIdentityGlobalUserSurfaces({
      worktreePath: linked,
      primaryWorktreePath: primary,
      fs: nodeUserSurfaceMigrationFs,
      signpost: true,
    });

    expect(result).toEqual({ status: "ok", reconciled: [], signposted: [] });
    await expect(readFile(join(primaryUserDir, "WORKING-MEMORY.md"), "utf8")).resolves.toBe("canonical memory\n");
    await expect(readFile(join(linkedUserDir, "WORKING-MEMORY.md"), "utf8")).resolves.toBe(stub);
  });

  it("removes a regenerable cache instead of stubbing it when signposting", async () => {
    const { primary, linked, primaryUserDir, linkedUserDir } = await makeWorktrees(root);
    await writeFile(join(primaryUserDir, "STATUS.USER.md"), "primary cache\n");
    await writeFile(join(linkedUserDir, "STATUS.USER.md"), "linked stale cache\n");

    const result = await reconcileLinkedIdentityGlobalUserSurfaces({
      worktreePath: linked,
      primaryWorktreePath: primary,
      fs: nodeUserSurfaceMigrationFs,
      signpost: true,
    });

    expect(result).toEqual({ status: "ok", reconciled: [], signposted: [] });
    await expect(readFile(join(primaryUserDir, "STATUS.USER.md"), "utf8")).resolves.toBe("primary cache\n");
    await expect(readFile(join(linkedUserDir, "STATUS.USER.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not retire the linked copy in dry-run even with signposting on", async () => {
    const { primary, linked, primaryUserDir, linkedUserDir } = await makeWorktrees(root);
    await writeFile(join(linkedUserDir, "WORKING-MEMORY.md"), "linked memory\n");

    const result = await reconcileLinkedIdentityGlobalUserSurfaces({
      worktreePath: linked,
      primaryWorktreePath: primary,
      fs: nodeUserSurfaceMigrationFs,
      signpost: true,
      dryRun: true,
    });

    expect(result.status).toBe("ok");
    await expect(readFile(join(linkedUserDir, "WORKING-MEMORY.md"), "utf8")).resolves.toBe("linked memory\n");
    await expect(readFile(join(primaryUserDir, "WORKING-MEMORY.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
