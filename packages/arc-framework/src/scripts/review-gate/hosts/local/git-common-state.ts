/** Locked atomic state publication under a repository's Git common directory. */

import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { atomicWriteFile } from "../../../../lib/fs.js";
import type { GitExec } from "../../../../lib/git/exec.js";
import { acquireAdvisoryLock, releaseAdvisoryLock } from "../../../../lib/user-sync/notes-lock.js";
import { resolveGitCommonDir } from "../../../../lib/user-sync/repo-shared-paths.js";

export type ReviewStateNamespace = "evidence" | "identity" | "operations" | "outcomes" | "sources";

const RepositoryIdentityRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("repository-identity/v1"),
  repositoryId: z.uuid(),
});

const REPOSITORY_IDENTITY_RECORD = "repository-identity.json";

/** Locked read/modify/publish boundary reusable by evidence and non-evidentiary state stores. */
export interface GitCommonStatePublisher {
  update<T>(
    namespace: ReviewStateNamespace,
    recordName: string,
    update: (current: string | null) => { content: string | null; result: T }
      | Promise<{ content: string | null; result: T }>,
  ): Promise<T>;
  read(namespace: ReviewStateNamespace, recordName: string): Promise<string | null>;
}

function assertRecordName(recordName: string): void {
  if (!/^[a-z0-9][a-z0-9.-]*\.json$/u.test(recordName)) throw new Error("invalid review state record name");
}

/** Git-common-directory implementation with bounded advisory locking and atomic replacement. */
export class RepositoryGitCommonStatePublisher implements GitCommonStatePublisher {
  constructor(
    private readonly exec: GitExec,
    private readonly cwd: string,
  ) {}

  async read(namespace: ReviewStateNamespace, recordName: string): Promise<string | null> {
    assertRecordName(recordName);
    const path = await this.recordPath(namespace, recordName);
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async update<T>(
    namespace: ReviewStateNamespace,
    recordName: string,
    update: (current: string | null) => { content: string | null; result: T }
      | Promise<{ content: string | null; result: T }>,
  ): Promise<T> {
    assertRecordName(recordName);
    const root = await this.namespaceRoot(namespace);
    await mkdir(root, { recursive: true, mode: 0o700 });
    const lock = await acquireAdvisoryLock(join(root, ".write.lock"));
    try {
      const current = await this.read(namespace, recordName);
      const next = await update(current);
      if (next.content !== null) await atomicWriteFile(join(root, recordName), next.content);
      return next.result;
    } finally {
      await releaseAdvisoryLock(lock);
    }
  }

  private async namespaceRoot(namespace: ReviewStateNamespace): Promise<string> {
    return join(await resolveGitCommonDir(this.exec, this.cwd), "arc", "review-gate", namespace);
  }

  private async recordPath(namespace: ReviewStateNamespace, recordName: string): Promise<string> {
    return join(await this.namespaceRoot(namespace), recordName);
  }
}

/** Serialize local review source release across concurrent prepare, attest, and resume commands. */
export async function withRepositoryReviewSweepLock<T>(
  exec: GitExec,
  cwd: string,
  action: () => Promise<T>,
): Promise<T> {
  const root = join(await resolveGitCommonDir(exec, cwd), "arc", "review-gate");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const lock = await acquireAdvisoryLock(join(root, ".sweep.lock"));
  try {
    return await action();
  } finally {
    await releaseAdvisoryLock(lock);
  }
}

/**
 * Resolves the stable identity of one local repository, minting it on first use.
 *
 * The record lives under the Git common directory, so every linked worktree
 * resolves the same identity and checkout-path relocation cannot change it.
 *
 * @param publisher - Locked repository-common state boundary.
 * @param mint - UUID minting seam for deterministic tests.
 * @returns The repository-local UUID.
 */
export async function resolveRepositoryIdentity(
  publisher: GitCommonStatePublisher,
  mint: () => string = randomUUID,
): Promise<string> {
  return publisher.update("identity", REPOSITORY_IDENTITY_RECORD, (current) => {
    if (current !== null) {
      return {
        content: null,
        result: RepositoryIdentityRecordSchema.parse(JSON.parse(current)).repositoryId,
      };
    }

    const record = RepositoryIdentityRecordSchema.parse({
      schemaVersion: 1,
      semanticsVersion: "repository-identity/v1",
      repositoryId: mint(),
    });
    return {
      content: `${JSON.stringify(record)}\n`,
      result: record.repositoryId,
    };
  });
}
