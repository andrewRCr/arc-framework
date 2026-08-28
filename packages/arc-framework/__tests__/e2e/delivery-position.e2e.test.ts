/** Built-CLI coverage for fresh public delivery-position observation. */

import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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
import { deriveDeliveryProviderRefreshSubject } from "../../src/lib/delivery/provider-refresh-observation.js";
import { renderDeliveryPlanSection } from "../../src/lib/delivery/task-list-render.js";
import { DeliveryStateV1Schema, type DeliveryStateV1 } from "../../src/lib/delivery/schema.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { deliveryThreeMemberStackPlanFixture } from "../fixtures/delivery-plan.js";
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

type ActiveOperationScenario =
  | "review-fix"
  | "native"
  | "provider-refresh-partial"
  | "landed-prefix"
  | "terminal-authoring"
  | "registered-terminal-authoring"
  | "registered-local-terminal-authoring"
  | "selected-change-settled"
  | "selected-change-external-refresh"
  | "selected-change-terminal-authoring-before"
  | "selected-change-terminal-authoring-applied";

async function positionFixture(activeOperation?: ActiveOperationScenario) {
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
  await writeFile(join(repository, "member-three.txt"), "member three\n");
  await git(repository, ["add", "member-three.txt"]);
  await git(repository, ["commit", "-m", "member three"]);
  const thirdHead = await git(repository, ["rev-parse", "HEAD"]);
  const thirdTree = await git(repository, ["rev-parse", "HEAD^{tree}"]);
  await writeFile(join(repository, "reopened-work.txt"), "append-only terminal authoring\n");
  await git(repository, ["add", "reopened-work.txt"]);
  await git(repository, ["commit", "-m", "continue terminal authoring"]);
  const advancedThirdHead = await git(repository, ["rev-parse", "HEAD"]);
  const refreshedFirstHead = await git(repository, [
    "commit-tree", firstTree, "-p", targetHead, "-m", "refreshed member one",
  ]);
  const refreshedSecondHead = await git(repository, [
    "commit-tree", secondTree, "-p", refreshedFirstHead, "-m", "refreshed member two",
  ]);
  const selectedFirstHead = await git(repository, [
    "commit-tree", firstTree, "-p", firstHead, "-m", "selected member review fix",
  ]);
  const selectedSecondHead = await git(repository, [
    "commit-tree", secondTree, "-p", firstHead, "-m", "selected second member review fix",
  ]);
  const refreshedSecondAfterSelected = await git(repository, [
    "commit-tree", secondTree, "-p", selectedFirstHead, "-m", "refresh dependent member",
  ]);
  const selectedChangeSettled = activeOperation === "selected-change-settled"
    || activeOperation === "selected-change-external-refresh";
  const firstBranch = selectedChangeSettled ? "delivery/member-1" : "member-1";
  const secondBranch = selectedChangeSettled ? "delivery/member-2" : "member-2";
  const publishedFirstHead = activeOperation === "provider-refresh-partial"
    ? refreshedFirstHead
    : activeOperation === "selected-change-terminal-authoring-applied"
      || activeOperation === "selected-change-settled"
      || activeOperation === "selected-change-external-refresh"
      ? selectedFirstHead
      : firstHead;
  const publishedSecondHead = activeOperation === "selected-change-external-refresh"
    ? refreshedSecondAfterSelected
    : activeOperation === "registered-local-terminal-authoring"
      ? selectedSecondHead
      : secondHead;
  const terminalAuthoring = activeOperation === "terminal-authoring"
    || activeOperation === "registered-terminal-authoring"
    || activeOperation === "registered-local-terminal-authoring"
    || activeOperation === "selected-change-settled"
    || activeOperation === "selected-change-external-refresh"
    || activeOperation === "selected-change-terminal-authoring-before"
    || activeOperation === "selected-change-terminal-authoring-applied";
  const publishedThirdHead = terminalAuthoring
    && activeOperation !== "registered-local-terminal-authoring"
    ? advancedThirdHead
    : thirdHead;
  await git(repository, [
    "push", "origin",
    `${targetHead}:refs/heads/main`,
    `${publishedFirstHead}:refs/heads/${firstBranch}`,
    `${publishedSecondHead}:refs/heads/${secondBranch}`,
    `${publishedThirdHead}:refs/heads/member-3`,
  ]);
  if (activeOperation === "selected-change-external-refresh") {
    await git(repository, ["update-ref", `refs/heads/${firstBranch}`, selectedFirstHead]);
    await git(repository, ["update-ref", `refs/heads/${secondBranch}`, secondHead]);
    await git(repository, ["checkout", "-b", "member-3", advancedThirdHead]);
  } else if (activeOperation === "registered-local-terminal-authoring") {
    await git(repository, ["checkout", "-B", "member-3", advancedThirdHead]);
  }

  const plan = deliveryThreeMemberStackPlanFixture();
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
        ref: `refs/heads/${firstBranch}`,
        changeRequest: { providerId: "github", changeRequestId: "401" },
        coordinates: {
          base: targetHead,
          head: selectedChangeSettled ? selectedFirstHead : firstHead,
          tree: firstTree,
        },
      },
      {
        deliverableId: plan.members[1]!.deliverableId,
        ref: `refs/heads/${secondBranch}`,
        changeRequest: { providerId: "github", changeRequestId: "402" },
        coordinates: {
          base: firstHead,
          head: activeOperation === "registered-local-terminal-authoring" ? selectedSecondHead : secondHead,
          tree: secondTree,
        },
      },
      {
        deliverableId: plan.members[2]!.deliverableId,
        ref: "refs/heads/member-3",
        changeRequest: terminalAuthoring
          ? { providerId: "github", changeRequestId: "403" }
          : null,
        coordinates: { base: secondHead, head: thirdHead, tree: thirdTree },
      },
    ],
    activeOperation: null,
    pendingReviewFixVerification: null,
  });
  const publisher = new RepositoryGitCommonStatePublisher(createExecaGitExec(), repository);
  const plans = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
  const states = new RepositoryDeliveryStateStore(publisher);
  expect(await plans.publishCurrent(plan.planId, plan, null)).toMatchObject({ status: "ok" });
  expect(await states.publish(plan.planId, state, 0)).toMatchObject({ status: "ok" });

  if (activeOperation === "review-fix") {
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
  } else if (activeOperation === "native") {
    const members = state.members.slice(0, -1).map((_, index) => memberSnapshot(state, index));
    const top = members.at(-1);
    if (top?.changeRequest === null || top?.changeRequest === undefined || top.coordinates === null) {
      throw new Error("position fixture native member must be fully bound");
    }
    const snapshot = { target: state.target, members };
    const reserved = reserveDeliveryOperation({ revision: 1, value: state }, plan, {
      operationId: "interrupted-native-position-operation",
      kind: "land",
      mode: "native",
      affectedDeliverableIds: members.map(({ deliverableId }) => deliverableId),
      expectedStateRevision: 1,
      before: snapshot,
      requested: snapshot,
      effect: {
        providerId: "github",
        repository: "owner/repo",
        changeRequestId: top.changeRequest.changeRequestId,
        headSha: top.coordinates.head,
        baseRef: "main",
        targetRef: "refs/heads/main",
        strategy: "merge",
        mergePolicy: {
          repository: "owner/repo",
          stackPosition: "intermediate",
          method: "merge",
          allowedMethods: ["merge"],
          policyFingerprint: `sha256:${"a".repeat(64)}`,
        },
      },
    });
    expect(reserved.status).toBe("reserved");
    if (reserved.status !== "reserved") throw new Error("position fixture native reservation refused");
    expect(await states.publish(plan.planId, reserved.state, 1)).toMatchObject({ status: "ok" });
  } else if (activeOperation === "provider-refresh-partial") {
    const derived = deriveDeliveryProviderRefreshSubject({
      plan,
      state,
      facts: { target: state.target, members: state.members, landedDeliverableIds: [] },
    });
    if (derived.status !== "derived") throw new Error("position fixture refresh subject must derive");
    const requested = {
      target: derived.subject.before.target,
      members: derived.subject.before.members.map((member, index) => ({
        ...member,
        coordinates: member.coordinates === null ? null : {
          base: index === 0 ? targetHead : refreshedFirstHead,
          head: index === 0 ? refreshedFirstHead : refreshedSecondHead,
          tree: index === 0 ? firstTree : secondTree,
        },
      })),
    };
    const reserved = reserveDeliveryOperation({ revision: 1, value: state }, plan, {
      operationId: "interrupted-provider-refresh-position-operation",
      kind: "rewrite",
      mode: "provider-refresh",
      affectedDeliverableIds: derived.subject.affectedDeliverableIds,
      expectedStateRevision: 1,
      before: derived.subject.before,
      requested,
    });
    expect(reserved.status).toBe("reserved");
    if (reserved.status !== "reserved") throw new Error("position fixture refresh reservation refused");
    expect(await states.publish(plan.planId, reserved.state, 1)).toMatchObject({ status: "ok" });
  } else if (activeOperation === "selected-change-terminal-authoring-before"
    || activeOperation === "selected-change-terminal-authoring-applied") {
    const before = { target: state.target, members: [memberSnapshot(state, 0)] };
    const requested = {
      target: state.target,
      members: [{
        ...memberSnapshot(state, 0),
        coordinates: { base: targetHead, head: selectedFirstHead, tree: firstTree },
      }],
    };
    const reserved = reserveDeliveryOperation({ revision: 1, value: state }, plan, {
      operationId: "interrupted-selected-change-operation",
      kind: "rewrite",
      mode: "selected-change",
      affectedDeliverableIds: [state.members[0]!.deliverableId],
      expectedStateRevision: 1,
      before,
      requested,
    });
    expect(reserved.status).toBe("reserved");
    if (reserved.status !== "reserved") throw new Error("selected-change fixture reservation refused");
    expect(await states.publish(plan.planId, reserved.state, 1)).toMatchObject({ status: "ok" });
  }

  const fakeBin = await mkdtemp(join(tmpdir(), "arc-delivery-position-fake-bin-"));
  roots.push(fakeBin);
  const fakeGh = join(fakeBin, "gh");
  const request = (
    number: number,
    headRef: string,
    headSha: string,
    baseRef: string,
    state: "open" | "merged" = "open",
  ) => JSON.stringify({
    number,
    state: state === "merged" ? "closed" : "open",
    merged: state === "merged",
    draft: true,
    head: { ref: headRef, sha: headSha, repo: { full_name: "owner/repo" } },
    base: { ref: baseRef, repo: { full_name: "owner/repo" } },
    merge_commit_sha: state === "merged" ? headSha : null,
  });
  const registeredStack = JSON.stringify([{
    number: 901,
    base: { ref: "main" },
    pull_requests: [
      JSON.parse(request(401, firstBranch, "%s", "main")) as unknown,
      JSON.parse(request(402, secondBranch, "%s", firstBranch)) as unknown,
      JSON.parse(request(403, "member-3", "%s", secondBranch)) as unknown,
    ],
  }]);
  await writeFile(fakeGh, [
    "#!/bin/sh",
    "if [ -n \"${ARC_FAKE_GH_LOG:-}\" ]; then printf '%s\\n' \"$*\" >> \"$ARC_FAKE_GH_LOG\"; fi",
    "remote_head() { git ls-remote origin \"refs/heads/$1\" | cut -f1; }",
    "if [ \"${ARC_FAKE_TARGET_UNAVAILABLE:-0}\" = \"1\" ]; then exit 1; fi",
    "case \"$2\" in",
    "  repos/owner/repo/git/ref/heads/main)",
    `    printf '%s\\n' '${JSON.stringify({ object: { sha: targetHead } })}'`,
    "    ;;",
    `  repos/owner/repo/git/commits/${targetHead})`,
    `    printf '%s\\n' '${JSON.stringify({ tree: { sha: targetTree } })}'`,
    "    ;;",
    "  repos/owner/repo/pulls/401)",
    activeOperation === "landed-prefix"
      ? `    printf '%s\\n' '${request(401, firstBranch, publishedFirstHead, "main", "merged")}'`
      : `    printf '${request(401, firstBranch, "%s", "main")}\\n' "$(remote_head '${firstBranch}')"`,
    "    ;;",
    "  repos/owner/repo/pulls/402)",
    `    printf '${request(
      402,
      secondBranch,
      "%s",
      activeOperation === "landed-prefix" ? "main" : firstBranch,
    )}\\n' "$(remote_head '${secondBranch}')"`,
    "    ;;",
    "  repos/owner/repo/pulls/403)",
    `    printf '${request(403, "member-3", "%s", secondBranch)}\\n' "$(remote_head 'member-3')"`,
    "    ;;",
    "  repos/owner/repo/stacks)",
    activeOperation === "registered-terminal-authoring"
      || activeOperation === "registered-local-terminal-authoring"
      || activeOperation === "selected-change-settled"
      || activeOperation === "selected-change-external-refresh"
      ? `    printf '${registeredStack}\\n' "$(remote_head '${firstBranch}')" `
        + `"$(remote_head '${secondBranch}')" "$(remote_head 'member-3')"`
      : "    printf '%s\\n' '[]'",
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
    selectedFirstHead,
    env: { PATH: `${fakeBin}:${process.env.PATH ?? ""}` },
    request: JSON.stringify({ planId: plan.planId, repository: "owner/repo", remote: "origin" }),
  };
}

