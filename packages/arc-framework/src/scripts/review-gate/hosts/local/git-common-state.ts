/** Locked atomic state publication under a repository's Git common directory. */

import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { createProjectIdentityReader, resolveProjectIdentity, ProjectIdentityError } from "../../../../lib/store/project-identity.js";
import type { ReviewInvocationOptions } from "../../runtime/invocation.js";
import type { GitExec } from "../../../../lib/git/exec.js";
import type { GitCommonStatePublisher } from "../../../../lib/git-common-state.js";
import { canonicalDigest } from "../../../../lib/kernel/index.js";
import { withAdvisoryLock, releaseAdvisoryLock } from "../../../../lib/advisory-lock.js";
import { resolveGitCommonDir } from "../../../../lib/git/exec.js";

const RepositoryIdentityRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("repository-identity/v1"),
  repositoryId: z.uuid(),
});

const REPOSITORY_IDENTITY_RECORD = "repository-identity.json";

/** Read an existing repository identity without minting or locking state on first use. */
export async function readRepositoryIdentity(
  publisher: Pick<GitCommonStatePublisher, "read">,
  invocation: Pick<ReviewInvocationOptions, "store" | "projectId"> = {},
): Promise<string | null> {
  if (invocation.store?.capabilities.stateOffBranch) {
    return requireProjectIdentity(invocation.projectId ?? createProjectIdentityReader(invocation.store));
  }
  const raw = await publisher.read({ root: "review-gate", namespace: "identity" }, REPOSITORY_IDENTITY_RECORD);
  return raw === null ? null : RepositoryIdentityRecordSchema.parse(JSON.parse(raw)).repositoryId;
}

/** Serialize local review source release across concurrent prepare, attest, and resume commands. */
export async function withRepositoryLocalReviewLock<T>(
  exec: GitExec,
  cwd: string,
  action: () => Promise<T>,
): Promise<T> {
  const root = join(await resolveGitCommonDir(exec, cwd), "arc", "review-gate");
  await mkdir(root, { recursive: true, mode: 0o700 });
  return withAdvisoryLock(join(root, ".sweep.lock"), action);
}

/** Serialize one provider-effectful frontline operation across repository-local callers. */
export async function withRepositoryReviewOperationLock<T>(
  exec: GitExec,
  cwd: string,
  operationId: string,
  maxWaitMs: number,
  action: () => Promise<T>,
): Promise<T> {
  const root = join(await resolveGitCommonDir(exec, cwd), "arc", "review-gate", "operation-locks");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const lockId = canonicalDigest({
    domain: "arc.review-gate.operation-lock/v1",
    operationId,
  }).slice("sha256:".length);
  return withAdvisoryLock(join(root, `${lockId}.lock`), action, { maxWaitMs }, {
    // The operation-specific wait has always applied only to acquisition.
    releaseLock: (handle) => releaseAdvisoryLock(handle),
  });
}

/**
 * Resolve the Store's project identity when operational state is off branch.
 * Repository-backed invocations retain their UUID under the Git common directory.
 *
 * @param publisher - Locked repository-common state boundary.
 * @param mint - UUID minting seam for deterministic tests.
 * @param invocation - Selected operational Store and its bound project-identity reader.
 * @returns The selected repository identity.
 */
export async function resolveRepositoryIdentity(
  publisher: GitCommonStatePublisher,
  mint: () => string = randomUUID,
  invocation: Pick<ReviewInvocationOptions, "store" | "projectId"> = {},
): Promise<string> {
  if (invocation.store?.capabilities.stateOffBranch) {
    return requireProjectIdentity(invocation.projectId ?? createProjectIdentityReader(invocation.store));
  }
  return publisher.update({ root: "review-gate", namespace: "identity" }, REPOSITORY_IDENTITY_RECORD, (current) => {
    if (current !== null) {
      return {
        kind: "keep",
        result: RepositoryIdentityRecordSchema.parse(JSON.parse(current)).repositoryId,
      };
    }

    const record = RepositoryIdentityRecordSchema.parse({
      schemaVersion: 1,
      semanticsVersion: "repository-identity/v1",
      repositoryId: mint(),
    });
    return {
      kind: "write",
      content: `${JSON.stringify(record)}\n`,
      result: record.repositoryId,
    };
  });
}

async function requireProjectIdentity(reader: () => Promise<string>): Promise<string> {
  const result = await resolveProjectIdentity(reader);
  if (result.status !== "ready") throw new ProjectIdentityError(result);
  return result.id;
}
