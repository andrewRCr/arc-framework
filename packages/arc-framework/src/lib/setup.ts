/**
 * Shared setup operations for `arc init` and `arc join`.
 *
 * Git integration (hooks path) and post-init user setup (identity, user
 * directory). Extracted from init.ts so both commands share the same setup
 * sequence.
 */

import { ensureDir, writeArcGitattributesBlock } from "./template/index.js";
import { detectHookManager } from "./hook-manager.js";
import { ARC_GIT_HOOKS_DIR, integrateHooks } from "./hook-integration.js";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { CoreIO } from "./types.js";
import type { ReadFileFn, WriteFileFn } from "./template/index.js";
import type { AccessFn } from "./hook-manager.js";
import { normalizeGitRejection } from "./git/process-error.js";

/** Options for git integration setup. */
export interface GitIntegrationOptions {
  cwd: string;
  exec: CoreIO["exec"];
  readFile: ReadFileFn;
  writeFile: WriteFileFn;
  access: AccessFn;
  /** Track the derived ROADMAP merge-driver attribute for arc-in-git projects. */
  enableRoadmapConflictRemedy?: boolean;
}

/** Attribute and local driver name for the derived ROADMAP conflict surface. */
export const ROADMAP_MERGE_ATTRIBUTE = ".arc/backlog/ROADMAP.md merge=arc-roadmap";
export const ROADMAP_MERGE_DRIVER_NAME = "ARC ROADMAP conflict remedy";
export const ROADMAP_MERGE_DRIVER_COMMAND = [
  "git merge-file %A %O %B",
  "status=$?",
  "if [ \"$status\" -ne 0 ]; then printf '%s\\n' 'ROADMAP conflict: if this is the only unresolved path, run \"arc hook-remedy-roadmap-conflict\" after Git finishes to regenerate and stage it.' >&2; fi",
  "exit \"$status\"",
].join("; ");

/** I/O needed to install the local ROADMAP driver and optional tracked attribute. */
export type RoadmapConflictRemedySetupOptions = Pick<
  GitIntegrationOptions,
  "cwd" | "exec" | "readFile" | "writeFile"
> & {
  /** Injectable wait boundary for bounded Git config retries. */
  waitForRetry?: (delayMs: number) => Promise<void>;
};

const GIT_CONFIG_RETRY_DELAYS_MS = [10, 25, 50, 100] as const;

/**
 * Configure git integration for an ARC project.
 *
 * Sets up the hooks path (integrating with an existing hook manager when
 * present, otherwise falling back to native git hooks). Both fresh init
 * and join need this.
 *
 * @param options - Git integration options with injectable I/O
 * @returns Native hook-manager installation instructions
 */
export async function configureGitIntegration(
  options: GitIntegrationOptions,
): Promise<string[]> {
  const { cwd, exec, readFile, writeFile, access, enableRoadmapConflictRemedy = false } = options;

  const hookManager = await detectHookManager(cwd, access);
  let messages: string[] = [];
  if (hookManager) {
    messages = await integrateHooks(hookManager, readFile, writeFile);
  } else {
    await exec("git", ["config", "core.hooksPath", ARC_GIT_HOOKS_DIR]);
  }

  await configureRoadmapConflictRemedy(
    { cwd, exec, readFile, writeFile },
    enableRoadmapConflictRemedy,
  );
  return messages;
}

/**
 * Install the repository-local ROADMAP merge driver and, for arc-in-git,
 * track its scoped attribute.
 *
 * @param options - Repository and injectable I/O
 * @param enableAttribute - Whether the project owns a tracked ROADMAP
 */
export async function configureRoadmapConflictRemedy(
  options: RoadmapConflictRemedySetupOptions,
  enableAttribute: boolean,
): Promise<void> {
  const { cwd, exec, readFile, writeFile, waitForRetry = delay } = options;
  await setLocalGitConfigWithRetry(
    exec,
    "merge.arc-roadmap.name",
    ROADMAP_MERGE_DRIVER_NAME,
    waitForRetry,
  );
  await setLocalGitConfigWithRetry(
    exec,
    "merge.arc-roadmap.driver",
    ROADMAP_MERGE_DRIVER_COMMAND,
    waitForRetry,
  );

  if (enableAttribute) {
    await writeArcGitattributesBlock(
      join(cwd, ".gitattributes"),
      [ROADMAP_MERGE_ATTRIBUTE],
      readFile,
      writeFile,
    );
  }
}

async function setLocalGitConfigWithRetry(
  exec: CoreIO["exec"],
  key: string,
  value: string,
  waitForRetry: (delayMs: number) => Promise<void>,
): Promise<void> {
  const args = ["config", "--local", key, value];
  for (let attempt = 0; ; attempt += 1) {
    try {
      await exec("git", args);
      return;
    } catch (error) {
      const normalized = normalizeGitRejection(error, { command: "git", args });
      const retryDelay = GIT_CONFIG_RETRY_DELAYS_MS[attempt];
      if (
        normalized.kind !== "nonzero-exit"
        || normalized.exitCode === undefined
        || retryDelay === undefined
      ) {
        throw normalized;
      }
      await waitForRetry(retryDelay);
    }
  }
}

/**
 * Cross-WU per-user instance files seeded into `user/{identity}/` at user-directory
 * creation (`arc init` / `arc join` via {@link runPostInitSetup}, and `arc user add`).
 * SESSION-NOTES is intentionally excluded — it is per-WU and seeded lazily by
 * `arc user open` once a work unit is anchored. Every creation path must seed the same
 * set, so both loops read this single source.
 */
export const CROSS_WU_INSTANCE_FILES = [
  "WORKING-MEMORY.md",
  "USER-INBOX.md",
] as const;

/** Options for post-init user setup. */
export interface PostInitSetupOptions {
  arcDir: string;
  internalTemplateDir: string;
  io: CoreIO;
  identityResult: string | null;
}

/**
 * Run post-init user setup shared by both fresh and join modes.
 *
 * Stores identity in git config and creates the user directory with the
 * cross-WU instance files (WORKING-MEMORY, USER-INBOX) seeded from the
 * internal templates. SESSION-NOTES is per-WU and seeded lazily by
 * `arc user open` once a work unit is anchored — there is no anchored WU
 * at init time. Per-user files seed cross-PM-mode (R65b) — `pm.mode` no
 * longer gates user-directory seeding.
 */
export async function runPostInitSetup(
  options: PostInitSetupOptions,
): Promise<void> {
  const { arcDir, internalTemplateDir, io, identityResult } = options;

  if (identityResult) {
    await io.exec("git", ["config", "--local", "arc.identity", identityResult]);

    const userDir = join(arcDir, "user", identityResult);
    await ensureDir(userDir, io.mkdir);

    for (const filename of CROSS_WU_INSTANCE_FILES) {
      const content = await io.readFile(join(internalTemplateDir, "user", filename));
      await io.writeFile(join(userDir, filename), content);
    }
  }
}
