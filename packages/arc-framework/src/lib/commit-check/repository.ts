/** Default repository adapter for commit-message validation consumers. */

import { join } from "node:path";

import { parseArcConfig } from "../config/index.js";
import type { GitExec } from "../git/index.js";
import { createFilesystemArtifactResolver } from "./artifact-resolver.js";
import { readCommitCheckConfiguration } from "./config.js";
import { createCommitCheckContext } from "./context.js";
import type {
  CommitCheckArtifactResolver,
  CommitCheckContext,
} from "./types.js";

/** Repository facts needed before a message can be decoded and validated. */
export interface CommitMessageCheckRepository {
  encoding: string;
  context: CommitCheckContext;
}

/** Injected system boundaries used to prepare the default repository adapter. */
export interface DefaultCommitCheckRepositoryDeps {
  exec: GitExec;
  readFile: (path: string) => Promise<string>;
  pathExists: (path: string) => Promise<boolean>;
  createArtifactResolver?: (arcRoot: string) => CommitCheckArtifactResolver;
}

/**
 * Resolve all repository facts shared by standalone, hook, and wrapper validation.
 *
 * @param root - Resolved ARC project and Git worktree root
 * @param deps - Injected Git and filesystem boundaries
 * @returns Decoder configuration and normalized validation context
 */
export async function createDefaultCommitCheckRepository(
  root: string,
  deps: DefaultCommitCheckRepositoryDeps,
): Promise<CommitMessageCheckRepository> {
  const arcRoot = join(root, ".arc");
  const [configurationText, encodingResult, roleResult, mergePathResult] = await Promise.all([
    deps.readFile(join(arcRoot, "system", "arc-config.yml")),
    deps.exec("git", ["config", "--get", "--default", "utf-8", "i18n.commitEncoding"], { cwd: root }),
    deps.exec("git", ["config", "--get", "--default", "maintainer", "arc.role"], { cwd: root }),
    deps.exec("git", ["rev-parse", "--path-format=absolute", "--git-path", "MERGE_HEAD"], { cwd: root }),
  ]);
  const mergeInProgress = await deps.pathExists(mergePathResult.stdout.trim());
  const resolveArtifact = (deps.createArtifactResolver ?? createFilesystemArtifactResolver)(arcRoot);

  return {
    encoding: encodingResult.stdout.trim(),
    context: createCommitCheckContext({
      configuration: readCommitCheckConfiguration(parseArcConfig(configurationText)),
      mergeInProgress,
      role: roleResult.stdout.trim(),
      resolveArtifact,
    }),
  };
}
