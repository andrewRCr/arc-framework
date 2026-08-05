/** Locked atomic state publication under a repository's Git common directory. */

import { mkdir, readFile, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { atomicWriteFile } from "./fs.js";
import type { GitExec } from "./git/exec.js";
import { acquireAdvisoryLock, releaseAdvisoryLock } from "./user-sync/notes-lock.js";
import { resolveGitCommonDir } from "./user-sync/repo-shared-paths.js";

/** Closed review-state namespace vocabulary. */
export type ReviewStateNamespace = "evidence" | "identity" | "operations" | "outcomes" | "sources";

/** Closed delivery-state namespace vocabulary. */
export type DeliveryStateNamespace = "plans" | "state" | "authoring";

/** Runtime-validated repository-common root and namespace pair. */
export const GitCommonStateLocationSchema = z.discriminatedUnion("root", [
  z.strictObject({
    root: z.literal("review-gate"),
    namespace: z.enum(["evidence", "identity", "operations", "outcomes", "sources"]),
  }),
  z.strictObject({
    root: z.literal("delivery"),
    namespace: z.enum(["plans", "state", "authoring"]),
  }),
]);
export type GitCommonStateLocation = z.infer<typeof GitCommonStateLocationSchema>;

/** Explicit result of one locked record update. */
export type GitCommonStateUpdate<T> =
  | { readonly kind: "keep"; readonly result: T }
  | { readonly kind: "write"; readonly content: string; readonly result: T }
  | { readonly kind: "delete"; readonly result: T };

/** Injectable mutation boundaries for deterministic publisher failure tests. */
export interface GitCommonStatePublisherIO {
  readonly writeFile: typeof atomicWriteFile;
  readonly removeFile: (path: string) => Promise<void>;
}

/** One non-internal entry discovered in a repository-common namespace. */
export interface GitCommonStateEntry {
  readonly name: string;
  readonly kind: "file" | "other";
}

/** One namespace entry read while the namespace publication lock is held. */
export type GitCommonStateSnapshotEntry =
  | { readonly name: string; readonly kind: "file"; readonly content: string }
  | { readonly name: string; readonly kind: "other" };

/** Locked read/modify/publish boundary reusable by repository-common state stores. */
export interface GitCommonStatePublisher {
  update<T>(
    location: GitCommonStateLocation,
    recordName: string,
    update: (current: string | null) => GitCommonStateUpdate<T>
      | Promise<GitCommonStateUpdate<T>>,
  ): Promise<T>;
  read(location: GitCommonStateLocation, recordName: string): Promise<string | null>;
  list(location: GitCommonStateLocation): Promise<readonly GitCommonStateEntry[]>;
  snapshot(location: GitCommonStateLocation): Promise<readonly GitCommonStateSnapshotEntry[]>;
}

/** One mutation inside a namespace-locked multi-record transaction. */
export type GitCommonStateTransactionMutation =
  | { readonly recordName: string; readonly kind: "write"; readonly content: string }
  | { readonly recordName: string; readonly kind: "delete" };

/** Result and mutations selected while all named records are read under one namespace lock. */
export interface GitCommonStateTransaction<T> {
  readonly mutations: readonly GitCommonStateTransactionMutation[];
  readonly result: T;
}

/** Publisher extension for state whose integrity spans more than one record. */
export interface GitCommonStateTransactionPublisher extends GitCommonStatePublisher {
  transact<T>(
    location: GitCommonStateLocation,
    recordNames: readonly string[],
    transaction: (
      current: ReadonlyMap<string, string | null>,
    ) => GitCommonStateTransaction<T> | Promise<GitCommonStateTransaction<T>>,
  ): Promise<T>;
  transactSnapshot<T>(
    location: GitCommonStateLocation,
    transaction: (
      current: readonly GitCommonStateSnapshotEntry[],
    ) => GitCommonStateTransaction<T> | Promise<GitCommonStateTransaction<T>>,
  ): Promise<T>;
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
  private readonly writeFile: typeof atomicWriteFile;
  private readonly removeFile: (path: string) => Promise<void>;

  constructor(
    private readonly exec: GitExec,
    private readonly cwd: string,
    io: Partial<GitCommonStatePublisherIO> = {},
  ) {
    this.writeFile = io.writeFile ?? atomicWriteFile;
    this.removeFile = io.removeFile ?? unlink;
  }

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

  async list(location: GitCommonStateLocation): Promise<readonly GitCommonStateEntry[]> {
    const address = GitCommonStateLocationSchema.parse(location);
    let entries;
    try {
      entries = await readdir(await this.namespaceRoot(address), { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    return entries
      .filter((entry) => !entry.name.startsWith("."))
      .map((entry) => ({ name: entry.name, kind: entry.isFile() ? "file" as const : "other" as const }));
  }

  async snapshot(location: GitCommonStateLocation): Promise<readonly GitCommonStateSnapshotEntry[]> {
    const address = GitCommonStateLocationSchema.parse(location);
    const root = await this.namespaceRoot(address);
    await mkdir(root, { recursive: true, mode: 0o700 });
    const lock = await acquireAdvisoryLock(join(root, ".write.lock"));
    try {
      const entries = (await readdir(root, { withFileTypes: true }))
        .filter((entry) => !entry.name.startsWith("."));
      return await Promise.all(entries.map(async (entry): Promise<GitCommonStateSnapshotEntry> => (
        entry.isFile()
          ? { name: entry.name, kind: "file", content: await readFile(join(root, entry.name), "utf8") }
          : { name: entry.name, kind: "other" }
      )));
    } finally {
      await releaseAdvisoryLock(lock);
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
        await this.writeFile(join(root, recordName), next.content);
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

  async transact<T>(
    location: GitCommonStateLocation,
    recordNames: readonly string[],
    transaction: (
      current: ReadonlyMap<string, string | null>,
    ) => GitCommonStateTransaction<T> | Promise<GitCommonStateTransaction<T>>,
  ): Promise<T> {
    const address = GitCommonStateLocationSchema.parse(location);
    if (recordNames.length === 0 || new Set(recordNames).size !== recordNames.length) {
      throw new Error("Git common state transaction names must be non-empty and distinct");
    }
    for (const recordName of recordNames) parseAddress(address, recordName);

    const root = await this.namespaceRoot(address);
    await mkdir(root, { recursive: true, mode: 0o700 });
    const lock = await acquireAdvisoryLock(join(root, ".write.lock"));
    try {
      const current = new Map<string, string | null>();
      for (const recordName of recordNames) {
        try {
          current.set(recordName, await readFile(join(root, recordName), "utf8"));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          current.set(recordName, null);
        }
      }

      const next = await transaction(current);
      const mutated = new Set<string>();
      for (const mutation of next.mutations) {
        if (!current.has(mutation.recordName) || mutated.has(mutation.recordName)) {
          throw new Error("Git common state transaction mutated an undeclared or duplicate record");
        }
        mutated.add(mutation.recordName);
        if (mutation.kind === "write") {
          await this.writeFile(join(root, mutation.recordName), mutation.content);
        } else {
          try {
            await this.removeFile(join(root, mutation.recordName));
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
        }
      }
      return next.result;
    } finally {
      await releaseAdvisoryLock(lock);
    }
  }

  async transactSnapshot<T>(
    location: GitCommonStateLocation,
    transaction: (
      current: readonly GitCommonStateSnapshotEntry[],
    ) => GitCommonStateTransaction<T> | Promise<GitCommonStateTransaction<T>>,
  ): Promise<T> {
    const address = GitCommonStateLocationSchema.parse(location);
    const root = await this.namespaceRoot(address);
    await mkdir(root, { recursive: true, mode: 0o700 });
    const lock = await acquireAdvisoryLock(join(root, ".write.lock"));
    try {
      const directoryEntries = (await readdir(root, { withFileTypes: true }))
        .filter((entry) => !entry.name.startsWith("."));
      const current = await Promise.all(directoryEntries.map(async (entry): Promise<GitCommonStateSnapshotEntry> => (
        entry.isFile()
          ? { name: entry.name, kind: "file", content: await readFile(join(root, entry.name), "utf8") }
          : { name: entry.name, kind: "other" }
      )));
      const next = await transaction(current);
      const mutated = new Set<string>();
      for (const mutation of next.mutations) {
        parseAddress(address, mutation.recordName);
        if (mutated.has(mutation.recordName)) {
          throw new Error("Git common state transaction mutated a duplicate record");
        }
        mutated.add(mutation.recordName);
        if (mutation.kind === "write") {
          await this.writeFile(join(root, mutation.recordName), mutation.content);
        } else {
          try {
            await this.removeFile(join(root, mutation.recordName));
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
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
