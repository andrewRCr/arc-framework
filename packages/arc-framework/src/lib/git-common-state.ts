/** Locked atomic state publication under a repository's Git common directory. */

import { mkdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { atomicWriteFile } from "./fs.js";
import type { GitExec } from "./git/exec.js";
import { acquireAdvisoryLock, releaseAdvisoryLock } from "./user-sync/notes-lock.js";
import { resolveGitCommonDir } from "./user-sync/repo-shared-paths.js";

/** Closed review-state namespace vocabulary. */
export type ReviewStateNamespace = "evidence" | "identity" | "operations" | "outcomes" | "sources";

/** Closed delivery-state namespace vocabulary. */
export type DeliveryStateNamespace = "plans" | "assignments" | "assurance" | "observations" | "authoring";

/** Runtime-validated repository-common root and namespace pair. */
export const GitCommonStateLocationSchema = z.discriminatedUnion("root", [
  z.strictObject({
    root: z.literal("review-gate"),
    namespace: z.enum(["evidence", "identity", "operations", "outcomes", "sources"]),
  }),
  z.strictObject({
    root: z.literal("delivery"),
    namespace: z.enum(["plans", "assignments", "assurance", "observations", "authoring"]),
  }),
]);
export type GitCommonStateLocation = z.infer<typeof GitCommonStateLocationSchema>;

/** Explicit result of one locked record update. */
export type GitCommonStateUpdate<T> =
  | { readonly kind: "keep"; readonly result: T }
  | { readonly kind: "write"; readonly content: string; readonly result: T }
  | { readonly kind: "delete"; readonly result: T };

/** Locked read/modify/publish boundary reusable by repository-common state stores. */
export interface GitCommonStatePublisher {
  update<T>(
    location: GitCommonStateLocation,
    recordName: string,
    update: (current: string | null) => GitCommonStateUpdate<T>
      | Promise<GitCommonStateUpdate<T>>,
  ): Promise<T>;
  read(location: GitCommonStateLocation, recordName: string): Promise<string | null>;
}

function parseAddress(location: unknown, recordName: string): GitCommonStateLocation {
  const parsed = GitCommonStateLocationSchema.parse(location);
  const extension = parsed.root === "delivery" && parsed.namespace === "authoring"
    ? "(?:json|md)"
    : "json";
  if (!new RegExp(`^[a-z0-9][a-z0-9.-]*\\.${extension}$`, "u").test(recordName)) {
    throw new Error("invalid Git common state record name");
  }
  return parsed;
}

/** Git-common-directory implementation with bounded advisory locking and atomic replacement. */
export class RepositoryGitCommonStatePublisher implements GitCommonStatePublisher {
  constructor(
    private readonly exec: GitExec,
    private readonly cwd: string,
    private readonly removeFile: (path: string) => Promise<void> = unlink,
  ) {}

  async read(location: GitCommonStateLocation, recordName: string): Promise<string | null> {
    const address = parseAddress(location, recordName);
    const path = await this.recordPath(address, recordName);
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async update<T>(
    location: GitCommonStateLocation,
    recordName: string,
    update: (current: string | null) => GitCommonStateUpdate<T>
      | Promise<GitCommonStateUpdate<T>>,
  ): Promise<T> {
    const address = parseAddress(location, recordName);
    const root = await this.namespaceRoot(address);
    await mkdir(root, { recursive: true, mode: 0o700 });
    const lock = await acquireAdvisoryLock(join(root, ".write.lock"));
    try {
      const current = await this.read(address, recordName);
      const next = await update(current);
      if (next.kind === "write") {
        await atomicWriteFile(join(root, recordName), next.content);
      } else if (next.kind === "delete") {
        try {
          await this.removeFile(join(root, recordName));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      return next.result;
    } finally {
      await releaseAdvisoryLock(lock);
    }
  }

  private async namespaceRoot(location: GitCommonStateLocation): Promise<string> {
    return join(await resolveGitCommonDir(this.exec, this.cwd), "arc", location.root, location.namespace);
  }

  private async recordPath(location: GitCommonStateLocation, recordName: string): Promise<string> {
    return join(await this.namespaceRoot(location), recordName);
  }
}
