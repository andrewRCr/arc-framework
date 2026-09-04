/** Built-CLI coverage for fresh public delivery-position observation. */

import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
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
import { advanceDeliveryReviewFixResponse } from "../../src/lib/delivery/review-fix.js";
import { renderDeliveryPlanSection } from "../../src/lib/delivery/task-list-render.js";
import { DeliveryStateV1Schema, type DeliveryStateV1 } from "../../src/lib/delivery/schema.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import {
  candidateReviewApplicabilitySelections,
  createCandidateAttestation,
  createCandidateVerificationResponseEvidence,
  reduceCandidateDurableBaseline,
  type CandidateManagedRecordV1,
} from "../../src/lib/work-unit/candidate-attestation.js";
import {
  readCandidateRecord,
  resolveCandidateRecordRelativePath,
  writeCandidateRecord,
} from "../../src/lib/work-unit/candidate-record-store.js";
import { collectGitCandidateTarget } from "../../src/lib/work-unit/git-candidate-subject.js";
import {
  resolveSubmissionBoundaryPath,
  writeSubmissionBoundary,
} from "../../src/lib/work-unit/submission-boundary-store.js";
import { projectPublicationBoundary } from
  "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import type { DeliveryLocalReviewAdmission } from
  "../../src/scripts/review-gate/policy/delivery-local-review-admission.js";
import { ApprovedDispositionRecordSchema } from
  "../../src/scripts/review-gate/core/advisory-records.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../src/scripts/review-gate/core/dispositions.js";
import { createFixAuthorization } from "../../src/scripts/review-gate/core/fix-authorization.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createLocalReviewAdmission } from
  "../../src/scripts/review-gate/core/local-operation.js";
import { createLocalReviewSource } from
  "../../src/scripts/review-gate/core/local-review-source.js";
import type { LocalReviewState } from
  "../../src/scripts/review-gate/core/operation-state-schema.js";
import { bindReviewSourceReference } from
  "../../src/scripts/review-gate/core/review-source-reference.js";
import { LocalApprovedDispositionRecordStore } from
  "../../src/scripts/review-gate/hosts/local/disposition-record-store.js";
import { resolveRepositoryIdentity } from
  "../../src/scripts/review-gate/hosts/local/git-common-state.js";
import { LocalReviewOperationStateStore } from
  "../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import { HostedRequestHandleSchema } from
  "../../src/scripts/review-gate/hosted/request.js";
import {
  recordHostedPendingRequest,
  recordLaneAttempt,
  settleHostedAttemptFinding,
} from "../../src/scripts/review-gate/lane-progress.js";
import { deliveryThreeMemberStackPlanFixture } from "../fixtures/delivery-plan.js";
import { CLI_PATH } from "../helpers/cli-spawn.js";
import { cleanupTempDir, createTempRepo, git, runArc, runArcWithStdin } from "./helpers.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