describe("arc delivery position", () => {
  it("re-enters and acknowledges a settled review-fix verification after response loss", async () => {
    const fixture = await positionFixture("selected-change-external-refresh");
    const selectedDeliverableId = fixture.plan.members[0]!.deliverableId;
    const discardedSettlement = await runArcWithStdin(
      ["delivery", "refresh", "adopt", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({
        planId: fixture.plan.planId,
        repository: "owner/repo",
        remote: "origin",
        scope: { kind: "dependent-suffix", selectedDeliverableId },
      })}\n`,
      { env: fixture.env },
    );
    expect(discardedSettlement.exitCode, `${discardedSettlement.stderr}\n${discardedSettlement.stdout}`).toBe(0);

    const pendingStateRead = await fixture.states.read(fixture.plan.planId);
    expect(pendingStateRead).toMatchObject({ status: "ok" });
    if (pendingStateRead.status !== "ok" || pendingStateRead.value === null) {
      throw new Error("settled review-fix continuation state must be readable");
    }
    const pendingNativeMembers = pendingStateRead.value.value.members.slice(0, -1).map((member, index, members) => ({
      deliverableId: member.deliverableId,
      changeRequestId: member.changeRequest!.changeRequestId,
      headRef: member.ref!.replace(/^refs\/heads\//u, ""),
      headSha: member.coordinates!.head,
      baseRef: index === 0 ? "main" : members[index - 1]!.ref!.replace(/^refs\/heads\//u, ""),
      headRepository: "owner/repo",
    }));
    const pendingHostLog = join(fixture.repository, "pending-native-host.log");
    await writeFile(pendingHostLog, "");
    const linked = await runArcWithStdin(
      ["delivery", "native", "link", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({
        planId: fixture.plan.planId,
        protectedBaseRef: "refs/heads/main",
        repository: "owner/repo",
        members: pendingNativeMembers,
        optIn: true,
      })}\n`,
      { env: { ...fixture.env, ARC_FAKE_GH_LOG: pendingHostLog } },
    );
    expect(linked.exitCode, `${linked.stderr}\n${linked.stdout}`).toBe(1);
    expect(JSON.parse(linked.stdout)).toMatchObject({
      status: "refused",
      reason: "pending-review-fix-verification",
    });
    expect(await readFile(pendingHostLog, "utf8")).toBe("");
    const unlinked = await runArcWithStdin(
      ["delivery", "native", "unlink", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({
        planId: fixture.plan.planId,
        repository: "owner/repo",
        members: pendingNativeMembers,
      })}\n`,
      { env: { ...fixture.env, ARC_FAKE_GH_LOG: pendingHostLog } },
    );
    expect(unlinked.exitCode, `${unlinked.stderr}\n${unlinked.stdout}`).toBe(1);
    expect(JSON.parse(unlinked.stdout)).toMatchObject({
      status: "blocked",
      reason: "pending-review-fix-verification",
    });
    expect(await readFile(pendingHostLog, "utf8")).toBe("");

    const taskListPath = join(fixture.repository, ".arc", "active", "tasks-delivery-plan-record.md");
    const taskList = [
      "# Task List: Delivery Plan Record",
      "",
      "- **Design:** `spec-delivery-plan-record.md`",
      "",
      "---",
      "",
      renderDeliveryPlanSection(fixture.plan),
      "## **Phase 1:** Build",
      "",
      "### `[ ]` **1.1 Close the selected member**",
      "",
    ].join("\n");
    await mkdir(join(fixture.repository, ".arc", "active"), { recursive: true });
    await writeFile(taskListPath, taskList);
    await writeFile(join(
      fixture.repository,
      ".arc",
      "active",
      `meta-${fixture.plan.workUnitId}.md`,
    ), [
      `# Metadata: ${fixture.plan.workUnitId}`,
      "",
      "- **State:** Active",
      "- **Branch:** main",
      "- **Task List:** `tasks-delivery-plan-record.md`",
      "",
    ].join("\n"));

    const entered = await runArcWithStdin(
      ["delivery", "entry", "inspect", "--input", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({ entryMode: "execution" })}\n`,
      { env: fixture.env },
    );
    expect(entered.exitCode, `${entered.stderr}\n${entered.stdout}`).toBe(0);
    const continuation = JSON.parse(entered.stdout) as {
      acknowledgementInput: {
        planId: string;
        selectedDeliverableId: string;
        expectedStateRevision: number;
        continuationDigest: string;
      };
    };
    expect(continuation).toMatchObject({
      status: "review-fix-verification-required",
      nextAction: "verify-review-fix",
      selectedDeliverableId,
      verification: { memberDeliverableIds: [selectedDeliverableId], tier1Required: true },
    });

    await writeFile(taskListPath, taskList.replace("### `[ ]` **1.1", "### `[x]` **1.1"));
    const acknowledgementRequest = `${JSON.stringify(continuation.acknowledgementInput)}\n`;
    const discarded = await runArcWithStdin(
      ["delivery", "review-fix", "acknowledge", "-", "--json"],
      fixture.repository,
      acknowledgementRequest,
      { env: fixture.env },
    );
    expect(discarded.exitCode, `${discarded.stderr}\n${discarded.stdout}`).toBe(0);

    const retried = await runArcWithStdin(
      ["delivery", "review-fix", "acknowledge", "-", "--json"],
      fixture.repository,
      acknowledgementRequest,
      { env: fixture.env },
    );
    expect(retried.exitCode, `${retried.stderr}\n${retried.stdout}`).toBe(0);
    expect(JSON.parse(retried.stdout)).toMatchObject({
      command: "delivery review-fix acknowledge",
      status: "already-acknowledged",
      nextAction: "continue-work-unit",
    });

    const resumed = await runArcWithStdin(
      ["delivery", "entry", "inspect", "--input", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({ entryMode: "execution" })}\n`,
      { env: fixture.env },
    );
    expect(resumed.exitCode, `${resumed.stderr}\n${resumed.stdout}`).toBe(0);
    expect(JSON.parse(resumed.stdout)).toMatchObject({
      status: "not-applicable",
      nextAction: "continue-work-unit",
    });
  });

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

  it("keeps retained landed bindings outside public refresh and review-fix subjects", async () => {
    const fixture = await positionFixture("landed-prefix");
    const refresh = await runArcWithStdin(
      ["delivery", "refresh", "plan", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({
        planId: fixture.plan.planId,
        repository: "owner/repo",
        remote: "origin",
        trigger: { kind: "operator-choice" },
        mechanics: "operator-initiated",
      })}\n`,
      { env: fixture.env },
    );

    expect(refresh.exitCode, `${refresh.stderr}\n${refresh.stdout}`).toBe(0);
    expect(JSON.parse(refresh.stdout)).toMatchObject({
      command: "delivery refresh plan",
      status: "refresh-required",
      plannedSuffix: [fixture.plan.members[1]!.deliverableId],
    });

    const reviewFix = await runArcWithStdin(
      ["delivery", "review-fix", "plan", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({
        planId: fixture.plan.planId,
        selectedDeliverableId: fixture.plan.members[1]!.deliverableId,
        repository: "owner/repo",
        remote: "origin",
      })}\n`,
      { env: fixture.env },
    );

    expect(reviewFix.exitCode, `${reviewFix.stderr}\n${reviewFix.stdout}`).toBe(0);
    expect(JSON.parse(reviewFix.stdout)).toMatchObject({
      command: "delivery review-fix plan",
      status: "planned",
      route: "rematerialize",
      selectedDeliverableId: fixture.plan.members[1]!.deliverableId,
      affectedDeliverableIds: [fixture.plan.members[1]!.deliverableId],
    });
  });

  it("routes review-fix planning through an append-only terminal authoring advance", async () => {
    const fixture = await positionFixture("terminal-authoring");
    const position = await runArcWithStdin(
      ["delivery", "position", "-", "--json"],
      fixture.repository,
      `${fixture.request}\n`,
      { env: fixture.env },
    );
    expect(position.exitCode).toBe(1);
    expect(JSON.parse(position.stdout)).toMatchObject({
      command: "delivery position",
      status: "refused",
      reason: "review-fix-routing-required",
      nextAction: "plan-review-fix",
      recommendedActionText: "Select the delivery member that owns the approved correction, then run "
        + "`arc delivery review-fix plan` before authoring or publishing replacement content.",
    });

    const reviewFix = await runArcWithStdin(
      ["delivery", "review-fix", "plan", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({
        planId: fixture.plan.planId,
        selectedDeliverableId: fixture.plan.members[0]!.deliverableId,
        repository: "owner/repo",
        remote: "origin",
      })}\n`,
      { env: fixture.env },
    );
    expect(reviewFix.exitCode, `${reviewFix.stderr}\n${reviewFix.stdout}`).toBe(0);
    expect(JSON.parse(reviewFix.stdout)).toMatchObject({
      command: "delivery review-fix plan",
      status: "planned",
      route: "rematerialize",
      selectedDeliverableId: fixture.plan.members[0]!.deliverableId,
    });
  });

  it("routes through append-only terminal authoring but refuses refresh before selected publication", async () => {
    const fixture = await positionFixture("registered-terminal-authoring");
    const selectedDeliverableId = fixture.plan.members[0]!.deliverableId;
    const reviewFix = await runArcWithStdin(
      ["delivery", "review-fix", "plan", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({
        planId: fixture.plan.planId,
        selectedDeliverableId,
        repository: "owner/repo",
        remote: "origin",
      })}\n`,
      { env: fixture.env },
    );
    expect(reviewFix.exitCode, `${reviewFix.stderr}\n${reviewFix.stdout}`).toBe(0);
    expect(JSON.parse(reviewFix.stdout)).toMatchObject({
      command: "delivery review-fix plan",
      status: "planned",
      route: "provider-refresh",
      selectedDeliverableId,
    });

    const refresh = await runArcWithStdin(
      ["delivery", "refresh", "execute", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({
        planId: fixture.plan.planId,
        repository: "owner/repo",
        remote: "origin",
        scope: { kind: "dependent-suffix", selectedDeliverableId },
      })}\n`,
      { env: fixture.env },
    );
    expect(refresh.exitCode).toBe(1);
    expect(JSON.parse(refresh.stdout)).toMatchObject({
      command: "delivery refresh execute",
      status: "refused",
      reason: "selected-member-invalid",
    });

    const completeRemainder = await runArcWithStdin(
      ["delivery", "refresh", "execute", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({
        planId: fixture.plan.planId,
        repository: "owner/repo",
        remote: "origin",
        scope: { kind: "complete-remainder" },
      })}\n`,
      { env: fixture.env },
    );
    expect(completeRemainder.exitCode).toBe(1);
    expect(JSON.parse(completeRemainder.stdout)).toMatchObject({
      command: "delivery refresh execute",
      status: "refused",
      reason: "position-mismatch",
    });
  });

  it("settles a dependent refresh onto local-only terminal authoring with the remote publication lease", async () => {
    const fixture = await positionFixture("registered-local-terminal-authoring");
    const selectedDeliverableId = fixture.plan.members[1]!.deliverableId;
    const reviewFix = await runArcWithStdin(
      ["delivery", "review-fix", "plan", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({
        planId: fixture.plan.planId,
        selectedDeliverableId,
        repository: "owner/repo",
        remote: "origin",
        entryMode: "execution",
      })}\n`,
      { env: fixture.env },
    );
    expect(reviewFix.exitCode, `${reviewFix.stderr}\n${reviewFix.stdout}`).toBe(0);
    expect(JSON.parse(reviewFix.stdout)).toMatchObject({
      command: "delivery review-fix plan",
      status: "planned",
      route: "provider-refresh",
      selectedDeliverableId,
    });

    const refresh = await runArcWithStdin(
      ["delivery", "refresh", "execute", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({
        planId: fixture.plan.planId,
        repository: "owner/repo",
        remote: "origin",
        scope: { kind: "dependent-suffix", selectedDeliverableId },
      })}\n`,
      { env: fixture.env },
    );
    expect(refresh.exitCode, `${refresh.stderr}\n${refresh.stdout}`).toBe(0);
    expect(JSON.parse(refresh.stdout)).toMatchObject({
      command: "delivery refresh execute",
      status: "applied",
      selectedDeliverableId,
      nextAction: "verify-review-fix",
    });

    const settled = await fixture.states.read(fixture.plan.planId);
    expect(settled).toMatchObject({
      status: "ok",
      value: {
        value: {
          activeOperation: null,
          pendingReviewFixVerification: {
            selectedDeliverableId,
            memberDeliverableIds: [selectedDeliverableId],
          },
        },
      },
    });
    if (settled.status !== "ok" || settled.value === null) {
      throw new Error("settled local-terminal refresh state must be readable");
    }
    const terminalHead = settled.value.value.members.at(-1)?.coordinates?.head;
    expect(terminalHead).toBe(await git(fixture.repository, ["rev-parse", "refs/heads/member-3"]));
    expect(terminalHead).toBe(await git(fixture.repository, [
      "ls-remote", "origin", "refs/heads/member-3",
    ]).then((line) => line.split("\t")[0]));
  });

  it("refuses ordinary external adoption while a selected correction awaits dependent refresh", async () => {
    const fixture = await positionFixture("selected-change-external-refresh");
    const before = await fixture.states.read(fixture.plan.planId);
    const result = await runArcWithStdin(
      ["delivery", "refresh", "adopt", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({
        planId: fixture.plan.planId,
        repository: "owner/repo",
        remote: "origin",
      })}\n`,
      { env: fixture.env },
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "delivery refresh adopt",
      status: "refused",
      reason: "selected-member-invalid",
    });
    await expect(fixture.states.read(fixture.plan.planId)).resolves.toEqual(before);
  });

  it("clears an unapplied selected review fix while terminal authoring remains append-only", async () => {
    const fixture = await positionFixture("selected-change-terminal-authoring-before");
    const result = await runArcWithStdin(
      ["delivery", "reconcile", "-", "--json"],
      fixture.repository,
      `${fixture.request}\n`,
      { env: fixture.env },
    );

    expect(result.exitCode, `${result.stderr}\n${result.stdout}`).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "delivery reconcile",
      status: "retryable",
      transition: "cleared",
      action: "delivery-review-fix-publish",
      selector: {
        operationKind: "rewrite",
        mode: "selected-change",
        affectedDeliverableIds: [fixture.plan.members[0]!.deliverableId],
      },
    });
    await expect(fixture.states.read(fixture.plan.planId)).resolves.toMatchObject({
      status: "ok",
      value: { revision: 3, value: { activeOperation: null } },
    });
  });

  it("continues an applied selected review fix into dependent refresh after interruption", async () => {
    const fixture = await positionFixture("selected-change-terminal-authoring-applied");
    const selectedDeliverableId = fixture.plan.members[0]!.deliverableId;
    const result = await runArcWithStdin(
      ["delivery", "reconcile", "-", "--json"],
      fixture.repository,
      `${fixture.request}\n`,
      { env: fixture.env },
    );

    expect(result.exitCode, `${result.stderr}\n${result.stdout}`).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "delivery reconcile",
      status: "applied",
      nextAction: "execute-provider-refresh",
      selectedDeliverableId,
      verification: {
        memberDeliverableIds: [selectedDeliverableId],
        tier1Required: true,
      },
    });
    const state = await fixture.states.read(fixture.plan.planId);
    expect(state).toMatchObject({
      status: "ok",
      value: { revision: 3, value: { activeOperation: null } },
    });
    expect(state.status === "ok" && state.value?.value.members[0]?.coordinates?.head)
      .toBe(fixture.selectedFirstHead);
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
    const fixture = await positionFixture("review-fix");
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

  it("routes an interrupted native landing to reconciliation before fresh observation", async () => {
    const fixture = await positionFixture("native");
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
      reason: "operation-active",
    });
    await expect(fixture.states.read(fixture.plan.planId)).resolves.toMatchObject({
      status: "ok",
      value: {
        revision: 2,
        value: { activeOperation: { operationId: "interrupted-native-position-operation" } },
      },
    });
  });

  it("routes a partially published provider refresh to reconciliation before fresh observation", async () => {
    const fixture = await positionFixture("provider-refresh-partial");
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
      value: {
        revision: 2,
        value: { activeOperation: { operationId: "interrupted-provider-refresh-position-operation" } },
      },
    });
  });
});
