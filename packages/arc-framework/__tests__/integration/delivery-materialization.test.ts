import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  observeDeliveryRemoteRef,
  deleteDeliveryRemoteRef,
  publishDeliveryMemberRef,
  publishDeliveryTopRef,
} from "../../src/lib/delivery/git-materialization.js";
import {
  bindInitialDeliveryRef,
  deriveDeliveryMaterialization,
  materializeBoundDeliveryChain,
} from "../../src/lib/delivery/materialization.js";
import { RepositoryDeliveryStateStore } from "../../src/lib/delivery/local-stores.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { deliveryStackPlanFixture } from "../fixtures/delivery-plan.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => removeGitBackedDir(root)));
});

describe("delivery materialization against a bare remote", () => {
  it("recreates a deleted state-bound member through the Git-backed state and ref ports", async () => {
    const repository = await createTempRepoCore({ prefix: "arc-delivery-rematerialize-" });
    roots.push(repository);
    const remoteParent = await mkdtemp(join(tmpdir(), "arc-delivery-rematerialize-remote-"));
    const remote = join(remoteParent, "remote.git");
    roots.push(remoteParent);
    await execFileAsync("git", ["init", "--bare", remote]);
    await execFileAsync("git", ["remote", "add", "origin", remote], { cwd: repository });
    await writeFile(join(repository, "README.md"), "base\n", "utf8");
    await execFileAsync("git", ["add", "README.md"], { cwd: repository });
    await execFileAsync("git", ["commit", "-m", "base"], { cwd: repository });
    const commit = async (path: string): Promise<{ head: string; tree: string }> => {
      await writeFile(join(repository, path), `${path}\n`, "utf8");
      await execFileAsync("git", ["add", path], { cwd: repository });
      await execFileAsync("git", ["commit", "-m", path], { cwd: repository });
      return {
        head: (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repository })).stdout.trim(),
        tree: (await execFileAsync("git", ["rev-parse", "HEAD^{tree}"], { cwd: repository })).stdout.trim(),
      };
    };
    const base = {
      head: (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repository })).stdout.trim(),
      tree: (await execFileAsync("git", ["rev-parse", "HEAD^{tree}"], { cwd: repository })).stdout.trim(),
    };
    const first = await commit("first.txt");
    const second = await commit("second.txt");
    await execFileAsync("git", ["push", "origin", `${base.head}:refs/heads/main`], { cwd: repository });
    await execFileAsync("git", ["push", "origin", `${second.head}:refs/heads/feat/example`], { cwd: repository });
    const exec: GitExec = async (command, args) => {
      const result = await execFileAsync(command, args, { cwd: repository });
      return { stdout: result.stdout, stderr: result.stderr };
    };
    const plan = deliveryStackPlanFixture();
    const derived = deriveDeliveryMaterialization(plan, {
      planId: plan.planId,
      workUnitId: plan.workUnitId,
      planRevision: plan.planRevision,
      planDigest: plan.planDigest,
      protectedBase: { ref: "refs/heads/main", ...base },
      chainBase: base,
      predecessorRelation: { kind: "advanced", observedTip: base.head, chainBase: base.head },
      top: { ref: "refs/heads/feat/example", ...second },
      members: [
        { deliverableId: plan.members[0]!.deliverableId, ref: "refs/heads/candidate-first", ...first },
        { deliverableId: plan.members[1]!.deliverableId, ref: "refs/heads/candidate-second", ...second },
      ],
      lifecyclePaths: [],
      regenerablePaths: [],
    });
    if (derived.status !== "derived") throw new Error("expected exact materialization plan");
    const stateStore = new RepositoryDeliveryStateStore(
      new RepositoryGitCommonStatePublisher(exec, repository),
    );
    const refs = {
      observe: (ref: string) => observeDeliveryRemoteRef(exec, "origin", ref),
      publish: async (ref: string, head: string) => {
        const result = await publishDeliveryMemberRef({ exec, remote: "origin", ref, head });
        return result.status === "refused" ? { status: "refused" as const } : result;
      },
    };
    const bound = await bindInitialDeliveryRef({ plan, materialization: derived.value, stateStore, refs });
    expect(bound.status).toBe("bound");
    await expect(materializeBoundDeliveryChain({
      plan,
      materialization: derived.value,
      stateStore,
      refs,
    })).resolves.toMatchObject({ status: "materialized" });
    const memberRef = derived.value.members[0]!.ref;
    if (memberRef === null) throw new Error("expected non-terminal delivery ref");
    await execFileAsync("git", ["push", "origin", `:${memberRef}`], { cwd: repository });
    await expect(observeDeliveryRemoteRef(exec, "origin", memberRef)).resolves.toEqual({ status: "absent" });

    await expect(materializeBoundDeliveryChain({
      plan,
      materialization: derived.value,
      stateStore,
      refs,
    })).resolves.toMatchObject({ status: "materialized" });
    await expect(observeDeliveryRemoteRef(exec, "origin", memberRef)).resolves.toEqual({
      status: "observed",
      head: first.head,
    });
    await expect(stateStore.read(plan.planId)).resolves.toMatchObject({
      status: "ok",
      value: { value: { activeOperation: null } },
    });
  });

  it("advances the top over ordinary unpublished local progress", async () => {
    const repository = await createTempRepoCore({ prefix: "arc-delivery-top-progress-" });
    roots.push(repository);
    const remoteParent = await mkdtemp(join(tmpdir(), "arc-delivery-top-remote-"));
    const remote = join(remoteParent, "remote.git");
    roots.push(remoteParent);
    await execFileAsync("git", ["init", "--bare", remote]);
    await execFileAsync("git", ["remote", "add", "origin", remote], { cwd: repository });
    const commit = async (path: string): Promise<string> => {
      await writeFile(join(repository, path), `${path}\n`, "utf8");
      await execFileAsync("git", ["add", path], { cwd: repository });
      await execFileAsync("git", ["commit", "-m", path], { cwd: repository });
      return (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repository })).stdout.trim();
    };
    const remoteHead = await commit("remote.txt");
    const topRef = "refs/heads/feat/example";
    await execFileAsync("git", ["push", "origin", `${remoteHead}:${topRef}`], { cwd: repository });
    const beforeHead = await commit("unpublished.txt");
    const requestedHead = await commit("adoption.txt");
    const exec: GitExec = async (command, args) => {
      const result = await execFileAsync(command, args, { cwd: repository });
      return { stdout: result.stdout, stderr: result.stderr };
    };

    await expect(publishDeliveryTopRef({
      exec, remote: "origin", ref: topRef, beforeHead, requestedHead,
    })).resolves.toEqual({ status: "published" });
    const published = await execFileAsync("git", ["ls-remote", "--refs", "origin", topRef], { cwd: repository });
    expect(published.stdout.trim()).toBe(`${requestedHead}\t${topRef}`);
  });

  it("creates by exact lease, adopts retry, and refuses a different head", async () => {
    const repository = await createTempRepoCore({ prefix: "arc-delivery-materialize-" });
    roots.push(repository);
    const remoteParent = await mkdtemp(join(tmpdir(), "arc-delivery-remote-"));
    const remote = join(remoteParent, "remote.git");
    roots.push(remoteParent);
    await execFileAsync("git", ["init", "--bare", remote]);
    await execFileAsync("git", ["remote", "add", "origin", remote], { cwd: repository });
    await writeFile(join(repository, "first.txt"), "first\n", "utf8");
    await execFileAsync("git", ["add", "first.txt"], { cwd: repository });
    await execFileAsync("git", ["commit", "-m", "first"], { cwd: repository });
    const first = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repository })).stdout.trim();
    const exec: GitExec = async (command, args) => {
      const result = await execFileAsync(command, args, { cwd: repository });
      return { stdout: result.stdout, stderr: result.stderr };
    };
    const ref = "refs/heads/delivery/example/first";
    await expect(publishDeliveryMemberRef({ exec, remote: "origin", ref, head: first }))
      .resolves.toEqual({ status: "published" });
    await expect(publishDeliveryMemberRef({ exec, remote: "origin", ref, head: first }))
      .resolves.toEqual({ status: "adopted" });
    const local = await execFileAsync("git", ["show-ref", "--verify", "--hash", ref], { cwd: repository });
    expect(local.stdout.trim()).toBe(first);

    await writeFile(join(repository, "second.txt"), "second\n", "utf8");
    await execFileAsync("git", ["add", "second.txt"], { cwd: repository });
    await execFileAsync("git", ["commit", "-m", "second"], { cwd: repository });
    const second = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repository })).stdout.trim();
    const topRef = "refs/heads/feat/example";
    await execFileAsync("git", ["push", "origin", `${first}:${topRef}`], { cwd: repository });
    await expect(publishDeliveryTopRef({
      exec, remote: "origin", ref: topRef, beforeHead: first, requestedHead: second,
    })).resolves.toEqual({ status: "published" });
    await expect(publishDeliveryTopRef({
      exec, remote: "origin", ref: topRef, beforeHead: first, requestedHead: second,
    })).resolves.toEqual({ status: "adopted" });
    const publishedTop = await execFileAsync("git", ["ls-remote", "--refs", "origin", topRef], { cwd: repository });
    expect(publishedTop.stdout.trim()).toBe(`${second}\t${topRef}`);

    await expect(publishDeliveryMemberRef({ exec, remote: "origin", ref, head: second }))
      .resolves.toEqual({ status: "refused", reason: "collision" });
    const retained = await execFileAsync("git", ["ls-remote", "--refs", "origin", ref], { cwd: repository });
    expect(retained.stdout.trim()).toBe(`${first}\t${ref}`);
    await expect(deleteDeliveryRemoteRef({ exec, remote: "origin", ref, expectedHead: second }))
      .resolves.toEqual({ status: "refused", reason: "collision" });
    await expect(deleteDeliveryRemoteRef({ exec, remote: "origin", ref, expectedHead: first }))
      .resolves.toEqual({ status: "deleted" });
    await expect(deleteDeliveryRemoteRef({ exec, remote: "origin", ref, expectedHead: first }))
      .resolves.toEqual({ status: "adopted" });
  });
});