function quoteShellArgument(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

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
  | "registered-current"
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
  const localArcBin = join(repository, "node_modules", ".bin");
  const localArc = join(localArcBin, "arc");
  await mkdir(localArcBin, { recursive: true });
  await writeFile(localArc, [
    "#!/bin/sh",
    `exec ${quoteShellArgument(process.execPath)} ${quoteShellArgument(CLI_PATH)} "$@"`,
    "",
  ].join("\n"));
  await chmod(localArc, 0o755);
  await git(repository, ["add", "-A"]);
  await git(repository, ["commit", "-m", "init"]);
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
  await git(repository, ["remote", "add", "origin", remote]);
  await git(repository, ["config", `url.${remote}.insteadOf`, "git@github.com:owner/repo.git"]);
  await git(repository, ["remote", "set-url", "origin", "git@github.com:owner/repo.git"]);

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
  if (firstBranch.startsWith("delivery/") && secondBranch.startsWith("delivery/")) {
    await git(repository, ["update-ref", `refs/heads/${firstBranch}`, publishedFirstHead]);
    await git(repository, ["update-ref", `refs/heads/${secondBranch}`, publishedSecondHead]);
  }
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
  const registeredFirstReviewTarget = JSON.stringify([{
    number: 401,
    url: "https://example.test/401",
    state: "OPEN",
    baseRefName: "main",
    headRefName: firstBranch,
    headRefOid: "%s",
  }]);
  const registeredSecondReviewTarget = JSON.stringify([{
    number: 402,
    url: "https://example.test/402",
    state: "OPEN",
    baseRefName: firstBranch,
    headRefName: secondBranch,
    headRefOid: "%s",
  }]);
  const registeredThirdReviewTarget = JSON.stringify([{
    number: 403,
    url: "https://example.test/403",
    state: "OPEN",
    baseRefName: secondBranch,
    headRefName: "member-3",
    headRefOid: "%s",
  }]);
  await writeFile(fakeGh, [
    "#!/bin/sh",
    "if [ -n \"${ARC_FAKE_GH_LOG:-}\" ]; then printf '%s\\n' \"$*\" >> \"$ARC_FAKE_GH_LOG\"; fi",
    "remote_head() { git ls-remote origin \"refs/heads/$1\" | cut -f1; }",
    "if [ \"$1\" = \"stack\" ]; then",
    "  case \"$2\" in",
    "    --version) printf '%s\\n' 'gh stack test'; exit 0 ;;",
    "    checkout)",
    "      git fetch origin '+refs/heads/" + firstBranch + ":refs/heads/" + firstBranch + "' "
      + "'+refs/heads/" + secondBranch + ":refs/heads/" + secondBranch + "' "
      + "'+refs/heads/main:refs/heads/main' >/dev/null 2>&1 || exit 1",
    "      exit 0",
    "      ;;",
    "    rebase)",
    "      first=$(git rev-parse 'refs/heads/" + firstBranch + "') || exit 1",
    "      member_two_blob=$(git rev-parse 'refs/heads/" + secondBranch + ":member-two.txt') || exit 1",
    "      git read-tree \"$first^{tree}\" || exit 1",
    "      git update-index --add --cacheinfo 100644,\"$member_two_blob\",member-two.txt || exit 1",
    "      second_tree=$(git write-tree) || exit 1",
    "      second=$(printf '%s\\n' 'provider refresh member two' | git -c user.name=test -c user.email=test@example.com commit-tree \"$second_tree\" -p \"$first\") || exit 1",
    "      git update-ref 'refs/heads/" + secondBranch + "' \"$second\" || exit 1",
    "      exit 0",
    "      ;;",
    "    view)",
    "      first=$(git rev-parse 'refs/heads/" + firstBranch + "') || exit 1",
    "      second=$(git rev-parse 'refs/heads/" + secondBranch + "') || exit 1",
    "      first_base=$(git rev-parse 'refs/heads/main') || exit 1",
    "      second_base=$first",
    "      printf '{\"trunk\":\"main\",\"currentBranch\":\"" + firstBranch + "\",\"branches\":["
      + "{\"name\":\"" + firstBranch + "\",\"head\":\"%s\",\"base\":\"%s\",\"isCurrent\":true,"
      + "\"isMerged\":false,\"isQueued\":false,\"needsRebase\":false,\"pr\":{\"number\":401,"
      + "\"url\":\"https://example.test/401\",\"state\":\"OPEN\"}},"
      + "{\"name\":\"" + secondBranch + "\",\"head\":\"%s\",\"base\":\"%s\",\"isCurrent\":false,"
      + "\"isMerged\":false,\"isQueued\":false,\"needsRebase\":false,\"pr\":{\"number\":402,"
      + "\"url\":\"https://example.test/402\",\"state\":\"OPEN\"}}]}\\n' "
      + "\"$first\" \"$first_base\" \"$second\" \"$second_base\"",
    "      exit 0",
    "      ;;",
    "    *) echo \"unexpected gh stack invocation: $*\" >&2; exit 1 ;;",
    "  esac",
    "fi",
    "if [ \"$1\" = \"repo\" ] && [ \"$2\" = \"view\" ]; then",
    "  printf '%s\\n' '{\"nameWithOwner\":\"owner/repo\"}'; exit 0",
    "fi",
    "if [ \"$1\" = \"pr\" ] && [ \"$2\" = \"list\" ]; then",
    activeOperation === "registered-current"
      ? [
        "  case \"$*\" in",
        `    *"--head ${firstBranch}"*) printf '${registeredFirstReviewTarget}\\n' `
          + `"$(remote_head '${firstBranch}')" ;;`,
        `    *"--head ${secondBranch}"*) printf '${registeredSecondReviewTarget}\\n' `
          + `"$(remote_head '${secondBranch}')" ;;`,
        `    *"--head member-3"*) printf '${registeredThirdReviewTarget}\\n' `
          + `"$(remote_head 'member-3')" ;;`,
        "    *) printf '%s\\n' '[]' ;;",
        "  esac",
        "  exit 0",
      ].join("\n")
      : "  echo \"unexpected gh pr list invocation: $*\" >&2; exit 1",
    "fi",
    "if [ \"$1\" = \"pr\" ] && [ \"$2\" = \"checks\" ]; then",
    "  printf '%s\\n' '[]'; exit 0",
    "fi",
    "if [ \"$1\" = \"api\" ] && [ \"$2\" = \"--paginate\" ] && [ \"$3\" = \"--slurp\" ]; then",
    "  printf '%s\\n' '[[]]'; exit 0",
    "fi",
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
    "  repos/owner/repo/branches/main|"
      + "repos/owner/repo/branches/delivery%2Fmember-1|"
      + "repos/owner/repo/branches/delivery%2Fmember-2)",
    "    printf '%s\\n' '{}';;",
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
    "    if [ -n \"${ARC_FAKE_TERMINAL_REF:-}\" ]; then",
    `      printf '${request(403, "%s", "%s", secondBranch)}\\n' `
      + `"$ARC_FAKE_TERMINAL_REF" "$(remote_head "$ARC_FAKE_TERMINAL_REF")"`,
    "    else",
    `      printf '${request(403, "member-3", "%s", secondBranch)}\\n' "$(remote_head 'member-3')"`,
    "    fi",
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
  const fixturePath = (process.env.PATH ?? "")
    .split(delimiter)
    .filter((entry) => !entry.replaceAll("\\", "/").endsWith("/node_modules/.bin"))
    .join(delimiter);
  return {
    repository,
    plan,
    states,
    selectedFirstHead,
    env: { PATH: `${fakeBin}${delimiter}${fixturePath}` },
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
    const metaPath = join(activeDir, `meta-${workUnitId}.md`);
    await writeFile(metaPath, [
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

    const candidateTarget = await collectGitCandidateTarget({
      cwd: fixture.repository,
      name: workUnitId,
      baseBranch: "main",
      exec: createExecaGitExec(),
    });
    const candidate: CandidateManagedRecordV1 = {
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      attestation: createCandidateAttestation({
        workUnit: workUnitId,
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
    await writeCandidateRecord(fixture.repository, workUnitId, candidate, null);
    await writeFile(
      metaPath,
      (await readFile(metaPath, "utf8")).replace(
        "- **Candidate:** [none]",
        `- **Candidate:** \`${candidate.attestation.candidateId}\``,
      ),
    );
    await writeSubmissionBoundary(fixture.repository, projectPublicationBoundary({
      workUnit: workUnitId,
      branch,
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
          workUnitId,
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
    await git(fixture.repository, [
      "add",
      ".arc/active",
      resolveCandidateRecordRelativePath(workUnitId),
      resolveSubmissionBoundaryPath(workUnitId),
    ]);
    await git(fixture.repository, ["commit", "--no-verify", "-m", "bind integration candidate"]);

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
    const fixAuthorization = createFixAuthorization({ dispositionState: approvedDisposition, oldTarget });
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
        fixAuthorization,
        errandFixResponse: null,
        deliveryMemberFixResponse: null,
      }),
    );

    const entry = await runArcWithStdin(
      ["delivery", "entry", "inspect", "--input", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({ entryMode: "integrating" })}\n`,
      { env: fixture.env },
    );
    expect(entry.exitCode, `${entry.stderr}\n${entry.stdout}`).toBe(0);
    expect(JSON.parse(entry.stdout), entry.stdout).toMatchObject({
      status: "correction-routing-required",
      nextAction: "plan-review-fix",
      planId: fixture.plan.planId,
      selectedDeliverableId: selectedMember.deliverableId,
    });

    const session = await runArc(["status", "--session-init", "--json"], fixture.repository, {
      env: fixture.env,
    });
    expect(session.exitCode, `${session.stderr}\n${session.stdout}`).toBe(0);
    expect(JSON.parse(session.stdout), session.stdout).toMatchObject({
      derivedLocusState: {
        ok: true,
        value: {
          entering: {
            kind: "selected",
            row: { context: { workUnitStage: "delivery-correction" } },
          },
        },
      },
    });

    const result = await runArcWithStdin(
      ["delivery", "review-fix", "continue", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({ repository: "owner/repo", remote: "origin" })}\n`,
      { env: fixture.env },
    );
    expect(result.exitCode, `${result.stderr}\n${result.stdout}`).toBe(0);
    expect(JSON.parse(result.stdout), result.stdout).toMatchObject({
      command: "delivery review-fix continue",
      status: "authoring-required",
      route: "rematerialize",
      selectedDeliverableId: selectedMember.deliverableId,
      authoring: {
        kind: "top",
        ref: `refs/heads/${branch}`,
        checkoutPath: fixture.repository,
      },
      approvedDispositionSet: {
        authorizedFindingIds: ["finding-1"],
        authorizedFindingLoci: ["member-one.txt:1"],
      },
      authoringAuthorization: {
        fixAuthorizationId: fixAuthorization.fixAuthorizationId,
        dispositionSetId: approvedDisposition.dispositionSet.dispositionSetId,
        planId: fixture.plan.planId,
        workUnitId,
        selectedDeliverableId: selectedMember.deliverableId,
        reviewedHead: selectedMember.coordinates.head,
        ref: `refs/heads/${branch}`,
        checkoutPath: fixture.repository,
      },
      resumeAction: {
        argv: ["arc", "delivery", "review-fix", "continue", "-", "--json"],
        input: { repository: "owner/repo", remote: "origin" },
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
    const responseRequirement = createReviewRequirement({
      target: oldTarget,
      projection: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"f".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
      acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }],
      initialAdmission: "checkpoint",
    });
    if (responseRequirement === null) throw new Error("response-loss requirement must derive");
    await new LocalReviewOperationStateStore(publisher).publishOperation({
      schemaVersion: 1,
      semanticsVersion: "review-operation/v1",
      operationId: "lane-progress/response-loss",
      updatedAt: "2026-08-31T12:00:00Z",
      kind: "lane-progress",
      lane: "standard",
      repositoryId: "repo-1",
      changeRequestId: "pull/401",
      headSha: reviewedHead,
      completedPasses: 1,
      attempts: [{
        attemptId: "operation-response-loss",
        sourceId: "codex-pr",
        outcome: "findings",
        hosted: {
          target: { repository: "owner/repo", pullRequest: 401, headSha: reviewedHead },
          requestedCoverage: "complete",
          effectiveCoverage: "complete",
          vehicle: {
            kind: "delivery-member",
            planId: fixture.plan.planId,
            deliverableId: selectedDeliverableId,
            workUnitId: fixture.plan.workUnitId,
            head: reviewedHead,
          },
          reviewTarget: oldTarget,
          requirement: responseRequirement,
          actorIdentity: "host-actor-1",
          findings: [{
            findingId: "finding-response-loss",
            origin: "review-thread",
            commentId: "comment-response-loss",
            threadId: "thread-response-loss",
            settlement: "reply-and-resolve",
            severity: "major",
            locus: "member-one.txt:1",
            url: "https://example.test/thread-response-loss",
          }],
          dispositionSetId: approvedDisposition.dispositionSet.dispositionSetId,
          settledFindingIds: [],
        },
      }],
    }, 0);
    const dispositionStore = new LocalApprovedDispositionRecordStore(publisher);
    const pendingResponseRecord = ApprovedDispositionRecordSchema.parse({
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
    });
    const historicalResponse = advanceDeliveryReviewFixResponse({
      record: {
        ...pendingResponseRecord,
        operationId: "operation-response-loss-historical",
        source: {
          kind: "hosted",
          attemptRef: "arc-review-source:v1:hosted:lane-progress%2Fhistorical:hosted%2F1",
        },
      },
      oldTarget,
      hostedTarget: { repository: "owner/repo", pullRequest: 400, headSha: oldTarget.headSha },
      currentHead: reviewedMember.coordinates.head,
      currentTree: reviewedMember.coordinates.tree,
      applicability: "focused",
      verificationEvidenceRefs: ["verification://historical-member-fix"],
      verifiedAt: "2026-08-31T11:00:00Z",
    });
    if (historicalResponse.status === "refused") throw new Error(historicalResponse.reason);
    await dispositionStore.appendDispositionRecord(historicalResponse.record);
    await dispositionStore.appendDispositionRecord(pendingResponseRecord);
    expect((await dispositionStore.listDispositionRecords()).filter((record) => (
      record.deliveryMember?.planId === fixture.plan.planId
      && record.deliveryMember.deliverableId === selectedDeliverableId
      && record.fixAuthorization !== null
    ))).toHaveLength(2);
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
    const topState = await fixture.states.read(fixture.plan.planId);
    if (topState.status !== "ok" || topState.value === null) {
      throw new Error("pending review-fix state must remain readable");
    }
    expect(await fixture.states.publish(fixture.plan.planId, {
      ...topState.value.value,
      members: topState.value.value.members.map((member, index, members) => (
        index === members.length - 1 ? { ...member, ref: `refs/heads/${workUnitBranch}` } : member
      )),
      pendingReviewFixVerification: {
        selectedDeliverableId,
        memberDeliverableIds: [selectedDeliverableId],
      },
    }, topState.value.revision)).toMatchObject({ status: "ok" });

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
    await git(fixture.repository, ["add", ".arc/active", ".arc/system/.internal/candidates"]);
    await git(fixture.repository, ["commit", "--no-verify", "-m", "install integration fixture"]);
    const installedHead = await git(fixture.repository, ["rev-parse", "HEAD"]);
    const installedTree = await git(fixture.repository, ["rev-parse", "HEAD^{tree}"]);
    const stateBeforeEntry = await fixture.states.read(fixture.plan.planId);
    if (stateBeforeEntry.status !== "ok" || stateBeforeEntry.value === null) {
      throw new Error("response-loss fixture requires readable delivery state");
    }
    const installedState = DeliveryStateV1Schema.parse({
      ...stateBeforeEntry.value.value,
      members: stateBeforeEntry.value.value.members.map((member, index, members) =>
        index === members.length - 1 && member.coordinates !== null
          ? { ...member, coordinates: { ...member.coordinates, head: installedHead, tree: installedTree } }
          : member),
    });
    const installedPublished = await fixture.states.publish(
      fixture.plan.planId,
      installedState,
      stateBeforeEntry.value.revision,
    );
    if (installedPublished.status !== "ok") {
      throw new Error("terminal coordinates must rebind onto the installed fixture commit");
    }
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
      verification: {
        memberDeliverableIds: [selectedDeliverableId],
        tier1Required: true,
      },
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

    await writeFile(join(fixture.repository, "rescue-follow-up.txt"), "newer rescue authoring\n");
    await git(fixture.repository, ["add", "rescue-follow-up.txt"]);
    await git(fixture.repository, ["commit", "-m", "newer rescue authoring"]);
    const reboundHead = await git(fixture.repository, ["rev-parse", "HEAD"]);
    expect(reboundHead).not.toBe(continuation.verification.target.head);
    await git(fixture.repository, ["push", "origin", workUnitBranch]);
    const preRebindState = await fixture.states.read(fixture.plan.planId);
    if (preRebindState.status !== "ok" || preRebindState.value === null) {
      throw new Error("pre-rebind delivery state must remain readable");
    }
    const preRebindTerminal = preRebindState.value.value.members.at(-1);
    expect(preRebindTerminal?.ref).toBe(`refs/heads/${workUnitBranch}`);
    expect(preRebindTerminal?.coordinates?.head).toBe(continuation.verification.target.head);

    const reboundControlled = await runArcWithStdin(
      ["delivery", "review-fix", "continue", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({ repository: "owner/repo", remote: "origin" })}\n`,
      { env: { ...fixture.env, ARC_FAKE_TERMINAL_REF: workUnitBranch } },
    );
    expect(reboundControlled.exitCode, `${reboundControlled.stderr}\n${reboundControlled.stdout}`).toBe(0);
    const reboundContinuation = JSON.parse(reboundControlled.stdout) as typeof continuation;
    expect(reboundContinuation, reboundControlled.stdout).toMatchObject({
      command: "delivery review-fix continue",
      status: "verification-required",
      selectedDeliverableId,
      verification: {
        memberDeliverableIds: [selectedDeliverableId, fixture.plan.members.at(-1)!.deliverableId],
        target: { head: reboundHead },
      },
    });
    expect(reboundContinuation.verification.target).not.toEqual(continuation.verification.target);

    await writeFile(taskListPath, taskList.replace("### `[ ]` **1.1", "### `[x]` **1.1"));
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
    await git(fixture.repository, ["add", "-A"]);
    const acknowledgementRequest = {
      ...reboundContinuation.acknowledgementInput,
      verification: {
        applicability: "focused",
        target: reboundContinuation.verification.target,
        tier1: {
          outcome: "passed",
          provenance: "rerun",
          targetTree: reboundContinuation.verification.target.tree,
        },
        verificationEvidenceRefs: ["criteria://member-1", "gates://tier-1"],
      },
    };
    const boundaryPath = join(
      fixture.repository,
      resolveSubmissionBoundaryPath(fixture.plan.workUnitId),
    );
    const boundaryBytes = await readFile(boundaryPath, "utf8");
    const stateBeforeBoundaryRefusal = await fixture.states.read(fixture.plan.planId);
    const candidateBeforeBoundaryRefusal = await readCandidateRecord(
      fixture.repository,
      fixture.plan.workUnitId,
    );
    const stagedBeforeBoundaryRefusal = await git(fixture.repository, [
      "diff", "--cached", "--name-only",
    ]);
    await unlink(boundaryPath);
    const missingBoundary = await runArcWithStdin(
      ["delivery", "review-fix", "acknowledge", "-", "--json"],
      fixture.repository,
      `${JSON.stringify(acknowledgementRequest)}\n`,
      { env: fixture.env },
    );
    expect(missingBoundary.exitCode, `${missingBoundary.stderr}\n${missingBoundary.stdout}`).toBe(1);
    expect(JSON.parse(missingBoundary.stdout), missingBoundary.stdout).toMatchObject({
      command: "delivery review-fix acknowledge",
      status: "refused",
      reason: "public-boundary-unavailable",
    });
    expect(await fixture.states.read(fixture.plan.planId)).toEqual(stateBeforeBoundaryRefusal);
    expect(await readCandidateRecord(fixture.repository, fixture.plan.workUnitId))
      .toEqual(candidateBeforeBoundaryRefusal);
    expect(await git(fixture.repository, ["diff", "--cached", "--name-only"]))
      .toBe(stagedBeforeBoundaryRefusal);
    await writeFile(boundaryPath, boundaryBytes);
    const resumed = await runArcWithStdin(
      ["delivery", "review-fix", "acknowledge", "-", "--json"],
      fixture.repository,
      `${JSON.stringify(acknowledgementRequest)}\n`,
      { env: fixture.env },
    );
    expect(resumed.exitCode, `${resumed.stderr}\n${resumed.stdout}`).toBe(0);
    expect(JSON.parse(resumed.stdout), resumed.stdout).toMatchObject({
      command: "delivery review-fix acknowledge",
      status: "acknowledged",
      nextAction: "continue-hosted-review",
      boundaryCarry: { candidateId: candidate.attestation.candidateId },
    });
    const replayed = await runArcWithStdin(
      ["delivery", "review-fix", "acknowledge", "-", "--json"],
      fixture.repository,
      `${JSON.stringify(acknowledgementRequest)}\n`,
      { env: fixture.env },
    );
    expect(replayed.exitCode, `${replayed.stderr}\n${replayed.stdout}`).toBe(0);
    expect(JSON.parse(replayed.stdout), replayed.stdout).toMatchObject({
      command: "delivery review-fix acknowledge",
      status: "already-acknowledged",
      nextAction: "continue-hosted-review",
      boundaryCarry: { candidateId: candidate.attestation.candidateId },
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
      newTarget: { revision: reboundContinuation.verification.target.head },
    });

    const recoveredEntry = await runArcWithStdin(
      ["delivery", "entry", "inspect", "--input", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({ entryMode: "integrating" })}\n`,
      { env: fixture.env },
    );
    expect(recoveredEntry.exitCode, `${recoveredEntry.stderr}\n${recoveredEntry.stdout}`).toBe(0);
    expect(JSON.parse(recoveredEntry.stdout)).toMatchObject({
      status: "continue-hosted-review",
      nextAction: "continue-hosted-review",
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

  it("replays a durable local verification from the direct pending execution entry", async () => {
    const fixture = await positionFixture();
    const workUnitId = fixture.plan.workUnitId;
    const branch = `feat/${workUnitId}`;
    const stateRead = await fixture.states.read(fixture.plan.planId);
    if (stateRead.status !== "ok" || stateRead.value === null) {
      throw new Error("direct pending fixture requires delivery state");
    }
    const selectedMember = stateRead.value.value.members.at(-1);
    if (selectedMember?.coordinates === null || selectedMember?.coordinates === undefined
      || selectedMember.ref === null) {
      throw new Error("direct pending fixture requires terminal coordinates");
    }
    const selectedDeliverableId = selectedMember.deliverableId;
    await git(fixture.repository, ["switch", "-c", branch, selectedMember.coordinates.head]);

    const activeDir = join(fixture.repository, ".arc", "active");
    await mkdir(activeDir, { recursive: true });
    await writeFile(join(activeDir, `tasks-${workUnitId}.md`), [
      `# Task List: ${workUnitId}`,
      "",
      renderDeliveryPlanSection(fixture.plan),
      "## **Phase 1:** Members",
      "",
      "### `[ ]` **1.1 Finish the correction**",
      "",
    ].join("\n"));
    const candidateTarget = await collectGitCandidateTarget({
      cwd: fixture.repository,
      name: workUnitId,
      baseBranch: "main",
      exec: createExecaGitExec(),
    });
    const candidate: CandidateManagedRecordV1 = {
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      attestation: createCandidateAttestation({
        workUnit: workUnitId,
        subject: candidateTarget.subject,
        baseRevision: candidateTarget.revision,
        attestedBy: "test-user",
        attestedAt: "2026-09-03T12:00:00.000Z",
        verificationEvidenceRef: "verification://baseline",
      }),
      subject: candidateTarget.subject,
      transitions: [],
      lineageAttestations: [],
    };
    await writeCandidateRecord(fixture.repository, workUnitId, candidate, null);
    await writeFile(join(activeDir, `meta-${workUnitId}.md`), [
      `# Metadata: ${workUnitId}`,
      "",
      "- **State:** Integrating",
      "- **Owner:** test-user",
      `- **Branch:** ${branch}`,
      `- **Task List:** \`tasks-${workUnitId}.md\``,
      `- **Candidate:** \`${candidate.attestation.candidateId}\``,
      "- **Current Workflow:** `integrate-work-unit`",
      "- **Last Completed:** [none]",
      "- **Next Task:** 1.1",
      "- **Next Action:** Finish the correction",
      "",
    ].join("\n"));
    const reservation = {
      schemaVersion: 1 as const,
      semanticsVersion: "standard-review-reservation/v1" as const,
      reservationId: `sha256:${"a".repeat(64)}`,
      sources: ["delegated-agent"],
      target: {
        kind: "delivery" as const,
        repository: "owner/repo",
        workUnitId,
        planId: fixture.plan.planId,
      },
      obligation: {
        obligation: "required" as const,
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"b".repeat(64)}`,
        retrigger: "full-final" as const,
        count: 1,
      },
    };
    await writeSubmissionBoundary(fixture.repository, projectPublicationBoundary({
      workUnit: workUnitId,
      branch,
      candidateId: candidate.attestation.candidateId,
      candidateSubjectDigest: candidate.subject.subjectDigest,
      reservation,
      changeRequest: { repository: "owner/repo", pullRequest: 403 },
    }), null);
    await git(fixture.repository, ["add", "-A"]);
    await git(fixture.repository, ["commit", "--no-verify", "-m", "install direct pending fixture"]);
    const correctionHead = await git(fixture.repository, ["rev-parse", "HEAD"]);
    const correctionTree = await git(fixture.repository, ["rev-parse", "HEAD^{tree}"]);
    await git(fixture.repository, ["push", "-u", "origin", branch]);
    const pendingState = DeliveryStateV1Schema.parse({
      ...stateRead.value.value,
      members: stateRead.value.value.members.map((member) => member.deliverableId === selectedDeliverableId
        ? {
            ...member,
            ref: `refs/heads/${branch}`,
            changeRequest: { providerId: "github", changeRequestId: "403" },
            coordinates: { ...member.coordinates, head: correctionHead, tree: correctionTree },
          }
        : member),
      pendingReviewFixVerification: {
        selectedDeliverableId,
        memberDeliverableIds: [selectedDeliverableId],
      },
    });
    const pendingPublished = await fixture.states.publish(
      fixture.plan.planId,
      pendingState,
      stateRead.value.revision,
    );
    if (pendingPublished.status !== "ok") throw new Error("pending verification state must publish");

    const baseTree = await git(fixture.repository, ["rev-parse", `${selectedMember.coordinates.base}^{tree}`]);
    const oldTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "delivery-member",
      repositoryId: "repo-1",
      baseRef: "delivery/member-2",
      diffBaseSha: selectedMember.coordinates.base,
      diffBaseTree: baseTree,
      headSha: selectedMember.coordinates.head,
      headTree: selectedMember.coordinates.tree,
    });
    const requirement = createReviewRequirement({
      target: oldTarget,
      projection: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: reservation.obligation.rubricDigest,
        retrigger: "full-final",
        count: 1,
      },
      acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }],
      initialAdmission: "checkpoint",
    });
    if (requirement === null) throw new Error("direct pending requirement must derive");
    const authority = {
      vehicle: { kind: "delivery-member" as const, identity: selectedDeliverableId },
      authorIdentity: "author-1",
      evaluatorIdentity: "evaluator-1",
      attestationRuntimeKind: "arc-cli",
      runtimeIdentity: "arc-cli/0.1.0",
      attestationMechanism: "local-attestation" as const,
    };
    const admission = createLocalReviewAdmission({
      target: oldTarget,
      requirement,
      authority,
      laneSourceId: "delegated-agent",
      policyBindingDigest: canonicalDigest({ binding: "local" }),
      requestMechanism: "local-attestation",
    });
    const source = createLocalReviewSource({
      schemaVersion: 1,
      semanticsVersion: "git-object-range/v1",
      repositoryId: oldTarget.repositoryId,
      targetId: oldTarget.targetId,
      objectFormat: "sha1",
      diffBaseSha: oldTarget.diffBaseSha,
      diffBaseTree: oldTarget.diffBaseTree,
      headSha: oldTarget.headSha,
      headTree: oldTarget.headTree,
      reachabilityRef: `refs/arc/review/local/${admission.operationId}`,
      materializationRef: `/tmp/${admission.operationId}`,
    });
    const responseMember = {
      kind: "delivery-member" as const,
      planId: fixture.plan.planId,
      deliverableId: selectedDeliverableId,
      workUnitId,
      head: oldTarget.headSha,
    };
    const operation: LocalReviewState = {
      schemaVersion: 1,
      semanticsVersion: "review-operation/v1",
      kind: "local-review",
      operationId: admission.operationId,
      updatedAt: "2026-09-03T12:00:00.000Z",
      vehicle: authority.vehicle,
      repositoryId: oldTarget.repositoryId,
      targetId: oldTarget.targetId,
      requestId: admission.carrier.request.requestId,
      laneSourceId: admission.laneSourceId,
      deliveryAdmission: {
        schemaVersion: 1,
        sourceId: "delegated-agent",
        target: { repository: "owner/repo", pullRequest: 403, headSha: oldTarget.headSha },
        vehicle: responseMember,
        pass: 1,
        statusTarget: { repository: "owner/repo", headRef: "member-3", headSha: oldTarget.headSha },
      },
      policyVersion: requirement.policyVersion,
      policyBindingDigest: admission.policyBindingDigest,
      attestationRuntimeKind: authority.attestationRuntimeKind,
      sourceRef: "source.json",
      sourceDigest: source.sourceDigest,
      guidanceDigest: canonicalDigest({ guidance: "local" }),
      target: oldTarget,
      requirement,
      request: admission.carrier.request,
      attestation: admission.carrier.attestation,
      cleanupTtlMs: 60_000,
    };
    const operationStore = new LocalReviewOperationStateStore(
      new RepositoryGitCommonStatePublisher(createExecaGitExec(), fixture.repository),
    );
    await operationStore.publishOperation(operation, 0);
    await recordLaneAttempt(operationStore, {
      lane: "standard",
      repositoryId: oldTarget.repositoryId,
      changeRequestId: "pull/403",
      headSha: oldTarget.headSha,
      attemptId: operation.operationId,
      sourceId: "delegated-agent",
      outcome: "findings",
      consumedPass: true,
      now: "2026-09-03T12:00:00.000Z",
    });
    const approvedDisposition = approveDispositionState({
      proposed: proposeDispositionSet(createDispositionSet({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        targetId: oldTarget.targetId,
        policyVersion: requirement.policyVersion,
        rubricVersion: requirement.rubricVersion,
        rubricDigest: requirement.rubricDigest,
        proposedBy: "agent-1",
        findings: [{
          findingId: "finding-direct-pending",
          sourceIdentity: "delegated-agent",
          locus: "member-three.txt:1",
          sourceVerification: "verified",
          verificationRefs: ["review:finding-direct-pending"],
          severity: "major",
          disposition: "fix",
          gating: "blocking",
          rationale: "The source confirms the issue.",
          recommendation: "Apply the fix.",
          openQuestions: [],
        }],
      })),
      approvedBy: "maintainer-1",
      approvedAt: "2026-09-03T12:00:00.000Z",
    });
    const baseRecord = ApprovedDispositionRecordSchema.parse({
      schemaVersion: 1,
      semanticsVersion: "review-advisory/v1",
      repositoryId: oldTarget.repositoryId,
      operationId: operation.operationId,
      candidate: null,
      errand: null,
      deliveryMember: responseMember,
      source: {
        kind: "attested-local",
        receiptRef: bindReviewSourceReference({
          kind: "attested-local",
          operationId: operation.operationId,
          durableRef: "git-common:review-gate/evidence/receipts-v2.json#1",
        }),
        localSourceRef: "git-common:review-gate/local/source.json",
      },
      approvedDisposition,
      fixAuthorization: createFixAuthorization({ dispositionState: approvedDisposition, oldTarget }),
      errandFixResponse: null,
      deliveryMemberFixResponse: null,
    });
    const advanced = advanceDeliveryReviewFixResponse({
      record: baseRecord,
      oldTarget,
      hostedTarget: null,
      currentHead: correctionHead,
      currentTree: correctionTree,
      applicability: "focused",
      verificationEvidenceRefs: ["criteria://member-3", "gates://tier-1"],
      verifiedAt: "2026-09-03T12:00:00.000Z",
    });
    if (advanced.status === "refused") throw new Error(advanced.reason);
    await new LocalApprovedDispositionRecordStore(
      new RepositoryGitCommonStatePublisher(createExecaGitExec(), fixture.repository),
    ).appendDispositionRecord(advanced.record);

    const resumed = await runArcWithStdin(
      ["delivery", "review-fix", "continue", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({ repository: "owner/repo", remote: "origin" })}\n`,
      { env: fixture.env },
    );
    expect(resumed.exitCode, `${resumed.stderr}\n${resumed.stdout}`).toBe(1);
    expect(JSON.parse(resumed.stdout), resumed.stdout).toMatchObject({
      command: "delivery review-fix continue",
      status: "refused",
      reason: "review-fix-route-unavailable",
      effectLog: [
        { kind: "dispatch", actionKind: "delivery-review-fix-acknowledge", resultStatus: "acknowledged" },
        { kind: "boundary-carry" },
        { kind: "commit", recordClass: "candidate-boundary-projection" },
        { kind: "push", ref: `refs/heads/${branch}` },
      ],
    });
    await expect(fixture.states.read(fixture.plan.planId)).resolves.toMatchObject({
      status: "ok",
      value: { value: { pendingReviewFixVerification: null } },
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

  it("drives a registered review correction through superseded verification to hosted review", async () => {
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
    const staleCandidateHead = await git(fixture.repository, [
      "commit-tree", selectedMember.coordinates.tree, "-p", selectedMember.coordinates.base,
      "-m", "prior machine candidate materialization",
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
    await git(fixture.repository, ["update-ref", locator.candidateRef, staleCandidateHead]);
    await git(fixture.repository, ["worktree", "add", "--detach", locator.gatePath, staleCandidateHead]);
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
    await git(fixture.repository, ["switch", "-c", "member-3", current.value.value.members.at(-1)!.coordinates!.head]);
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
      "- **Branch:** member-3",
      "- **Class:** Heavy",
      "- **Priority:** P1",
      "- **Origin:** [internal]",
      `- **Task List:** tasks-${fixture.plan.workUnitId}.md`,
      `- **Candidate:** \`${candidate.attestation.candidateId}\``,
      "- **Current Workflow:** `integrate-work-unit`",
      "- **Last Completed:** [none]",
      "- **Next Task:** [none]",
      "- **Next Action:** [none]",
      "",
    ].join("\n"));
    await writeCandidateRecord(fixture.repository, fixture.plan.workUnitId, candidate, null);
    await writeSubmissionBoundary(fixture.repository, projectPublicationBoundary({
      workUnit: fixture.plan.workUnitId,
      branch: "member-3",
      candidateId: candidate.attestation.candidateId,
      candidateSubjectDigest: candidate.subject.subjectDigest,
      reservation: {
        schemaVersion: 1,
        semanticsVersion: "standard-review-reservation/v1",
        reservationId: `sha256:${"e".repeat(64)}`,
        sources: ["codex-pr", "delegated-agent"],
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
      changeRequest: { repository: "owner/repo", pullRequest: 403 },
    }), null);
    await git(fixture.repository, ["add", ".arc/active", ".arc/system/.internal/candidates"]);
    await git(fixture.repository, ["commit", "--no-verify", "-m", "install integration fixture"]);
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
        proposedBy: "arc-cli/0.1.0",
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
      approvedBy: "test-user",
      approvedAt: "2026-08-31T12:00:00Z",
    });
    const publisher = new RepositoryGitCommonStatePublisher(createExecaGitExec(), fixture.repository);
    const requirement = createReviewRequirement({
      target: oldTarget,
      projection: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"f".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
      acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }],
      initialAdmission: "checkpoint",
    });
    if (requirement === null) throw new Error("hosted review requirement must derive");
    const finding = {
      findingId: "finding-published",
      origin: "review-thread" as const,
      commentId: "comment-published",
      threadId: "thread-published",
      settlement: "reply-and-resolve" as const,
      severity: "major" as const,
      locus: "member-one.txt:1",
      url: "https://example.test/thread-published",
    };
    await new LocalReviewOperationStateStore(publisher).publishOperation({
      schemaVersion: 1,
      semanticsVersion: "review-operation/v1",
      operationId: "lane-progress/published",
      updatedAt: "2026-08-31T12:00:00Z",
      kind: "lane-progress",
      lane: "standard",
      repositoryId: "repo-1",
      changeRequestId: "pull/401",
      headSha: reviewedHead,
      completedPasses: 1,
      attempts: [{
        attemptId: "operation-published-member-fix",
        sourceId: "codex-pr",
        outcome: "findings",
        hosted: {
          target: { repository: "owner/repo", pullRequest: 401, headSha: reviewedHead },
          requestedCoverage: "complete",
          effectiveCoverage: "complete",
          vehicle: {
            kind: "delivery-member",
            planId: fixture.plan.planId,
            deliverableId: selectedDeliverableId,
            workUnitId: fixture.plan.workUnitId,
            head: reviewedHead,
          },
          reviewTarget: oldTarget,
          requirement,
          actorIdentity: "host-actor-1",
          findings: [finding],
          dispositionSetId: approvedDisposition.dispositionSet.dispositionSetId,
          settledFindingIds: [],
        },
      }],
    }, 0);
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

    const prepared = await runArcWithStdin(
      ["delivery", "review-fix", "continue", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({ repository: "owner/repo", remote: "origin" })}\n`,
      { env: fixture.env },
    );
    expect(prepared.exitCode, `${prepared.stderr}\n${prepared.stdout}`).toBe(0);
    expect(JSON.parse(prepared.stdout), prepared.stdout).toMatchObject({
      command: "delivery review-fix continue",
      status: "authoring-required",
      selectedDeliverableId,
      authoring: { kind: "candidate", ref: locator.candidateRef, checkoutPath: locator.gatePath },
      effectLog: [{
        kind: "dispatch",
        actionKind: "delivery-review-fix-authoring-rematerialize",
        resultStatus: "rematerialized",
      }],
    });
    expect(await git(fixture.repository, ["rev-parse", locator.candidateRef])).toBe(reviewedHead);
    expect(await git(locator.gatePath, ["rev-parse", "HEAD"])).toBe(reviewedHead);

    await writeFile(join(locator.gatePath, "member-one.txt"), "member one corrected\n");
    await git(locator.gatePath, ["add", "member-one.txt"]);
    await git(locator.gatePath, ["commit", "--no-verify", "-m", "apply selected review fix"]);
    const correctionHead = await git(locator.gatePath, ["rev-parse", "HEAD"]);

    const continued = await runArcWithStdin(
      ["delivery", "review-fix", "continue", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({ repository: "owner/repo", remote: "origin" })}\n`,
      { env: fixture.env },
    );
    expect(continued.exitCode, `${continued.stderr}\n${continued.stdout}`).toBe(0);
    const verificationStop = JSON.parse(continued.stdout) as {
      verification: { target: { head: string; tree: string } };
    };
    expect(verificationStop, continued.stdout).toMatchObject({
      command: "delivery review-fix continue",
      status: "verification-required",
      selectedDeliverableId,
      verification: { memberDeliverableIds: [selectedDeliverableId], tier1Required: true },
      effectLog: [
        { kind: "dispatch", actionKind: "delivery-review-fix-authoring-rebind", resultStatus: "rebound" },
        { kind: "dispatch", actionKind: "delivery-review-fix-publish", resultStatus: "published" },
        { kind: "dispatch", actionKind: "delivery-refresh-execute", resultStatus: "applied" },
      ],
    });
    expect(await git(fixture.repository, ["rev-parse", locator.candidateRef])).toBe(correctionHead);
    expect(await git(locator.gatePath, ["rev-parse", "HEAD"])).toBe(correctionHead);

    await writeFile(join(locator.gatePath, "member-one.txt"), "member one corrected again\n");
    await git(locator.gatePath, ["add", "member-one.txt"]);
    await git(locator.gatePath, ["commit", "--no-verify", "-m", "revise selected review fix"]);
    const revisedCorrectionHead = await git(locator.gatePath, ["rev-parse", "HEAD"]);
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
      "### `[ ]` **1.1 Close member one**",
      "",
    ].join("\n"));
    await git(fixture.repository, ["add", ".arc/active"]);
    await git(fixture.repository, ["commit", "--no-verify", "-m", "reopen correction task"]);

    const superseded = await runArcWithStdin(
      ["delivery", "review-fix", "continue", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({ repository: "owner/repo", remote: "origin" })}\n`,
      { env: fixture.env },
    );
    expect(superseded.exitCode, `${superseded.stderr}\n${superseded.stdout}`).toBe(0);
    const supersedingVerificationStop = JSON.parse(superseded.stdout) as {
      verification: { target: { head: string; tree: string } };
      acknowledgementInput: {
        planId: string;
        selectedDeliverableId: string;
        memberDeliverableIds: string[];
        expectedStateRevision: number;
        continuationDigest: string;
      };
    };
    expect(supersedingVerificationStop, superseded.stdout).toMatchObject({
      command: "delivery review-fix continue",
      status: "verification-required",
      selectedDeliverableId,
      verification: { memberDeliverableIds: [selectedDeliverableId], tier1Required: true },
      effectLog: [
        { kind: "dispatch", actionKind: "delivery-review-fix-authoring-rebind", resultStatus: "rebound" },
        { kind: "dispatch", actionKind: "delivery-review-fix-publish", resultStatus: "published" },
        { kind: "dispatch", actionKind: "delivery-refresh-execute", resultStatus: "applied" },
      ],
    });
    expect(supersedingVerificationStop.verification.target.head)
      .not.toBe(verificationStop.verification.target.head);
    expect(await git(fixture.repository, ["rev-parse", locator.candidateRef])).toBe(revisedCorrectionHead);
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
    await git(fixture.repository, ["add", ".arc/active"]);

    const acknowledgementRequest = {
      ...supersedingVerificationStop.acknowledgementInput,
      verification: {
        applicability: "focused",
        target: supersedingVerificationStop.verification.target,
        tier1: {
          outcome: "passed",
          provenance: "exact-tree-reuse",
          targetTree: supersedingVerificationStop.verification.target.tree,
          coveredInputs: "unchanged",
        },
        verificationEvidenceRefs: ["criteria://member-1", "gates://tier-1"],
      },
    } as const;
    const candidatePath = join(
      fixture.repository,
      resolveCandidateRecordRelativePath(fixture.plan.workUnitId),
    );
    const pendingCandidateBytes = await readFile(candidatePath, "utf8");
    const pendingCandidate = JSON.parse(pendingCandidateBytes) as CandidateManagedRecordV1;
    const pendingBaseline = reduceCandidateDurableBaseline(pendingCandidate);
    const pendingCurrentTarget = await collectGitCandidateTarget({
      cwd: fixture.repository,
      name: fixture.plan.workUnitId,
      baseBranch: "main",
      revision: supersedingVerificationStop.verification.target.head,
      exec: createExecaGitExec(),
    });
    const pendingAuthorizedTransition = createCandidateVerificationResponseEvidence({
      candidateId: pendingCandidate.attestation.candidateId,
      oldTarget: pendingBaseline.target,
      newTarget: pendingCurrentTarget,
      authorityRef: supersedingVerificationStop.acknowledgementInput.continuationDigest,
      verifiedBy: "test-user",
      verifiedAt: "2026-09-03T13:55:00.000Z",
      applicability: "focused",
      verificationEvidenceRefs: ["criteria://member-1", "gates://tier-1"],
      implementationChanged:
        pendingBaseline.target.subject.subjectDigest !== pendingCurrentTarget.subject.subjectDigest,
    });
    const pendingWrongAuthorityTransition = createCandidateVerificationResponseEvidence({
      ...pendingAuthorizedTransition,
      authorityRef: `sha256:${"0".repeat(64)}`,
      verifiedAt: "2026-09-03T13:56:00.000Z",
    });
    await writeFile(candidatePath, `${JSON.stringify({
      ...pendingCandidate,
      transitions: [...pendingCandidate.transitions, pendingWrongAuthorityTransition],
    }, null, 2)}\n`);
    await git(fixture.repository, [
      "add",
      "--",
      resolveCandidateRecordRelativePath(fixture.plan.workUnitId),
    ]);
    const refusedPendingReplacement = await runArcWithStdin(
      ["delivery", "review-fix", "acknowledge", "-", "--json"],
      fixture.repository,
      `${JSON.stringify(acknowledgementRequest)}\n`,
      { env: fixture.env },
    );
    expect(
      refusedPendingReplacement.exitCode,
      `${refusedPendingReplacement.stderr}\n${refusedPendingReplacement.stdout}`,
    ).toBe(1);
    expect(JSON.parse(refusedPendingReplacement.stdout), refusedPendingReplacement.stdout).toMatchObject({
      command: "delivery review-fix acknowledge",
      status: "refused",
      reason: "candidate-verification-replay-unproven",
    });

    const pendingWrongSuffix = createCandidateVerificationResponseEvidence({
      candidateId: pendingCandidate.attestation.candidateId,
      oldTarget: pendingCurrentTarget,
      newTarget: pendingCurrentTarget,
      authorityRef: `sha256:${"0".repeat(64)}`,
      verifiedBy: "test-user",
      verifiedAt: "2026-09-03T13:57:00.000Z",
      applicability: "focused",
      verificationEvidenceRefs: ["criteria://member-1", "gates://tier-1"],
      implementationChanged: false,
    });
    await writeFile(candidatePath, `${JSON.stringify({
      ...pendingCandidate,
      transitions: [
        ...pendingCandidate.transitions,
        pendingAuthorizedTransition,
        pendingWrongSuffix,
      ],
    }, null, 2)}\n`);
    await git(fixture.repository, [
      "add",
      "--",
      resolveCandidateRecordRelativePath(fixture.plan.workUnitId),
    ]);
    const refusedPendingSuffix = await runArcWithStdin(
      ["delivery", "review-fix", "acknowledge", "-", "--json"],
      fixture.repository,
      `${JSON.stringify(acknowledgementRequest)}\n`,
      { env: fixture.env },
    );
    expect(
      refusedPendingSuffix.exitCode,
      `${refusedPendingSuffix.stderr}\n${refusedPendingSuffix.stdout}`,
    ).toBe(1);
    expect(JSON.parse(refusedPendingSuffix.stdout), refusedPendingSuffix.stdout).toMatchObject({
      command: "delivery review-fix acknowledge",
      status: "refused",
      reason: "candidate-verification-replay-unproven",
    });
    await writeFile(candidatePath, pendingCandidateBytes);
    await git(fixture.repository, [
      "add",
      "--",
      resolveCandidateRecordRelativePath(fixture.plan.workUnitId),
    ]);

    const acknowledged = await runArcWithStdin(
      ["delivery", "review-fix", "acknowledge", "-", "--json"],
      fixture.repository,
      `${JSON.stringify(acknowledgementRequest)}\n`,
      { env: fixture.env },
    );
    expect(acknowledged.exitCode, `${acknowledged.stderr}\n${acknowledged.stdout}`).toBe(0);
    const acknowledgedOutput = JSON.parse(acknowledged.stdout) as {
      recordEffects: Array<{ path: string; digest: string }>;
    };
    expect(acknowledgedOutput, acknowledged.stdout).toMatchObject({
      command: "delivery review-fix acknowledge",
      status: "acknowledged",
      nextAction: "continue-hosted-review",
      recordEffects: expect.arrayContaining([
        { path: resolveCandidateRecordRelativePath(fixture.plan.workUnitId), digest: expect.any(String) },
        { path: resolveSubmissionBoundaryPath(fixture.plan.workUnitId), digest: expect.any(String) },
      ]),
    });
    await git(fixture.repository, [
      "restore",
      "--staged",
      "--",
      resolveSubmissionBoundaryPath(fixture.plan.workUnitId),
    ]);

    const acknowledgedCandidateBytes = await readFile(candidatePath, "utf8");
    const wrongAuthorityCandidate = JSON.parse(acknowledgedCandidateBytes) as CandidateManagedRecordV1;
    const appendedVerification = wrongAuthorityCandidate.transitions.at(-1);
    if (appendedVerification?.transitionKind !== "verification-response") {
      throw new Error("expected appended verification response");
    }
    wrongAuthorityCandidate.transitions.splice(-1, 1, createCandidateVerificationResponseEvidence({
      candidateId: appendedVerification.candidateId,
      oldTarget: appendedVerification.oldTarget,
      newTarget: appendedVerification.newTarget,
      authorityRef: `sha256:${"0".repeat(64)}`,
      verifiedBy: appendedVerification.verifiedBy,
      verifiedAt: appendedVerification.verifiedAt,
      applicability: appendedVerification.applicability,
      verificationEvidenceRefs: appendedVerification.verificationEvidenceRefs,
      implementationChanged: appendedVerification.implementationChanged,
    }));
    await writeFile(candidatePath, `${JSON.stringify(wrongAuthorityCandidate, null, 2)}\n`);
    await git(fixture.repository, [
      "add",
      "--",
      resolveCandidateRecordRelativePath(fixture.plan.workUnitId),
    ]);

    const unprovedResume = await runArcWithStdin(
      ["delivery", "review-fix", "continue", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({ repository: "owner/repo", remote: "origin" })}\n`,
      { env: fixture.env },
    );
    expect(unprovedResume.exitCode, `${unprovedResume.stderr}\n${unprovedResume.stdout}`).toBe(0);
    expect(JSON.parse(unprovedResume.stdout), unprovedResume.stdout).toMatchObject({
      command: "delivery review-fix continue",
      status: "effect-stopped",
      reason: "delivery-review-fix-effect-stopped",
      actionKind: "record-settlement",
      result: {
        status: "refused",
        reason: "record-effect-recovery-unprovable",
      },
      effectLog: [],
    });

    const refusedReplay = await runArcWithStdin(
      ["delivery", "review-fix", "acknowledge", "-", "--json"],
      fixture.repository,
      `${JSON.stringify(acknowledgementRequest)}\n`,
      { env: fixture.env },
    );
    expect(refusedReplay.exitCode, `${refusedReplay.stderr}\n${refusedReplay.stdout}`).toBe(1);
    expect(JSON.parse(refusedReplay.stdout), refusedReplay.stdout).toMatchObject({
      command: "delivery review-fix acknowledge",
      status: "refused",
      reason: "candidate-verification-replay-unproven",
    });

    const trailingWrongAuthorityCandidate = JSON.parse(
      acknowledgedCandidateBytes,
    ) as CandidateManagedRecordV1;
    const retainedVerification = trailingWrongAuthorityCandidate.transitions.at(-1);
    if (retainedVerification?.transitionKind !== "verification-response") {
      throw new Error("expected retained verification response");
    }
    trailingWrongAuthorityCandidate.transitions.push(createCandidateVerificationResponseEvidence({
      candidateId: retainedVerification.candidateId,
      oldTarget: retainedVerification.newTarget,
      newTarget: retainedVerification.newTarget,
      authorityRef: `sha256:${"0".repeat(64)}`,
      verifiedBy: retainedVerification.verifiedBy,
      verifiedAt: "2026-09-03T14:05:00.000Z",
      applicability: retainedVerification.applicability,
      verificationEvidenceRefs: retainedVerification.verificationEvidenceRefs,
      implementationChanged: false,
    }));
    await writeFile(candidatePath, `${JSON.stringify(trailingWrongAuthorityCandidate, null, 2)}\n`);
    await git(fixture.repository, [
      "add",
      "--",
      resolveCandidateRecordRelativePath(fixture.plan.workUnitId),
    ]);
    const refusedTrailingReplay = await runArcWithStdin(
      ["delivery", "review-fix", "acknowledge", "-", "--json"],
      fixture.repository,
      `${JSON.stringify(acknowledgementRequest)}\n`,
      { env: fixture.env },
    );
    expect(
      refusedTrailingReplay.exitCode,
      `${refusedTrailingReplay.stderr}\n${refusedTrailingReplay.stdout}`,
    ).toBe(1);
    expect(JSON.parse(refusedTrailingReplay.stdout), refusedTrailingReplay.stdout).toMatchObject({
      command: "delivery review-fix acknowledge",
      status: "refused",
      reason: "candidate-verification-replay-unproven",
    });

    await writeFile(candidatePath, acknowledgedCandidateBytes);
    await git(fixture.repository, [
      "add",
      "--",
      resolveCandidateRecordRelativePath(fixture.plan.workUnitId),
    ]);
    const replayedAcknowledgement = await runArcWithStdin(
      ["delivery", "review-fix", "acknowledge", "-", "--json"],
      fixture.repository,
      `${JSON.stringify(acknowledgementRequest)}\n`,
      { env: fixture.env },
    );
    expect(
      replayedAcknowledgement.exitCode,
      `${replayedAcknowledgement.stderr}\n${replayedAcknowledgement.stdout}`,
    ).toBe(0);
    const replayedAcknowledgementOutput = JSON.parse(replayedAcknowledgement.stdout) as {
      recordEffects: Array<{ path: string; digest: string }>;
    };
    expect(replayedAcknowledgementOutput, replayedAcknowledgement.stdout).toMatchObject({
      command: "delivery review-fix acknowledge",
      status: "already-acknowledged",
      nextAction: "continue-hosted-review",
      recordEffects: expect.arrayContaining([
        { path: resolveCandidateRecordRelativePath(fixture.plan.workUnitId), digest: expect.any(String) },
        { path: resolveSubmissionBoundaryPath(fixture.plan.workUnitId), digest: expect.any(String) },
      ]),
    });

    const reviewStatusHostLog = join(fixture.repository, "review-status-host.log");
    await writeFile(reviewStatusHostLog, "");
    const resumed = await runArcWithStdin(
      ["delivery", "review-fix", "continue", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({
        repository: "owner/repo",
        remote: "origin",
        recordEffects: replayedAcknowledgementOutput.recordEffects,
      })}\n`,
      { env: { ...fixture.env, ARC_FAKE_GH_LOG: reviewStatusHostLog } },
    );
    expect(resumed.exitCode, `${resumed.stderr}\n${resumed.stdout}`).toBe(0);
    expect(JSON.parse(resumed.stdout), resumed.stdout).toMatchObject({
      command: "delivery review-fix continue",
      status: "review-status-required",
      stopKind: "review-spend",
      effectLog: [
        { kind: "commit", recordClass: "candidate-boundary-projection" },
        { kind: "push", ref: "refs/heads/member-3" },
        { kind: "dispatch", actionKind: "delivery-reconcile", resultStatus: "rebound" },
      ],
    });
    const reviewStatusHostCalls = (await readFile(reviewStatusHostLog, "utf8")).split("\n");
    expect(reviewStatusHostCalls).not.toContain("repo view --json nameWithOwner");
    expect(reviewStatusHostCalls).toContainEqual(expect.stringMatching(
      /^pr checks \d+ --repo owner\/repo --required --json name,state,bucket$/u,
    ));

    const repositoryId = await resolveRepositoryIdentity(publisher);
    const replayOldTarget = createReviewTarget({
      schemaVersion: oldTarget.schemaVersion,
      semanticsVersion: oldTarget.semanticsVersion,
      kind: oldTarget.kind,
      repositoryId,
      baseRef: oldTarget.baseRef,
      diffBaseSha: oldTarget.diffBaseSha,
      diffBaseTree: oldTarget.diffBaseTree,
      headSha: oldTarget.headSha,
      headTree: oldTarget.headTree,
    });
    const replayRubricDigest = canonicalDigest({ rubric: "standard" });
    const replayRequirement = createReviewRequirement({
      target: replayOldTarget,
      projection: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: replayRubricDigest,
        retrigger: "full-final",
        count: 1,
      },
      acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }],
      initialAdmission: "checkpoint",
    });
    if (replayRequirement === null) throw new Error("response replay requirement must derive");
    const replayApprovedDisposition = approveDispositionState({
      proposed: proposeDispositionSet(createDispositionSet({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        targetId: replayOldTarget.targetId,
        policyVersion: replayRequirement.policyVersion,
        rubricVersion: replayRequirement.rubricVersion,
        rubricDigest: replayRequirement.rubricDigest,
        proposedBy: "arc-cli/0.1.0",
        findings: [{
          findingId: finding.findingId,
          sourceIdentity: "codex-pr",
          locus: finding.locus,
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
      approvedBy: "test-user",
      approvedAt: "2026-08-31T12:10:00Z",
    });
    const replayOperationId = "lane-progress/response-replay";
    const replayAttemptId = "operation-response-replay";
    const replaySource = {
      kind: "hosted" as const,
      attemptRef: bindReviewSourceReference({
        kind: "hosted",
        operationId: replayOperationId,
        durableRef: replayAttemptId,
      }),
    };
    const responseState = await fixture.states.read(fixture.plan.planId);
    if (responseState.status !== "ok" || responseState.value === null) {
      throw new Error("response replay delivery state must be readable");
    }
    const responseMember = responseState.value.value.members.find(
      ({ deliverableId }) => deliverableId === selectedDeliverableId,
    );
    if (responseMember?.coordinates === null || responseMember?.coordinates === undefined) {
      throw new Error("response replay member coordinates must be readable");
    }
    const replayPendingRecord = ApprovedDispositionRecordSchema.parse({
      schemaVersion: 1,
      semanticsVersion: "review-advisory/v1",
      repositoryId,
      operationId: replayAttemptId,
      candidate: null,
      errand: null,
      deliveryMember: {
        kind: "delivery-member",
        planId: fixture.plan.planId,
        deliverableId: selectedDeliverableId,
        workUnitId: fixture.plan.workUnitId,
        head: reviewedHead,
      },
      source: replaySource,
      approvedDisposition: replayApprovedDisposition,
      fixAuthorization: createFixAuthorization({
        dispositionState: replayApprovedDisposition,
        oldTarget: replayOldTarget,
      }),
      errandFixResponse: null,
      deliveryMemberFixResponse: null,
    });
    const replayResponse = advanceDeliveryReviewFixResponse({
      record: replayPendingRecord,
      oldTarget: replayOldTarget,
      hostedTarget: { repository: "owner/repo", pullRequest: 401, headSha: reviewedHead },
      currentHead: responseMember.coordinates.head,
      currentTree: responseMember.coordinates.tree,
      applicability: "focused",
      verificationEvidenceRefs: ["verification://durable-response-replay"],
      verifiedAt: "2026-08-31T12:11:00Z",
    });
    if (replayResponse.status === "refused") throw new Error(replayResponse.reason);
    await new LocalApprovedDispositionRecordStore(publisher).appendDispositionRecord(replayResponse.record);
    await new LocalReviewOperationStateStore(publisher).publishOperation({
      schemaVersion: 1,
      semanticsVersion: "review-operation/v1",
      operationId: replayOperationId,
      updatedAt: "2026-08-31T12:12:00Z",
      kind: "lane-progress",
      lane: "standard",
      repositoryId,
      changeRequestId: "pull/401",
      headSha: reviewedHead,
      completedPasses: 1,
      attempts: [{
        attemptId: replayAttemptId,
        sourceId: "codex-pr",
        outcome: "findings",
        hosted: {
          target: { repository: "owner/repo", pullRequest: 401, headSha: reviewedHead },
          requestedCoverage: "complete",
          effectiveCoverage: "complete",
          vehicle: {
            kind: "delivery-member",
            planId: fixture.plan.planId,
            deliverableId: selectedDeliverableId,
            workUnitId: fixture.plan.workUnitId,
            head: reviewedHead,
          },
          reviewTarget: replayOldTarget,
          requirement: replayRequirement,
          actorIdentity: "host-actor-1",
          findings: [finding],
          dispositionSetId: replayApprovedDisposition.dispositionSet.dispositionSetId,
          settledFindingIds: [],
        },
      }],
    }, 0);

    const responseApplicability = await runArcWithStdin(
      ["delivery", "review-fix", "continue", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({ repository: "owner/repo", remote: "origin" })}\n`,
      { env: fixture.env },
    );
    expect(responseApplicability.exitCode, `${responseApplicability.stderr}\n${responseApplicability.stdout}`).toBe(0);
    const responseApplicabilityStop = JSON.parse(responseApplicability.stdout) as {
      reviewStatus: { selectionAction: unknown };
    };
    expect(responseApplicabilityStop, responseApplicability.stdout).toMatchObject({
      status: "review-status-required",
      nextAction: "resolve-review-applicability",
    });
    const retainedResponseSelection = await runArcWithStdin(
      ["candidate", "applicability", "resolve", fixture.plan.workUnitId, "-"],
      fixture.repository,
      `${JSON.stringify({
        kind: "review-applicability-selection",
        offer: responseApplicabilityStop.reviewStatus.selectionAction,
        selection: {
          selectedBy: "maintainer-1",
          selectedAt: "2026-08-31T12:13:00Z",
          choice: "review-required",
        },
      })}\n`,
      { env: fixture.env },
    );
    expect(
      retainedResponseSelection.exitCode,
      `${retainedResponseSelection.stderr}\n${retainedResponseSelection.stdout}`,
    ).toBe(0);
    const retainedResponseEffect = JSON.parse(retainedResponseSelection.stdout) as {
      recordEffect: { path: string; digest: string };
    };
    const replayedResponse = await runArcWithStdin(
      ["delivery", "review-fix", "continue", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({
        repository: "owner/repo",
        remote: "origin",
        recordEffects: [retainedResponseEffect.recordEffect],
      })}\n`,
      { env: fixture.env },
    );
    expect(replayedResponse.exitCode, `${replayedResponse.stderr}\n${replayedResponse.stdout}`).toBe(0);
    expect(JSON.parse(replayedResponse.stdout), replayedResponse.stdout).toMatchObject({
      status: "hosted-settlement-required",
      nextAction: "review-hosted-settle",
      responsePlan: { source: replaySource, findings: [{ findingId: finding.findingId }] },
      response: {
        state: "delivery-member-current",
        payload: {
          hostedSettlementPlan: {
            beforeFixFindingIds: [],
            afterFixFindingIds: [finding.findingId],
          },
        },
      },
      effectLog: [
        { kind: "commit", recordClass: "review-applicability-selection" },
        { kind: "push" },
        { kind: "dispatch", actionKind: "delivery-reconcile", resultStatus: "rebound" },
        { kind: "dispatch", actionKind: "review-respond", resultStatus: "delivery-member-current" },
      ],
    });
    await settleHostedAttemptFinding(new LocalReviewOperationStateStore(publisher), {
      operationId: replayOperationId,
      attemptId: replayAttemptId,
      dispositionSetId: replayApprovedDisposition.dispositionSet.dispositionSetId,
      findingId: finding.findingId,
      now: "2026-08-31T12:14:00Z",
    });
    const continuedAfterResponseSettlement = await runArcWithStdin(
      ["delivery", "review-fix", "continue", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({ repository: "owner/repo", remote: "origin" })}\n`,
      { env: fixture.env },
    );
    expect(
      continuedAfterResponseSettlement.exitCode,
      `${continuedAfterResponseSettlement.stderr}\n${continuedAfterResponseSettlement.stdout}`,
    ).toBe(0);
    expect(JSON.parse(continuedAfterResponseSettlement.stdout), continuedAfterResponseSettlement.stdout)
      .toMatchObject({
        status: "review-status-required",
        nextAction: "review-hosted-request",
        effectLog: [],
      });

    const retainedTarget = createReviewTarget({
      schemaVersion: oldTarget.schemaVersion,
      semanticsVersion: oldTarget.semanticsVersion,
      kind: oldTarget.kind,
      repositoryId,
      baseRef: oldTarget.baseRef,
      diffBaseSha: oldTarget.diffBaseSha,
      diffBaseTree: oldTarget.diffBaseTree,
      headSha: oldTarget.headSha,
      headTree: oldTarget.headTree,
    });
    const retainedRequirement = createReviewRequirement({
      target: retainedTarget,
      projection: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"f".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
      acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }],
      initialAdmission: "checkpoint",
    });
    if (retainedRequirement === null) throw new Error("retained review requirement must derive");
    const retainedAttemptIds = ["retained-first", "retained-second"];
    for (const [index, retainedAttemptId] of retainedAttemptIds.entries()) {
      await new LocalReviewOperationStateStore(publisher).publishOperation({
        schemaVersion: 1,
        semanticsVersion: "review-operation/v1",
        operationId: `lane-progress/${retainedAttemptId}`,
        updatedAt: `2026-08-31T12:${15 + index}:00Z`,
        kind: "lane-progress",
        lane: "standard",
        repositoryId,
        changeRequestId: "pull/401",
        headSha: reviewedHead,
        completedPasses: 1,
        attempts: [{
          attemptId: `operation-${retainedAttemptId}`,
          sourceId: "codex-pr",
          outcome: "clean",
          hosted: {
            target: { repository: "owner/repo", pullRequest: 401, headSha: reviewedHead },
            requestedCoverage: "complete",
            effectiveCoverage: "complete",
            vehicle: {
              kind: "delivery-member",
              planId: fixture.plan.planId,
              deliverableId: selectedDeliverableId,
              workUnitId: fixture.plan.workUnitId,
              head: reviewedHead,
            },
            reviewTarget: retainedTarget,
            requirement: retainedRequirement,
            actorIdentity: "host-actor-1",
            findings: [],
            dispositionSetId: null,
            settledFindingIds: [],
          },
        }],
      }, 0);
    }

    const resumedWithRetainedAttempts = await runArcWithStdin(
      ["delivery", "review-fix", "continue", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({ repository: "owner/repo", remote: "origin" })}\n`,
      { env: fixture.env },
    );
    expect(
      resumedWithRetainedAttempts.exitCode,
      `${resumedWithRetainedAttempts.stderr}\n${resumedWithRetainedAttempts.stdout}`,
    ).toBe(0);
    const aggregatedStop = JSON.parse(resumedWithRetainedAttempts.stdout) as {
      reviewStatus: {
        selectionAction: {
          kind: string;
          projections: readonly { selector: { priorAttemptId: string } }[];
        };
      };
    };
    expect(aggregatedStop, resumedWithRetainedAttempts.stdout).toMatchObject({
      command: "delivery review-fix continue",
      status: "review-status-required",
      nextAction: "resolve-review-applicability",
      reviewStatus: {
        selectionAction: {
          kind: "review-applicability-selection-batch",
          projections: [
            { selector: { priorAttemptId: "operation-retained-first" } },
            { selector: { priorAttemptId: "operation-retained-second" } },
          ],
        },
      },
    });

    const resolvedBatch = await runArcWithStdin(
      ["candidate", "applicability", "resolve", fixture.plan.workUnitId, "-"],
      fixture.repository,
      `${JSON.stringify({
        kind: "review-applicability-selection-batch",
        offer: aggregatedStop.reviewStatus.selectionAction,
        selection: {
          selectedBy: "maintainer-1",
          selectedAt: "2026-08-31T12:30:00Z",
          choice: "covered",
        },
      })}\n`,
      { env: fixture.env },
    );
    expect(resolvedBatch.exitCode, `${resolvedBatch.stderr}\n${resolvedBatch.stdout}`).toBe(0);
    expect(JSON.parse(resolvedBatch.stdout), resolvedBatch.stdout).toMatchObject({
      mode: "review-applicability-resolve",
      state: "resolved",
      nextAction: "commit-selection",
      choice: "covered",
    });
    const resolvedBatchEffect = JSON.parse(resolvedBatch.stdout) as {
      recordEffect: { path: string; digest: string };
    };
    const selectedCandidate = await readCandidateRecord(fixture.repository, fixture.plan.workUnitId);
    expect(selectedCandidate).not.toBeNull();
    expect(candidateReviewApplicabilitySelections(selectedCandidate!).map(
      ({ selector }) => selector.priorAttemptId,
    )).toEqual([
      replayAttemptId,
      ...retainedAttemptIds.map((attemptId) => `operation-${attemptId}`),
    ]);

    const configPath = join(fixture.repository, ".arc", "system", "arc-config.yml");
    const initialConfig = await readFile(configPath, "utf8");
    const oversizedConfig = initialConfig.replace(
      /^changeset\.advisory_threshold_lines:.*$/mu,
      "changeset.advisory_threshold_lines: 1",
    );
    expect(oversizedConfig).not.toBe(initialConfig);
    await writeFile(configPath, oversizedConfig, "utf8");

    const continuedAfterBatch = await runArcWithStdin(
      ["delivery", "review-fix", "continue", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({
        repository: "owner/repo",
        remote: "origin",
        recordEffects: [resolvedBatchEffect.recordEffect],
      })}\n`,
      { env: fixture.env },
    );
    expect(continuedAfterBatch.exitCode, `${continuedAfterBatch.stderr}\n${continuedAfterBatch.stdout}`).toBe(0);
    const afterBatch = JSON.parse(continuedAfterBatch.stdout) as {
      status: string;
      nextAction: string;
      reviewStatus: {
        action: DeliveryLocalReviewAdmission;
      };
      effectLog: readonly { kind: string; actionKind?: string; recordClass?: string }[];
    };
    expect(afterBatch).toMatchObject({
      status: "review-status-required",
      nextAction: "review-local-prepare",
      reviewStatus: {
        action: {
          sourceId: "delegated-agent",
          vehicle: { deliverableId: fixture.plan.members[1]!.deliverableId },
          scopeSelection: { mode: "chunked" },
        },
      },
      effectLog: [
        { kind: "commit", recordClass: "review-applicability-selection" },
        { kind: "push" },
        { kind: "dispatch", actionKind: "delivery-reconcile", resultStatus: "rebound" },
      ],
    });
    expect(afterBatch.effectLog.filter(({ kind }) => kind === "commit")).toEqual([
      expect.objectContaining({ kind: "commit", recordClass: "review-applicability-selection" }),
    ]);
    expect(afterBatch.effectLog.filter(({ kind }) => kind === "push")).toHaveLength(1);

    const localAdmission = afterBatch.reviewStatus.action;
    expect(localAdmission.scopeSelection?.target).toEqual(localAdmission.target);
    const preparedLocal = await runArcWithStdin(
      ["review", "local", "prepare", "-"],
      fixture.repository,
      `${JSON.stringify({
        schemaVersion: 1,
        evaluatorIdentity: "fresh-chunk-aggregate-reviewer",
        routingFacts: {
          contentKind: "code-bearing",
          reviewRisk: "routine",
          changeDeterminacy: "ordinary",
          ownership: "self",
          surfaceAuthority: "ordinary",
        },
        deliveryAdmission: localAdmission,
      })}\n`,
      { env: fixture.env },
    );
    expect(preparedLocal.exitCode, `${preparedLocal.stderr}\n${preparedLocal.stdout}`).toBe(0);
    const localPreparation = JSON.parse(preparedLocal.stdout) as {
      state: string;
      nextAction: string;
      payload: {
        operationId: string;
        target: { targetId: string; headSha: string; headTree: string };
        request: { evaluatorIdentity: string };
        reviewerPayload: {
          sourceDigest: string;
          guidanceDigest: string;
          guidance: { rubricVersion: string; rubricDigest: string };
        };
      };
    };
    expect(localPreparation).toMatchObject({ state: "ready", nextAction: "launch-review" });
    const persistedLocal = await new LocalReviewOperationStateStore(publisher)
      .readOperation(localPreparation.payload.operationId);
    expect(persistedLocal.state).toMatchObject({ deliveryAdmission: localAdmission });

    const resumedLocal = await runArcWithStdin(
      ["review", "local", "resume", "-"],
      fixture.repository,
      `${JSON.stringify({
        schemaVersion: 1,
        operationId: localPreparation.payload.operationId,
      })}\n`,
      { env: fixture.env },
    );
    expect(resumedLocal.exitCode, `${resumedLocal.stderr}\n${resumedLocal.stdout}`).toBe(0);
    expect(JSON.parse(resumedLocal.stdout)).toMatchObject({ state: "suspended", nextAction: "wait" });

    const localAttestation = await runArcWithStdin(
      ["review", "local", "attest", "-"],
      fixture.repository,
      `${JSON.stringify({
        schemaVersion: 1,
        operationId: localPreparation.payload.operationId,
        result: {
          status: "complete",
          result: "clean",
          targetId: localPreparation.payload.target.targetId,
          headSha: localPreparation.payload.target.headSha,
          headTree: localPreparation.payload.target.headTree,
          rubricVersion: localPreparation.payload.reviewerPayload.guidance.rubricVersion,
          rubricDigest: localPreparation.payload.reviewerPayload.guidance.rubricDigest,
          sourceDigest: localPreparation.payload.reviewerPayload.sourceDigest,
          guidanceDigest: localPreparation.payload.reviewerPayload.guidanceDigest,
          evaluatorIdentity: localPreparation.payload.request.evaluatorIdentity,
          reviewRunId: "run-chunked-member-aggregate",
          applicabilityId: null,
          findings: [],
        },
      })}\n`,
      { env: fixture.env },
    );
    expect(localAttestation.exitCode, `${localAttestation.stderr}\n${localAttestation.stdout}`).toBe(0);
    expect(JSON.parse(localAttestation.stdout)).toMatchObject({
      state: "attested-current",
      nextAction: "reduce",
    });

    await writeFile(configPath, initialConfig, "utf8");
    const continuedAfterLocal = await runArcWithStdin(
      ["delivery", "review-fix", "continue", "-", "--json"],
      fixture.repository,
      `${JSON.stringify({ repository: "owner/repo", remote: "origin" })}\n`,
      { env: fixture.env },
    );
    expect(continuedAfterLocal.exitCode, `${continuedAfterLocal.stderr}\n${continuedAfterLocal.stdout}`).toBe(0);
    const afterLocal = JSON.parse(continuedAfterLocal.stdout) as {
      status: string;
      nextAction: string;
      reviewStatus: {
        action: {
          target: { repository: string; pullRequest: number; headSha: string };
          provider: "coderabbit-pr" | "codex-pr";
          coverage: "complete" | "incremental";
          vehicle: {
            kind: "delivery-member";
            planId: string;
            deliverableId: string;
            workUnitId: string;
            head: string;
          };
        };
      };
      effectLog: readonly unknown[];
    };
    expect(afterLocal).toMatchObject({
      status: "review-status-required",
      nextAction: "review-hosted-request",
      reviewStatus: {
        action: {
          provider: "codex-pr",
          vehicle: { deliverableId: fixture.plan.members[2]!.deliverableId },
        },
      },
      effectLog: [],
    });

    const requestedAction = afterLocal.reviewStatus.action;
    const finalState = await fixture.states.read(fixture.plan.planId);
    if (finalState.status !== "ok" || finalState.value === null) {
      throw new Error("final correction state must be readable");
    }
    const requestedMember = finalState.value.value.members.find(
      ({ deliverableId }) => deliverableId === requestedAction.vehicle.deliverableId,
    );
    if (requestedMember?.coordinates === null || requestedMember?.coordinates === undefined) {
      throw new Error("pending request member coordinates must be readable");
    }
    const requestedReviewTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "delivery-member",
      repositoryId,
      baseRef: "main",
      diffBaseSha: requestedMember.coordinates.base,
      diffBaseTree: await git(fixture.repository, ["rev-parse", `${requestedMember.coordinates.base}^{tree}`]),
      headSha: requestedMember.coordinates.head,
      headTree: requestedMember.coordinates.tree,
    });
    const requestedRequirement = createReviewRequirement({
      target: requestedReviewTarget,
      projection: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"f".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
      acceptableSources: [{ sourceKind: "hosted", qualifier: requestedAction.provider }],
      initialAdmission: "checkpoint",
    });
    if (requestedRequirement === null) throw new Error("pending hosted requirement must derive");
    const pendingHandle = HostedRequestHandleSchema.parse({
      schemaVersion: 1 as const,
      provider: requestedAction.provider,
      requestedCoverage: requestedAction.coverage,
      effectiveCoverage: requestedAction.coverage,
      target: requestedAction.target,
      artifact: {
        kind: "issue-comment" as const,
        id: "pending-correction-request",
        url: "https://example.test/pending-correction-request",
        createdAt: "2026-08-31T12:45:00.000Z",
      },
      vehicle: requestedAction.vehicle,
    });
    await recordHostedPendingRequest(new LocalReviewOperationStateStore(publisher), {
      repositoryId,
      handle: pendingHandle,
      reviewTarget: requestedReviewTarget,
      requirement: requestedRequirement,
      actorIdentity: "host-actor-1",
      now: "2026-08-31T12:45:00.000Z",
    });

    for (let replay = 0; replay < 2; replay += 1) {
      const awaiting = await runArcWithStdin(
        ["delivery", "review-fix", "continue", "-", "--json"],
        fixture.repository,
        `${JSON.stringify({ repository: "owner/repo", remote: "origin" })}\n`,
        { env: fixture.env },
      );
      expect(awaiting.exitCode, `${awaiting.stderr}\n${awaiting.stdout}`).toBe(0);
      expect(JSON.parse(awaiting.stdout), awaiting.stdout).toMatchObject({
        command: "delivery review-fix continue",
        status: "review-status-required",
        stopKind: "external-wait",
        nextAction: "review-hosted-await",
        reviewStatus: { action: { schemaVersion: 1, handle: pendingHandle } },
        effectLog: [],
      });
    }
  }, 90_000);

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
