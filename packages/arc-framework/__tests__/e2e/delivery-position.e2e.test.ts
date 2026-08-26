/** Built-CLI coverage for fresh public delivery-position observation. */

import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  RepositoryDeliveryPlanStore,
  RepositoryDeliveryStateStore,
} from "../../src/lib/delivery/local-stores.js";
import { reserveDeliveryOperation } from "../../src/lib/delivery/operation.js";
import { DeliveryPlanV1Codec } from "../../src/lib/delivery/plan.js";
import { DeliveryStateV1Schema, type DeliveryStateV1 } from "../../src/lib/delivery/schema.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { deliveryStackPlanFixture } from "../fixtures/delivery-plan.js";
import { cleanupTempDir, createTempRepo, git, runArc, runArcWithStdin } from "./helpers.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => cleanupTempDir(root)));
});

function memberSnapshot(state: DeliveryStateV1, index: number) {
  const member = state.members[index];
  if (member === undefined) throw new Error("position fixture member is missing");
  return {
    deliverableId: member.deliverableId,
    ref: member.ref,
    changeRequest: member.changeRequest,
    coordinates: member.coordinates,
  };
}

async function positionFixture(activeOperation = false) {
  const repository = await createTempRepo("arc-delivery-position-");
  const remote = await mkdtemp(join(tmpdir(), "arc-delivery-position-remote-"));
  roots.push(repository, remote);
  const initialized = await runArc(["init", "--yes", "--name", "delivery-position"], repository);
  expect(initialized.exitCode, initialized.stderr).toBe(0);
  await git(repository, ["add", "-A"]);
  await git(repository, ["commit", "-m", "init"]);
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
  await git(repository, ["remote", "add", "origin", remote]);

  const targetHead = await git(repository, ["rev-parse", "HEAD"]);
  const targetTree = await git(repository, ["rev-parse", "HEAD^{tree}"]);
  await writeFile(join(repository, "member-one.txt"), "member one\n");
  await git(repository, ["add", "member-one.txt"]);
  await git(repository, ["commit", "-m", "member one"]);
  const firstHead = await git(repository, ["rev-parse", "HEAD"]);
  const firstTree = await git(repository, ["rev-parse", "HEAD^{tree}"]);
  await writeFile(join(repository, "member-two.txt"), "member two\n");
  await git(repository, ["add", "member-two.txt"]);
  await git(repository, ["commit", "-m", "member two"]);
  const secondHead = await git(repository, ["rev-parse", "HEAD"]);
  const secondTree = await git(repository, ["rev-parse", "HEAD^{tree}"]);
  await git(repository, [
    "push", "origin",
    `${targetHead}:refs/heads/main`,
    `${firstHead}:refs/heads/member-1`,
    `${secondHead}:refs/heads/member-2`,
  ]);

  const plan = deliveryStackPlanFixture();
  const state = DeliveryStateV1Schema.parse({
    schemaVersion: 1,
    semanticsVersion: "delivery-state/v1",
    planId: plan.planId,
    workUnitId: plan.workUnitId,
    boundPlan: { planRevision: plan.planRevision, planDigest: plan.planDigest },
    target: { ref: "refs/heads/main", coordinates: { head: targetHead, tree: targetTree } },
    members: [
      {
        deliverableId: plan.members[0]!.deliverableId,
        ref: "refs/heads/member-1",
        changeRequest: null,
        coordinates: { base: targetHead, head: firstHead, tree: firstTree },
      },
      {
        deliverableId: plan.members[1]!.deliverableId,
        ref: "refs/heads/member-2",
        changeRequest: null,
        coordinates: { base: firstHead, head: secondHead, tree: secondTree },
      },
    ],
    activeOperation: null,
  });
  const publisher = new RepositoryGitCommonStatePublisher(createExecaGitExec(), repository);
  const plans = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
  const states = new RepositoryDeliveryStateStore(publisher);
  expect(await plans.publishCurrent(plan.planId, plan, null)).toMatchObject({ status: "ok" });
  expect(await states.publish(plan.planId, state, 0)).toMatchObject({ status: "ok" });

  if (activeOperation) {
    const before = { target: state.target, members: [memberSnapshot(state, 0)] };
    const reserved = reserveDeliveryOperation({ revision: 1, value: state }, plan, {
      operationId: "interrupted-position-operation",
      kind: "rewrite",
      mode: "review-fix",
      affectedDeliverableIds: [state.members[0]!.deliverableId],
      expectedStateRevision: 1,
      before,
      requested: before,
    });
    expect(reserved.status).toBe("reserved");
    if (reserved.status !== "reserved") throw new Error("position fixture reservation refused");
    expect(await states.publish(plan.planId, reserved.state, 1)).toMatchObject({ status: "ok" });
  }

  const fakeBin = join(repository, "fake-bin");
  const fakeGh = join(fakeBin, "gh");
  await mkdir(fakeBin);
  await writeFile(fakeGh, [
    "#!/bin/sh",
    "if [ \"${ARC_FAKE_TARGET_UNAVAILABLE:-0}\" = \"1\" ]; then exit 1; fi",
    "case \"$2\" in",
    "  repos/owner/repo/git/ref/heads/main)",
    `    printf '%s\\n' '${JSON.stringify({ object: { sha: targetHead } })}'`,
    "    ;;",
    `  repos/owner/repo/git/commits/${targetHead})`,
    `    printf '%s\\n' '${JSON.stringify({ tree: { sha: targetTree } })}'`,
    "    ;;",
    "  *) echo \"unexpected gh invocation: $*\" >&2; exit 1 ;;",
    "esac",
    "",
  ].join("\n"));
  await chmod(fakeGh, 0o755);
  return {
    repository,
    plan,
    states,
    env: { PATH: `${fakeBin}:${process.env.PATH ?? ""}` },
    request: JSON.stringify({ planId: plan.planId, repository: "owner/repo", remote: "origin" }),
  };
}

