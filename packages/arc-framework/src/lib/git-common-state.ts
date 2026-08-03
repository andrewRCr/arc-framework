/** Locked atomic state publication under a repository's Git common directory. */

import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { atomicWriteFile } from "./fs.js";
import type { GitExec } from "./git/exec.js";
import { acquireAdvisoryLock, releaseAdvisoryLock } from "./user-sync/notes-lock.js";
import { resolveGitCommonDir } from "./user-sync/repo-shared-paths.js";

/** Closed review-state namespace vocabulary. */
export type ReviewStateNamespace = "evidence" | "identity" | "operations" | "outcomes" | "sources";

/** Locked read/modify/publish boundary reusable by repository-common state stores. */
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
