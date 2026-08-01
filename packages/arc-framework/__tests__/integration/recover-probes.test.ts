/** Integration coverage for recovery probe composition over real repository state. */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createRecoverStatusProbes } from "../../src/handlers/recover-probes.js";
import {
  TransientIdentityRecordSchema,
  transactTransientIdentities,
} from "../../src/lib/errand/index.js";
import {
  cleanupTempDir,
  createTempRepo,
  execFileAsync,
  makeCommit,
  makeGitExec,
  makeGitExecInput,
} from "../helpers/integration.js";

const IDENTITY = "andrew";

describe("recovery probe composition", () => {
  it("projects a legacy Errand's exact parent when multiple work units are active", async () => {
    const cwd = await createTempRepo("arc-recover-probes-");
    try {
      await makeCommit(cwd, "initial");
      await execFileAsync("git", ["switch", "-c", "chore/legacy"], { cwd });
      await writeArcFixture(cwd);

      const legacy = TransientIdentityRecordSchema.parse({
        version: 2,
        slug: "legacy",
        origin: "description",
        intent: "Close legacy",
        branch: "chore/legacy",
        returnBranch: "feat/parent",
        createdAt: "2026-07-21T00:00:00.000Z",
      });
      const transaction = await transactTransientIdentities({
        identity: IDENTITY,
        exec: makeGitExec(cwd),
        execInput: makeGitExecInput(cwd),
      }, {
        remote: null,
        message: "seed legacy identity",
        transform: (records) => {
          const next = new Map(records);
          next.set(legacy.slug, legacy);
          return { kind: "applied", records: next, value: null };
        },
      });
      expect(transaction.kind).toBe("applied");

      const probes = createRecoverStatusProbes({
        cwd,
        dirty: async () => ({ state: "clean", fileCount: 0 }),
        exec: makeGitExec(cwd),
      });
      const context = await probes.legacyErrand(IDENTITY, "maintainer", null);

      expect(context).toMatchObject({
        frame: {
          kind: "legacy-errand",
          slug: "legacy",
          returnBranch: "feat/parent",
          sessionType: "execution",
        },
        taskCursor: {
          status: "found",
          cursor: { section: { id: "1.1" }, leaf: { id: "1.1" } },
        },
      });
      expect(context?.loadSet.entries).toContainEqual({
        path: ".arc/active/meta-parent.md",
        readMode: { kind: "full" },
      });
      expect(context?.loadSet.entries).not.toContainEqual({
        path: ".arc/active/meta-sibling.md",
        readMode: { kind: "full" },
      });
    } finally {
      await cleanupTempDir(cwd);
    }
  });
});

async function writeArcFixture(cwd: string): Promise<void> {
  const system = join(cwd, ".arc", "system");
  const active = join(cwd, ".arc", "active");
  await Promise.all([
    mkdir(join(system, "extensions"), { recursive: true }),
    mkdir(active, { recursive: true }),
  ]);
  await writeFile(join(system, "arc-config.yml"), [
    "pm.mode: arc-in-git",
    "branch.protection: full",
    "commit.format: conventional",
    "commit.context_footer: required",
    "session.remote_sync: enabled",
  ].join("\n"));
  await Promise.all([
    writeFile(join(active, "meta-parent.md"), meta("parent", "feat/parent")),
    writeFile(join(active, "meta-sibling.md"), meta("sibling", "feat/sibling")),
    writeFile(join(active, "tasks-parent.md"), taskList("parent")),
    writeFile(join(active, "tasks-sibling.md"), taskList("sibling")),
  ]);
}

function meta(slug: string, branch: string): string {
  return [
    `# Metadata: ${slug}`,
    "",
    "- **State:** Active",
    `- **Branch:** ${branch}`,
    `- **Task List:** tasks-${slug}.md`,
    "- **Current Workflow:** [none]",
    "",
  ].join("\n");
}

function taskList(slug: string): string {
  return [
    `# Task List: ${slug}`,
    "",
    "## **Phase 1:** Work",
    "",
    "### `[ ]` **1.1 Continue work**",
    "",
  ].join("\n");
}