describe("arc delivery position", () => {
  it("composes fresh facts and returns the exact clean position", async () => {
    const fixture = await positionFixture();
    const result = await runArcWithStdin(
      ["delivery", "position", "-", "--json"],
      fixture.repository,
      `${fixture.request}\n`,
      { env: fixture.env },
    );

    expect(result.exitCode, `${result.stderr}\n${result.stdout}`).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      schemaVersion: 1,
      command: "delivery position",
      status: "position",
      position: {
        landedPrefix: [],
        firstUnlanded: fixture.plan.members[0]!.deliverableId,
        boundSuffix: fixture.plan.members.map(({ deliverableId }) => deliverableId),
      },
      nextAction: "review-member",
      selectedDeliverableId: fixture.plan.members[0]!.deliverableId,
    });
  });

  it("returns a typed refusal when fresh observation is unavailable", async () => {
    const fixture = await positionFixture();
    const result = await runArcWithStdin(
      ["delivery", "position", "-", "--json"],
      fixture.repository,
      `${fixture.request}\n`,
      { env: { ...fixture.env, ARC_FAKE_TARGET_UNAVAILABLE: "1" } },
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "delivery position",
      status: "refused",
      reason: "position-unavailable",
    });
  });

  it("keeps a freshly recoverable active operation on the reconciliation route", async () => {
    const fixture = await positionFixture(true);
    const result = await runArcWithStdin(
      ["delivery", "position", "-", "--json"],
      fixture.repository,
      `${fixture.request}\n`,
      { env: fixture.env },
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "delivery position",
      status: "refused",
      reason: "operation-active",
    });
    await expect(fixture.states.read(fixture.plan.planId)).resolves.toMatchObject({
      status: "ok",
      value: { revision: 2, value: { activeOperation: { operationId: "interrupted-position-operation" } } },
    });
  });
});
