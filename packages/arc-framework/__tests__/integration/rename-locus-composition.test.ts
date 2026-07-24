/**
 * End-to-end composition of a work-unit rename with the session locus model, over a real Git
 * worktree and a real record store. The assertion of record is the roster: after the rename, the
 * renamed subject must resolve as one managed role, with no stale record left at the old key and no
 * unmanaged checkout at the new path.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempRepo,
  execFileAsync,
  makeCommit,
  makeGitExec,
} from "../helpers/integration.js";
import { createLocusEvidenceIO } from "../../src/lib/locus/evidence.js";
import { createPlatformProcessInspector } from "../../src/lib/locus/platform-inspectors.js";
import { deriveLocusRecordId } from "../../src/lib/locus/path-identity.js";
import { readLocusEnvelope } from "../../src/lib/locus/reader.js";
import { mintLocusRecord } from "../../src/lib/locus/record-store.js";
import { locusRecordPath, resolveLocusRoot } from "../../src/lib/locus/root.js";
import {
  renameWorktreeOwnershipMarker,
  writeWorktreeOwnershipMarker,
} from "../../src/lib/git/worktree-marker.js";
import { scanRegisteredWorktrees } from "../../src/lib/git/worktree-roster.js";
import { createNodeRenameLocusDriver } from "../../src/lib/work-unit/rename-locus.js";

const IDENTITY = "andrew";
const PATH_FLAVOR = process.platform === "win32" ? "windows" : "posix";

function metaBody(slug: string): string {
  return `# Metadata: ${slug}\n\n`
    + `| **State** | **Owner** | **Branch** | **Class** | **Priority** |\n`
    + `|-----------|-----------|------------|-----------|--------------|\n`
    + `| \`Active\` | \`${IDENTITY}\` | \`feat/${slug}\` | \`Light\` | \`P2\` |\n\n`
    + `- **Cohort:** [none]\n- **Depends On:** [none]\n\n`
    + `- **Last Completed:** [none]\n- **Next Task:** [none]\n- **Blockers:** [none]\n\n`
    + `- **Current Workflow:** [none]\n- **Next Action:** [none]\n\n---\n`;
}

describe("rename composition with the session locus model", () => {
  let repo: string;
  let oldPath: string;
  let newPath: string;

  beforeEach(async () => {
    repo = await createTempRepo("arc-rename-locus-");
    await makeCommit(repo, "initial");
    oldPath = `${repo}.old-name`;
    newPath = `${repo}.new-name`;
    await execFileAsync("git", ["worktree", "add", "-b", "feat/new-name", oldPath], { cwd: repo });
  });

  afterEach(async () => {
    for (const path of [newPath, oldPath]) {
      try {
        await execFileAsync("git", ["worktree", "remove", "--force", path], { cwd: repo });
      } catch {
        // Whichever path the rename left behind is the only one still registered.
      }
    }
    await cleanupTempDir(repo);
  });

  it("leaves the renamed subject resolvable with no stale record or unmanaged checkout", async () => {
    const exec = makeGitExec(repo);

    // The renamed WU as the tracked rename leaves it: artifacts and marker already carry the new
    // slug, while the locus record still holds the pre-rename identity on both axes.
    await mkdir(join(oldPath, ".arc", "active"), { recursive: true });
    await writeFile(join(oldPath, ".arc", "active", "meta-new-name.md"), metaBody("new-name"), "utf8");
    await writeWorktreeOwnershipMarker(oldPath, {
      createdByArc: true,
      createdFor: { kind: "work-unit", name: "old-name" },
      spawningIdentity: IDENTITY,
      now: Date.parse("2026-07-24T00:00:00.000Z"),
    });
    expect((await renameWorktreeOwnershipMarker(oldPath, {
      oldWuName: "old-name",
      newWuName: "new-name",
    })).status).toBe("renamed");

    const root = await resolveLocusRoot({ identity: IDENTITY, scan: () => scanRegisteredWorktrees(exec) });
    if (!root.ok) throw new Error(`locus root unavailable: ${root.message}`);
    const oldIdentity = deriveLocusRecordId(oldPath, PATH_FLAVOR);
    const newIdentity = deriveLocusRecordId(newPath, PATH_FLAVOR);
    const minted = await mintLocusRecord({
      path: locusRecordPath(root, oldIdentity.digest),
      record: {
        schemaVersion: 1,
        recordId: oldIdentity.recordId,
        checkoutPath: oldPath,
        role: {
          kind: "work-unit",
          subject: { kind: "work-unit", key: "old-name", claimId: null },
          establishedAt: "2026-07-24T00:00:00.000Z",
          parentCheckoutPath: null,
          originEntry: null,
        },
        lease: null,
      },
    });
    if (minted.kind !== "created") throw new Error("fixture record already exists");

    const roster = await scanRegisteredWorktrees(exec);
    if (!roster.ok) throw new Error("worktree roster unavailable");
    const registered = roster.worktrees.find((entry) => entry.path === oldPath);
    if (registered === undefined) throw new Error("fixture worktree is not registered");

    const outcome = await createNodeRenameLocusDriver({ exec, identity: IDENTITY }).rekey({
      sourceCheckoutPath: oldPath,
      targetCheckoutPath: newPath,
      sourceSlug: "old-name",
      targetSlug: "new-name",
      expectedHead: registered.head,
      moveWorktree: async () => {
        await execFileAsync("git", ["worktree", "move", oldPath, newPath], { cwd: repo });
      },
    });

    expect(outcome).toEqual({ kind: "rekeyed", recordId: newIdentity.recordId });

    const envelope = await readLocusEnvelope({
      identity: IDENTITY,
      pathFlavor: PATH_FLAVOR,
      evidenceIO: createLocusEvidenceIO({
        exec,
        identity: IDENTITY,
        inspector: createPlatformProcessInspector(),
      }),
      subjectMetaIO: {
        readFile: (path) => import("node:fs/promises").then(({ readFile }) => readFile(path, "utf8")),
        pathExists: (path) => import("node:fs/promises")
          .then(({ access }) => access(path).then(() => true, () => false)),
        realpath: (path) => import("node:fs/promises").then(({ realpath }) => realpath(path)),
        lstat: (path) => import("node:fs/promises").then(({ lstat }) => lstat(path)),
      },
      activeExtensions: [],
    });

    if (!envelope.ok) throw new Error("locus roster is unavailable after the rename");
    const renamed = envelope.rows.filter((row) => row.checkoutPath === newPath);
    expect(renamed).toHaveLength(1);
    expect(renamed[0]).toMatchObject({
      kind: "managed-role",
      recordId: newIdentity.recordId,
      role: { kind: "work-unit", subject: { kind: "work-unit", key: "new-name" } },
      frame: "idle",
      diagnostics: [],
    });
    expect(envelope.rows.some((row) => row.kind === "stale-record")).toBe(false);
    expect(envelope.rows.some((row) => row.checkoutPath === oldPath)).toBe(false);
  });
});
