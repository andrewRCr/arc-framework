/** Built-CLI coverage for fresh public delivery-position observation. */

import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  RepositoryDeliveryPlanStore,
  RepositoryDeliveryStateStore,
} from "../../src/lib/delivery/local-stores.js";
import { reserveDeliveryOperation } from "../../src/lib/delivery/operation.js";
import { DeliveryPlanV1Codec } from "../../src/lib/delivery/plan.js";
import { deriveDeliveryProviderRefreshSubject } from "../../src/lib/delivery/provider-refresh-observation.js";
import { deriveDeliveryResidueLocators } from "../../src/lib/delivery/residue-reaping.js";
import { renderDeliveryPlanSection } from "../../src/lib/delivery/task-list-render.js";
import { DeliveryStateV1Schema, type DeliveryStateV1 } from "../../src/lib/delivery/schema.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import {
  createCandidateAttestation,
  type CandidateManagedRecordV1,
} from "../../src/lib/work-unit/candidate-attestation.js";
import { readCandidateRecord, writeCandidateRecord } from "../../src/lib/work-unit/candidate-record-store.js";
import { collectGitCandidateTarget } from "../../src/lib/work-unit/git-candidate-subject.js";
import { writeSubmissionBoundary } from "../../src/lib/work-unit/submission-boundary-store.js";
import { projectPublicationBoundary } from
  "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { ApprovedDispositionRecordSchema } from
  "../../src/scripts/review-gate/core/advisory-records.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../src/scripts/review-gate/core/dispositions.js";
