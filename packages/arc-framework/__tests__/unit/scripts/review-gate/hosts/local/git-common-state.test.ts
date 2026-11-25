/** Review mutex failures preserve the operation error and native release failure. */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acquireAdvisoryLock, AdvisoryLockTimeoutError, releaseAdvisoryLock, type AdvisoryLockHandle,
} from "../../../../../../src/lib/advisory-lock.js";
import { canonicalDigest } from "../../../../../../src/lib/kernel/index.js";
import {
  withRepositoryLocalReviewLock, withRepositoryReviewOperationLock,
} from "../../../../../../src/scripts/review-gate/hosts/local/git-common-state.js";
import { scriptGitExec } from "../../../../../helpers/git-exec-fake.js";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "arc-review-mutex-")); });
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

const operationId = "frontline/lock-scope-regression";
const operationLockId = canonicalDigest({ domain: "arc.review-gate.operation-lock/v1", operationId })
  .slice("sha256:".length);

describe.each(["local-review", "review-operation"] as const)("%s mutex", (kind) => {
  it("retains both errors, keeps the original release wait, and resumes after the lock is repaired", async () => {
    const common = join(root, ".git");
    const exec = scriptGitExec([
      { match: ["rev-parse", "--git-common-dir"], responses: [{ stdout: common, stderr: "" }] },
    ]).exec;
    const lockPath = kind === "local-review"
      ? join(common, "arc", "review-gate", ".sweep.lock")
      : join(common, "arc", "review-gate", "operation-locks", `${operationLockId}.lock`);
    const run = <T>(action: () => Promise<T>): Promise<T> => kind === "local-review"
      ? withRepositoryLocalReviewLock(exec, root, action)
      : withRepositoryReviewOperationLock(exec, root, operationId, 125, action);
    const operation = new Error("review publication failed");
    let held: AdvisoryLockHandle | undefined;
    let blocker: AdvisoryLockHandle | undefined;
    const failure = await run(async () => {
      const record = JSON.parse(await readFile(lockPath, "utf8")) as { pid: number; token: string };
      held = { path: lockPath, pid: record.pid, token: record.token };
      blocker = await acquireAdvisoryLock(`${lockPath}.break`);
      const startedAt = Date.now();
      vi.spyOn(Date, "now").mockReturnValueOnce(startedAt).mockReturnValue(startedAt + 10_001);
      throw operation;
    }).then(() => undefined, (error: unknown) => error);

    expect(failure).toBeInstanceOf(AggregateError);
    const aggregate = failure as AggregateError;
    expect(aggregate.message).toBe(operation.message);
    expect(aggregate.cause).toBe(operation);
    expect(aggregate.errors).toEqual([operation, expect.any(AdvisoryLockTimeoutError)]);
    expect(aggregate.errors[1]).toMatchObject({ lockPath, waitedMs: 10_000, phase: "release" });

    vi.restoreAllMocks();
    if (held === undefined || blocker === undefined) throw new Error("expected native lock handles");
    await releaseAdvisoryLock(blocker);
    await releaseAdvisoryLock(held);
    const expected = { completed: true };
    await expect(run(async () => expected)).resolves.toBe(expected);
    await expect(readFile(lockPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