import { createFixAuthorization } from "../../src/scripts/review-gate/core/fix-authorization.js";
import { createReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { LocalApprovedDispositionRecordStore } from
  "../../src/scripts/review-gate/hosts/local/disposition-record-store.js";
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
  | "registered-current"
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
  const registeredCurrent = activeOperation === "registered-current";
  const firstBranch = selectedChangeSettled || registeredCurrent ? "delivery/member-1" : "member-1";
  const secondBranch = selectedChangeSettled || registeredCurrent ? "delivery/member-2" : "member-2";
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
        changeRequest: terminalAuthoring || registeredCurrent
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
    "if [ \"${ARC_FAKE_CLOSEOUT:-0}\" = \"1\" ]; then",
    "  case \"$2\" in",
    "    repos/owner/repo/pulls/403)",
    `      printf '%s\\n' '${request(403, "member-3", thirdHead, "main", "merged")}'`,
    "      exit 0",
    "      ;;",
    "    *) echo \"unexpected closeout gh invocation: $*\" >&2; exit 1 ;;",
    "  esac",
    "fi",
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
      || activeOperation === "registered-current"
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
  it("resumes one approved member fix without manufacturing a task cursor", async () => {
    const fixture = await positionFixture();
    const workUnitId = fixture.plan.workUnitId;
    const branch = `feat/${workUnitId}`;
    await git(fixture.repository, ["switch", "-c", branch]);
    const activeDir = join(fixture.repository, ".arc", "active");
    await mkdir(activeDir, { recursive: true });
    await writeFile(join(activeDir, `tasks-${workUnitId}.md`), [
      `# Task List: ${workUnitId}`,
      "",
      renderDeliveryPlanSection(fixture.plan),
      "## **Phase 1:** Members",
      "",
      "### `[x]` **1.1 Close member one**",
      "",
      "### `[x]` **1.2 Close member two**",
      "",
      "### `[x]` **1.3 Close member three**",
      "",
    ].join("\n"));
    await writeFile(join(activeDir, `meta-${workUnitId}.md`), [
      `# Metadata: ${workUnitId}`,
      "",
      "- **State:** Integrating",
      "- **Owner:** test-user",
      `- **Branch:** ${branch}`,
      `- **Task List:** tasks-${workUnitId}.md`,
      "- **Candidate:** [none]",
      "- **Current Workflow:** `integrate-work-unit`",
      "- **Last Completed:** Task 1.3 — Close member three",
      "- **Next Task:** [none]",
      "- **Next Action:** Resume hosted review",
      "",
    ].join("\n"));
    await git(fixture.repository, ["add", "-A"]);
    await git(fixture.repository, ["commit", "--no-verify", "-m", "install integration fixture"]);

    const stateRead = await fixture.states.read(fixture.plan.planId);
    expect(stateRead).toMatchObject({ status: "ok" });
    if (stateRead.status !== "ok" || stateRead.value === null) throw new Error("delivery state unavailable");
    const selectedMember = stateRead.value.value.members[0];
    const target = stateRead.value.value.target;
    if (selectedMember?.coordinates === null || selectedMember?.coordinates === undefined
      || target?.coordinates === null || target?.coordinates === undefined) {
      throw new Error("review-fix fixture requires exact member and target coordinates");
    }
    const oldTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "delivery-member",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: selectedMember.coordinates.base,
      diffBaseTree: target.coordinates.tree,
      headSha: selectedMember.coordinates.head,
      headTree: selectedMember.coordinates.tree,
    });
    const approvedDisposition = approveDispositionState({
      proposed: proposeDispositionSet(createDispositionSet({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        targetId: oldTarget.targetId,
        policyVersion: canonicalDigest({ policy: "review" }),
        rubricVersion: "standard-review/v1",
        rubricDigest: canonicalDigest({ rubric: "standard" }),
        proposedBy: "agent-1",
        findings: [{
          findingId: "finding-1",
          sourceIdentity: "codex-pr",
          locus: "member-one.txt:1",
          sourceVerification: "verified",
          verificationRefs: ["review:finding-1"],
          severity: "major",
          disposition: "fix",
          gating: "blocking",
          rationale: "The source confirms the issue.",
          recommendation: "Apply the fix.",
          openQuestions: [],
        }],
      })),
      approvedBy: "maintainer-1",
      approvedAt: "2026-08-31T12:00:00Z",
    });
    const publisher = new RepositoryGitCommonStatePublisher(createExecaGitExec(), fixture.repository);
    await new LocalApprovedDispositionRecordStore(publisher).appendDispositionRecord(
      ApprovedDispositionRecordSchema.parse({
        schemaVersion: 1,
        semanticsVersion: "review-advisory/v1",
        repositoryId: "repo-1",
        operationId: "operation-member-fix",
        candidate: null,
        errand: null,
        deliveryMember: {
          kind: "delivery-member",
          planId: fixture.plan.planId,
          deliverableId: selectedMember.deliverableId,
          workUnitId,
          head: selectedMember.coordinates.head,
        },
        source: {
          kind: "hosted",
          attemptRef: "arc-review-source:v1:hosted:lane-progress%2F1:hosted%2F1",
        },
        approvedDisposition,
        fixAuthorization: createFixAuthorization({ dispositionState: approvedDisposition, oldTarget }),
        errandFixResponse: null,
        deliveryMemberFixResponse: null,
      }),
    );

    const result = await runArcWithStdin(
      ["delivery", "review-fix", "continue", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({ repository: "owner/repo", remote: "origin" })}\n`,
      { env: fixture.env },
    );
    expect(result.exitCode, `${result.stderr}\n${result.stdout}`).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "delivery review-fix continue",
      status: "dispatch",
      action: {
        kind: "delivery-rematerialize",
        input: {
          planId: fixture.plan.planId,
          selectedDeliverableIds: [selectedMember.deliverableId],
        },
      },
    });
  });

  it("projects pending review-fix verification into the integration session", async () => {
    const fixture = await positionFixture();
    const workUnitId = fixture.plan.workUnitId;
    const branch = `feat/${workUnitId}`;
    await git(fixture.repository, ["switch", "-c", branch]);
    await writeFile(join(fixture.repository, "correction.txt"), "published correction\n");
    await git(fixture.repository, ["add", "correction.txt"]);
    await git(fixture.repository, ["commit", "--no-verify", "-m", "correction fixture"]);
    await git(fixture.repository, ["push", "-u", "origin", branch]);

    const activeDir = join(fixture.repository, ".arc", "active");
    const taskListPath = join(activeDir, `tasks-${workUnitId}.md`);
    const metaPath = join(activeDir, `meta-${workUnitId}.md`);
    await mkdir(activeDir, { recursive: true });
    await writeFile(taskListPath, [
      `# Task List: ${workUnitId}`,
      "",
      renderDeliveryPlanSection(fixture.plan),
      "## **Phase 1:** Members",
      "",
      "### `[x]` **1.1 Close member one**",
      "",
      "### `[x]` **1.2 Close member two**",
      "",
      "### `[x]` **1.3 Close member three**",
      "",
      "## **Phase 2:** Verification",
      "",
      "### `[x]` **2.1 Verify the work unit**",
      "",
    ].join("\n"));
    await writeFile(metaPath, [
      `# Metadata: ${workUnitId}`,
      "",
      "- **State:** Active",
      "- **Owner:** test-user",
      `- **Branch:** ${branch}`,
      `- **Task List:** tasks-${workUnitId}.md`,
      "- **Candidate:** [none]",
      "- **Current Workflow:** [none]",
      "- **Last Completed:** Task 2.1 — Verify the work unit",
      "- **Next Task:** [none]",
      "- **Next Action:** Attest the Candidate",
      "",
    ].join("\n"));
    await git(fixture.repository, ["add", "-A"]);
    await git(fixture.repository, ["commit", "--no-verify", "-m", "active fixture"]);

    const attested = await runArc(["attest", workUnitId, "--json"], fixture.repository);
    expect(attested.exitCode, `${attested.stderr}\n${attested.stdout}`).toBe(0);
    const stored = await fixture.states.read(fixture.plan.planId);
    expect(stored).toMatchObject({ status: "ok" });
    if (stored.status !== "ok" || stored.value === null) {
      throw new Error("delivery state must remain readable");
    }
    const selectedDeliverableId = fixture.plan.members[0]!.deliverableId;
    expect(await fixture.states.publish(fixture.plan.planId, {
      ...stored.value.value,
      pendingReviewFixVerification: {
        selectedDeliverableId,
        memberDeliverableIds: [selectedDeliverableId],
      },
    }, stored.value.revision)).toMatchObject({ status: "ok" });

    const attestedMeta = await readFile(metaPath, "utf8");
    await writeFile(
      metaPath,
      attestedMeta
        .replace("- **State:** Active", "- **State:** Integrating")
        .replace("- **Current Workflow:** `prepare-work-unit`", "- **Current Workflow:** `integrate-work-unit`"),
    );

    const result = await runArc(["status", "--session-init", "--json"], fixture.repository, {
      env: fixture.env,
    });
    expect(result.exitCode, `${result.stderr}\n${result.stdout}`).toBe(0);
    const envelope = JSON.parse(result.stdout) as {
      active: { ok: boolean; value?: { sessionType: string; currentWorkflow: string } };
      taskCursor?: { ok: boolean; value?: { status: string } };
      loadSet: { ok: boolean; value?: { entries: Array<{ path: string }> } };
    };
    expect(envelope.active).toMatchObject({
      ok: true,
      value: { sessionType: "integration", currentWorkflow: "integrate-work-unit" },
    });
    expect(envelope.taskCursor).toEqual({ ok: true, value: { status: "no-open-task" } });
    expect(envelope.loadSet.value?.entries.map(({ path }) => path)).toContain(
      ".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
    );
    expect(envelope.loadSet.value?.entries.map(({ path }) => path)).not.toContain(
      ".arc/system/workflows/arc/work-unit-lifecycle/verify-work-unit.md",
    );
  });

  it("re-enters and acknowledges a settled review-fix verification after response loss", async () => {
    const fixture = await positionFixture("selected-change-external-refresh");
    const workUnitBranch = `feat/${fixture.plan.workUnitId}`;
    const selectedDeliverableId = fixture.plan.members[0]!.deliverableId;
    const reviewedState = await fixture.states.read(fixture.plan.planId);
    if (reviewedState.status !== "ok" || reviewedState.value === null
      || reviewedState.value.value.target?.coordinates === null
      || reviewedState.value.value.target === null) {
      throw new Error("review-fix response fixture requires a bound target");
    }
    const reviewedMember = reviewedState.value.value.members.find(
      ({ deliverableId }) => deliverableId === selectedDeliverableId,
    );
    if (reviewedMember?.coordinates === null || reviewedMember?.coordinates === undefined) {
      throw new Error("review-fix response fixture requires a bound selected member");
    }
    const reviewedHead = await git(fixture.repository, [
      "rev-parse", `${reviewedMember.coordinates.head}^`,
    ]);
    const oldTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "delivery-member",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: reviewedMember.coordinates.base,
      diffBaseTree: reviewedState.value.value.target.coordinates.tree,
      headSha: reviewedHead,
      headTree: reviewedMember.coordinates.tree,
    });
    const approvedDisposition = approveDispositionState({
      proposed: proposeDispositionSet(createDispositionSet({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        targetId: oldTarget.targetId,
        policyVersion: canonicalDigest({ policy: "review" }),
        rubricVersion: "standard-review/v1",
        rubricDigest: canonicalDigest({ rubric: "standard" }),
        proposedBy: "agent-1",
        findings: [{
          findingId: "finding-response-loss",
          sourceIdentity: "codex-pr",
          locus: "member-one.txt:1",
          sourceVerification: "verified",
          verificationRefs: ["review:finding-response-loss"],
          severity: "major",
          disposition: "fix",
          gating: "blocking",
          rationale: "The source confirms the issue.",
          recommendation: "Apply the fix.",
          openQuestions: [],
        }],
      })),
      approvedBy: "maintainer-1",
      approvedAt: "2026-08-31T12:00:00Z",
    });
    const publisher = new RepositoryGitCommonStatePublisher(createExecaGitExec(), fixture.repository);
    await new LocalApprovedDispositionRecordStore(publisher).appendDispositionRecord(
      ApprovedDispositionRecordSchema.parse({
        schemaVersion: 1,
        semanticsVersion: "review-advisory/v1",
        repositoryId: "repo-1",
        operationId: "operation-response-loss",
        candidate: null,
        errand: null,
        deliveryMember: {
          kind: "delivery-member",
          planId: fixture.plan.planId,
          deliverableId: selectedDeliverableId,
          workUnitId: fixture.plan.workUnitId,
          head: reviewedHead,
        },
        source: {
          kind: "hosted",
          attemptRef: "arc-review-source:v1:hosted:lane-progress%2Fresponse-loss:hosted%2F1",
        },
        approvedDisposition,
        fixAuthorization: createFixAuthorization({ dispositionState: approvedDisposition, oldTarget }),
        errandFixResponse: null,
        deliveryMemberFixResponse: null,
      }),
    );
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
    await git(fixture.repository, ["switch", "-c", workUnitBranch]);

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

    const candidateTarget = await collectGitCandidateTarget({
      cwd: fixture.repository,
      name: fixture.plan.workUnitId,
      baseBranch: "main",
      exec: createExecaGitExec(),
    });
    const candidate: CandidateManagedRecordV1 = {
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      attestation: createCandidateAttestation({
        workUnit: fixture.plan.workUnitId,
        subject: candidateTarget.subject,
        baseRevision: candidateTarget.revision,
        attestedBy: "test-user",
        attestedAt: "2026-08-31T12:00:00.000Z",
        verificationEvidenceRef: "verification://review-fix/baseline",
      }),
      subject: candidateTarget.subject,
      transitions: [],
      lineageAttestations: [],
    };
    await writeCandidateRecord(fixture.repository, fixture.plan.workUnitId, candidate, null);
    await writeSubmissionBoundary(fixture.repository, projectPublicationBoundary({
      workUnit: fixture.plan.workUnitId,
      branch: workUnitBranch,
      candidateId: candidate.attestation.candidateId,
      candidateSubjectDigest: candidate.subject.subjectDigest,
      reservation: {
        schemaVersion: 1,
        semanticsVersion: "standard-review-reservation/v1",
        reservationId: `sha256:${"e".repeat(64)}`,
        sources: ["codex-pr"],
        target: {
          kind: "delivery",
          repository: "owner/repo",
          workUnitId: fixture.plan.workUnitId,
          planId: fixture.plan.planId,
        },
        obligation: {
          obligation: "required",
          reasons: ["sensitive-change-set"],
          rubricVersion: "standard-review/v1",
          rubricDigest: `sha256:${"f".repeat(64)}`,
          retrigger: "full-final",
          count: 1,
        },
      },
      changeRequest: { repository: "owner/repo", pullRequest: 42 },
    }), null);
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
      "- **State:** Integrating",
      "- **Owner:** test-user",
      `- **Branch:** ${workUnitBranch}`,
      "- **Task List:** `tasks-delivery-plan-record.md`",
      `- **Candidate:** \`${candidate.attestation.candidateId}\``,
      "- **Current Workflow:** `integrate-work-unit`",
      "- **Last Completed:** [none]",
      "- **Next Task:** [none]",
      "- **Next Action:** [none]",
      "",
    ].join("\n"));

    const entered = await runArcWithStdin(
      ["delivery", "entry", "inspect", "--input", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({ entryMode: "integrating" })}\n`,
      { env: fixture.env },
    );
    expect(entered.exitCode, `${entered.stderr}\n${entered.stdout}`).toBe(0);
    const continuation = JSON.parse(entered.stdout) as {
      verification: {
        target: { head: string; tree: string };
      };
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

    const controlled = await runArcWithStdin(
      ["delivery", "review-fix", "continue", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({ repository: "owner/repo", remote: "origin" })}\n`,
      { env: fixture.env },
    );
    expect(controlled.exitCode, `${controlled.stderr}\n${controlled.stdout}`).toBe(0);
    expect(JSON.parse(controlled.stdout)).toMatchObject({
      command: "delivery review-fix continue",
      status: "verification-required",
      selectedDeliverableId,
      verification: {
        target: continuation.verification.target,
        tier1Reuse: {
          kind: "exact-tree",
          targetTree: continuation.verification.target.tree,
          requiredResult: "passed",
          coveredInputs: "unchanged",
        },
      },
      acknowledgementInput: continuation.acknowledgementInput,
      resumeAction: {
        argv: ["arc", "delivery", "review-fix", "continue", "-", "--json"],
      },
    });

    await writeFile(taskListPath, taskList.replace("### `[ ]` **1.1", "### `[x]` **1.1"));
    await git(fixture.repository, ["add", "-A"]);
    const locus = await runArc(["locus", "--json"], fixture.repository, { env: fixture.env });
    expect(locus.exitCode, `${locus.stderr}\n${locus.stdout}`).toBe(0);
    expect(JSON.parse(locus.stdout), locus.stdout).toMatchObject({
      entering: {
        kind: "selected",
        row: {
          kind: "work-unit",
          subject: { kind: "work-unit", key: fixture.plan.workUnitId },
        },
      },
    });
    const acknowledgementRequest = `${JSON.stringify({
      ...continuation.acknowledgementInput,
      verification: {
        applicability: "focused",
        target: continuation.verification.target,
        tier1: {
          outcome: "passed",
          provenance: "rerun",
          targetTree: continuation.verification.target.tree,
        },
        verificationEvidenceRefs: ["criteria://member-1", "gates://tier-1"],
      },
    })}\n`;
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
      nextAction: "renew-public-continuation",
      candidate: {
        candidateId: candidate.attestation.candidateId,
      },
    });

    const acknowledgedStateRead = await fixture.states.read(fixture.plan.planId);
    expect(acknowledgedStateRead).toMatchObject({ status: "ok" });
    if (acknowledgedStateRead.status !== "ok" || acknowledgedStateRead.value === null) {
      throw new Error("acknowledged review-fix state must be readable");
    }
    expect(acknowledgedStateRead.value.value).toMatchObject({
      activeOperation: null,
      pendingReviewFixVerification: null,
    });
    const acknowledgedCandidate = await readCandidateRecord(fixture.repository, fixture.plan.workUnitId);
    expect(acknowledgedCandidate?.transitions.at(-1)).toMatchObject({
      transitionKind: "verification-response",
    });

    const recoveredEntry = await runArcWithStdin(
      ["delivery", "entry", "inspect", "--input", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({ entryMode: "integrating" })}\n`,
      { env: fixture.env },
    );
    expect(recoveredEntry.exitCode, `${recoveredEntry.stderr}\n${recoveredEntry.stdout}`).toBe(0);
    expect(JSON.parse(recoveredEntry.stdout)).toMatchObject({
      status: "candidate-renewal-required",
      nextAction: "renew-public-continuation",
    });

    const renewalRoute = await runArcWithStdin(
      ["delivery", "review-fix", "continue", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({ repository: "owner/repo", remote: "origin" })}\n`,
      { env: fixture.env },
    );
    expect(renewalRoute.exitCode, `${renewalRoute.stderr}\n${renewalRoute.stdout}`).toBe(0);
    expect(JSON.parse(renewalRoute.stdout)).toMatchObject({
      status: "authority-required",
      authority: "candidate-renewal",
      action: {
        kind: "candidate-renewal",
        argv: ["arc", "attest", fixture.plan.workUnitId, "--json"],
      },
    });

    const renewed = await runArc(["attest", fixture.plan.workUnitId, "--json"], fixture.repository, {
      env: fixture.env,
    });
    expect(renewed.exitCode, `${renewed.stderr}\n${renewed.stdout}`).toBe(0);
    expect(JSON.parse(renewed.stdout)).toMatchObject({
      status: "unchanged",
      locus: {
        locus: "hosted-review-pending",
        nextAction: { kind: "continue-hosted-review", workUnitId: fixture.plan.workUnitId },
      },
    });

    const resumed = await runArcWithStdin(
      ["delivery", "entry", "inspect", "--input", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({ entryMode: "integrating" })}\n`,
      { env: fixture.env },
    );
    expect(resumed.exitCode, `${resumed.stderr}\n${resumed.stdout}`).toBe(0);
    expect(JSON.parse(resumed.stdout)).toMatchObject({
      status: "continue-hosted-review",
      nextAction: "continue-hosted-review",
      hostedReviewAction: { kind: "continue-hosted-review", workUnitId: fixture.plan.workUnitId },
    });

    const hostedRoute = await runArcWithStdin(
      ["delivery", "review-fix", "continue", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({ repository: "owner/repo", remote: "origin" })}\n`,
      { env: fixture.env },
    );
    expect(hostedRoute.exitCode, `${hostedRoute.stderr}\n${hostedRoute.stdout}`).toBe(0);
    expect(JSON.parse(hostedRoute.stdout)).toMatchObject({
      status: "authority-required",
      authority: "hosted-review",
      action: {
        kind: "hosted-review",
        action: { kind: "continue-hosted-review", workUnitId: fixture.plan.workUnitId },
      },
    });

    const session = await runArc(["status", "--session-init", "--json"], fixture.repository, {
      env: fixture.env,
    });
    expect(session.exitCode, `${session.stderr}\n${session.stdout}`).toBe(0);
    expect(JSON.parse(session.stdout)).toMatchObject({
      active: {
        ok: true,
        value: { sessionType: "integration", currentWorkflow: "integrate-work-unit" },
      },
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
        entryMode: "execution",
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
      entryMode: "integrating",
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
        entryMode: "integrating",
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
        entryMode: "integrating",
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

  it("publishes a registered review fix through derived locators and reaps the exact pair at closeout", async () => {
    const fixture = await positionFixture("registered-current");
    const selectedDeliverableId = fixture.plan.members[0]!.deliverableId;
    const current = await fixture.states.read(fixture.plan.planId);
    const selectedMember = current.status === "ok"
      ? current.value?.value.members.find(({ deliverableId }) => deliverableId === selectedDeliverableId)
      : undefined;
    if (selectedMember?.ref === null || selectedMember?.ref === undefined || selectedMember.coordinates === null) {
      throw new Error("selected review-fix member must be bound");
    }
    if (current.status !== "ok" || current.value === null || current.value.value.target === null
      || current.value.value.target.coordinates === null) {
      throw new Error("selected review-fix target must be bound");
    }
    const reviewedHead = selectedMember.coordinates.head;
    const targetCoordinates = current.value.value.target.coordinates;
    await git(fixture.repository, ["update-ref", selectedMember.ref, selectedMember.coordinates.head]);
    const selectedTree = await git(fixture.repository, ["rev-parse", `${fixture.selectedFirstHead}^{tree}`]);
    const correctionHead = await git(fixture.repository, [
      "commit-tree", selectedTree, "-p", fixture.selectedFirstHead, "-m", "second selected review fix",
    ]);
    const gitCommonDir = resolve(
      fixture.repository,
      await git(fixture.repository, ["rev-parse", "--git-common-dir"]),
    );
    const derived = deriveDeliveryResidueLocators(fixture.plan, gitCommonDir);
    expect(derived.status).toBe("derived");
    if (derived.status !== "derived") throw new Error("review-fix locators must derive");
    const locator = derived.locators.find(({ deliverableId }) => deliverableId === selectedDeliverableId);
    if (locator === undefined) throw new Error("selected review-fix locator must exist");
    await git(fixture.repository, ["update-ref", locator.candidateRef, correctionHead]);
    await git(fixture.repository, ["worktree", "add", "--detach", locator.gatePath, correctionHead]);
    await mkdir(join(fixture.repository, ".arc", "active"), { recursive: true });
    await writeFile(join(
      fixture.repository,
      ".arc",
      "active",
      `tasks-${fixture.plan.workUnitId}.md`,
    ), [
      `# Task List: ${fixture.plan.workUnitId}`,
      "",
      renderDeliveryPlanSection(fixture.plan),
      "## **Phase 1:** Members",
      "",
      "### `[x]` **1.1 Close member one**",
      "",
    ].join("\n"));
    await writeFile(join(
      fixture.repository,
      ".arc",
      "active",
      `meta-${fixture.plan.workUnitId}.md`,
    ), [
      `# Metadata: ${fixture.plan.workUnitId}`,
      "",
      "- **State:** Integrating",
      "- **Branch:** main",
      `- **Task List:** tasks-${fixture.plan.workUnitId}.md`,
      "",
    ].join("\n"));
    const oldTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "delivery-member",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: selectedMember.coordinates.base,
      diffBaseTree: targetCoordinates.tree,
      headSha: reviewedHead,
      headTree: selectedMember.coordinates.tree,
    });
    const approvedDisposition = approveDispositionState({
      proposed: proposeDispositionSet(createDispositionSet({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        targetId: oldTarget.targetId,
        policyVersion: canonicalDigest({ policy: "review" }),
        rubricVersion: "standard-review/v1",
        rubricDigest: canonicalDigest({ rubric: "standard" }),
        proposedBy: "agent-1",
        findings: [{
          findingId: "finding-published",
          sourceIdentity: "codex-pr",
          locus: "member-one.txt:1",
          sourceVerification: "verified",
          verificationRefs: ["review:finding-published"],
          severity: "major",
          disposition: "fix",
          gating: "blocking",
          rationale: "The source confirms the issue.",
          recommendation: "Apply the fix.",
          openQuestions: [],
        }],
      })),
      approvedBy: "maintainer-1",
      approvedAt: "2026-08-31T12:00:00Z",
    });
    const publisher = new RepositoryGitCommonStatePublisher(createExecaGitExec(), fixture.repository);
    await new LocalApprovedDispositionRecordStore(publisher).appendDispositionRecord(
      ApprovedDispositionRecordSchema.parse({
        schemaVersion: 1,
        semanticsVersion: "review-advisory/v1",
        repositoryId: "repo-1",
        operationId: "operation-published-member-fix",
        candidate: null,
        errand: null,
        deliveryMember: {
          kind: "delivery-member",
          planId: fixture.plan.planId,
          deliverableId: selectedDeliverableId,
          workUnitId: fixture.plan.workUnitId,
          head: reviewedHead,
        },
        source: {
          kind: "hosted",
          attemptRef: "arc-review-source:v1:hosted:lane-progress%2Fpublished:hosted%2F1",
        },
        approvedDisposition,
        fixAuthorization: createFixAuthorization({ dispositionState: approvedDisposition, oldTarget }),
        errandFixResponse: null,
        deliveryMemberFixResponse: null,
      }),
    );

    const publishRequest = `${JSON.stringify({
      planId: fixture.plan.planId,
      selectedDeliverableId,
      repository: "owner/repo",
      remote: "origin",
    })}\n`;
    const published = await runArcWithStdin(
      ["delivery", "review-fix", "publish", "-", "--json"],
      fixture.repository,
      publishRequest,
      { env: fixture.env },
    );
    expect(published.exitCode, `${published.stderr}\n${published.stdout}`).toBe(0);
    expect(JSON.parse(published.stdout)).toMatchObject({
      command: "delivery review-fix publish",
      status: "published",
      selectedDeliverableId,
      nextAction: "execute-provider-refresh",
    });
    expect(await git(fixture.repository, ["rev-parse", locator.candidateRef])).toBe(correctionHead);
    expect(await git(locator.gatePath, ["rev-parse", "HEAD"])).toBe(correctionHead);

    const continued = await runArcWithStdin(
      ["delivery", "review-fix", "continue", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({ repository: "owner/repo", remote: "origin" })}\n`,
      { env: fixture.env },
    );
    expect(continued.exitCode, `${continued.stderr}\n${continued.stdout}`).toBe(0);
    expect(JSON.parse(continued.stdout)).toMatchObject({
      command: "delivery review-fix continue",
      status: "dispatch",
      action: {
        kind: "delivery-refresh-execute",
        input: {
          planId: fixture.plan.planId,
          scope: { kind: "dependent-suffix", selectedDeliverableId },
        },
      },
    });

    const beforeRetry = await fixture.states.read(fixture.plan.planId);
    const retried = await runArcWithStdin(
      ["delivery", "review-fix", "publish", "-", "--json"],
      fixture.repository,
      publishRequest,
      { env: fixture.env },
    );
    expect(retried.exitCode, `${retried.stderr}\n${retried.stdout}`).toBe(0);
    expect(JSON.parse(retried.stdout)).toMatchObject({
      command: "delivery review-fix publish",
      status: "published",
      selectedDeliverableId,
      nextAction: "execute-provider-refresh",
    });
    await expect(fixture.states.read(fixture.plan.planId)).resolves.toEqual(beforeRetry);

    const closed = await runArcWithStdin(
      ["delivery", "closeout", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({
        workUnitId: fixture.plan.workUnitId,
        repository: "owner/repo",
        remote: "origin",
      })}\n`,
      { env: { ...fixture.env, ARC_FAKE_CLOSEOUT: "1" } },
    );
    expect(closed.exitCode, `${closed.stderr}\n${closed.stdout}`).toBe(0);
    expect(JSON.parse(closed.stdout)).toMatchObject({
      command: "delivery closeout",
      status: "closed-out",
      planIds: [fixture.plan.planId],
    });
    await expect(git(fixture.repository, ["rev-parse", "--verify", locator.candidateRef]))
      .rejects.toBeDefined();
    expect(await git(fixture.repository, ["worktree", "list", "--porcelain"]))
      .not.toContain(locator.gatePath);
    await expect(fixture.states.read(fixture.plan.planId)).resolves.toMatchObject({
      status: "ok",
      value: null,
    });
  });

  it("plans a bound terminal correction as ordinary top authoring", async () => {
    const fixture = await positionFixture();
    const selectedDeliverableId = fixture.plan.members.at(-1)!.deliverableId;
    const result = await runArcWithStdin(
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

    expect(result.exitCode, `${result.stderr}\n${result.stdout}`).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "delivery review-fix plan",
      status: "planned",
      route: "terminal-authoring",
      selectedDeliverableId,
      affectedDeliverableIds: [selectedDeliverableId],
      nextAction: "author-terminal",
    });
  });

  it("plans a published terminal correction as exact rebind before resuming position", async () => {
    const fixture = await positionFixture("terminal-authoring");
    const selectedDeliverableId = fixture.plan.members.at(-1)!.deliverableId;
    const result = await runArcWithStdin(
      ["delivery", "review-fix", "plan", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({
        planId: fixture.plan.planId,
        selectedDeliverableId,
        repository: "owner/repo",
        remote: "origin",
        entryMode: "integrating",
      })}\n`,
      { env: fixture.env },
    );

    expect(result.exitCode, `${result.stderr}\n${result.stdout}`).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "delivery review-fix plan",
      status: "planned",
      route: "terminal-rebind",
      selectedDeliverableId,
      affectedDeliverableIds: [selectedDeliverableId],
      nextAction: "reconcile-terminal-publication",
      reconcileInput: {
        planId: fixture.plan.planId,
        repository: "owner/repo",
        remote: "origin",
        continuation: "read-position",
      },
    });
  });

  it("plans the operator fallback for a selected member whose dependent suffix still needs refresh", async () => {
    const fixture = await positionFixture("selected-change-settled");
    const selectedDeliverableId = fixture.plan.members[0]!.deliverableId;
    const dependentDeliverableId = fixture.plan.members[1]!.deliverableId;
    const result = await runArcWithStdin(
      ["delivery", "refresh", "plan", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({
        planId: fixture.plan.planId,
        repository: "owner/repo",
        remote: "origin",
        trigger: { kind: "landing-refused", reason: "conflict" },
        mechanics: "operator-initiated",
        scope: { kind: "dependent-suffix", selectedDeliverableId },
      })}\n`,
      { env: fixture.env },
    );

    expect(result.exitCode, `${result.stderr}\n${result.stdout}`).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "delivery refresh plan",
      status: "refresh-required",
      mechanics: "operator-initiated",
      plannedSuffix: [dependentDeliverableId],
    });
  });

  it("requires the exact selected-member scope for review-fix fallback planning", async () => {
    const fixture = await positionFixture("selected-change-settled");
    const request = {
      planId: fixture.plan.planId,
      repository: "owner/repo",
      remote: "origin",
      trigger: { kind: "landing-refused", reason: "conflict" },
      mechanics: "operator-initiated",
    } as const;
    const missing = await runArcWithStdin(
      ["delivery", "refresh", "plan", "-", "--json"],
      fixture.repository,
      `${JSON.stringify(request)}\n`,
      { env: fixture.env },
    );
    expect(missing.exitCode).toBe(1);
    expect(JSON.parse(missing.stdout)).toMatchObject({
      status: "refused",
      reason: "selected-member-invalid",
    });

    const complete = await runArcWithStdin(
      ["delivery", "refresh", "plan", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({
        ...request,
        scope: { kind: "complete-remainder" },
      })}\n`,
      { env: fixture.env },
    );
    expect(complete.exitCode).toBe(1);
    expect(JSON.parse(complete.stdout)).toMatchObject({
      status: "refused",
      reason: "selected-member-invalid",
    });

    const wrong = await runArcWithStdin(
      ["delivery", "refresh", "plan", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({
        ...request,
        scope: {
          kind: "dependent-suffix",
          selectedDeliverableId: fixture.plan.members.at(-1)!.deliverableId,
        },
      })}\n`,
      { env: fixture.env },
    );
    expect(wrong.exitCode).toBe(1);
    expect(JSON.parse(wrong.stdout)).toMatchObject({
      status: "refused",
      reason: "selected-member-invalid",
    });

    const unchanged = await runArcWithStdin(
      ["delivery", "refresh", "plan", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({
        ...request,
        scope: {
          kind: "dependent-suffix",
          selectedDeliverableId: fixture.plan.members[1]!.deliverableId,
        },
      })}\n`,
      { env: fixture.env },
    );
    expect(unchanged.exitCode).toBe(1);
    expect(JSON.parse(unchanged.stdout)).toMatchObject({
      status: "refused",
      reason: "selected-member-invalid",
    });
  });

  it("adopts an externally refreshed dependent suffix after selected-member publication", async () => {
    const fixture = await positionFixture("selected-change-external-refresh");
    const selectedDeliverableId = fixture.plan.members[0]!.deliverableId;
    const result = await runArcWithStdin(
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

    expect(result.exitCode, `${result.stderr}\n${result.stdout}`).toBe(0);
    const adopted = JSON.parse(result.stdout) as {
      readonly state: { readonly value: DeliveryStateV1 };
    };
    expect(adopted).toMatchObject({
      command: "delivery refresh adopt",
      status: "applied",
      selectedDeliverableId,
      nextAction: "verify-review-fix",
      verification: { memberDeliverableIds: [selectedDeliverableId], tier1Required: true },
      acknowledgementInput: {
        planId: fixture.plan.planId,
        selectedDeliverableId,
        continuationDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      },
      state: {
        value: {
          activeOperation: null,
          pendingReviewFixVerification: {
            selectedDeliverableId,
            memberDeliverableIds: [selectedDeliverableId],
          },
        },
      },
    });
    expect(adopted.state.value.members[0]?.coordinates?.head).toBe(fixture.selectedFirstHead);
    expect(adopted.state.value.members[1]?.coordinates?.base).toBe(fixture.selectedFirstHead);
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
