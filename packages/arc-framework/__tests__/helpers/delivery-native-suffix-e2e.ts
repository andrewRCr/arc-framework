/**
 * A four-member native delivery stack over a real repository, arranged so the bottom member can land alone.
 *
 * The atomic arm lands the whole non-terminal remainder and leaves nothing behind it, so it never reaches suffix
 * settlement. This arrangement lands one member and leaves two behind it, which is the shape that retargets the
 * remaining suffix, moves its local refs, and absorbs the terminal top.
 *
 * Four properties of the arrangement are load-bearing, each of which silently disables the case if dropped:
 *
 * - **`origin` is a distinct repository.** Settlement compares each member's host-reported head against its
 *   remote ref, so an origin aliased back to this checkout makes those the same object and no retarget can ever
 *   be represented.
 * - **The remote advances at landing time, not at setup.** The rebase of the remaining members is a consequence
 *   of the bottom member merging; arranging it up front leaves the pre-landing position inconsistent and
 *   selection refuses before any of this is reached.
 * - **The host stub lives outside the working tree.** Settlement checks out the terminal top and refuses a dirty
 *   worktree, which an untracked stub inside the tree trips.
 * - **A collision needs the target to have advanced on its own.** Replayed onto a landing that carries nothing but
 *   the bottom member's tree, every remaining member reproduces its original tree exactly, so neither the suffix
 *   nor the terminal wedge can be represented at all without a commit on the target for the retarget to carry.
 *
 * @module
 */

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  attachDeliveryOperationEffectIdentity,
  beginNativeDeliverySubmission,
  reserveDeliveryOperation,
} from "../../src/lib/delivery/operation.js";
import type { DeliveryStateV1 } from "../../src/lib/delivery/schema.js";
import { deliveryFourMemberStackPlanFixture } from "../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../fixtures/delivery-state.js";
import { git } from "../e2e/helpers.js";

const REPOSITORY = "owner/repo";
export const OPERATION_ID = "native-suffix-landing";
const EFFECT_ID = "native-effect-1";
const SHARED_PATH = "shared.txt";
const TARGET_LINE = "the protected target owns this line\n";
const SUFFIX_LINE = "the suffix member owns this line\n";
const TERMINAL_LINE = "the terminal top owns this line\n";

interface HostMember {
  readonly deliverableId: string;
  readonly changeRequestId: string;
  readonly headRef: string;
  readonly headSha: string;
  readonly baseRef: string;
}

export interface NativeSuffixStackFixture {
  readonly repository: string;
  readonly suffixRefs: readonly string[];
  readonly plan: ReturnType<typeof deliveryFourMemberStackPlanFixture>;
  readonly planId: string;
  readonly statePath: string;
  readonly env: Record<string, string>;
  /** The protected target before anything lands, and the merge commit the host produces for the bottom member. */
  readonly baseHead: string;
  readonly landedTargetHead: string;
  /** Local member refs as state records them, bottom member first; the terminal is excluded. */
  readonly memberRefs: readonly string[];
  /** Pre-rewrite heads of the two members behind the bottom one, in plan order. */
  readonly suffixHeads: readonly string[];
  /** Heads the host reports for those members once the bottom member has landed. */
  readonly retargetedHeads: readonly string[];
  readonly terminalRef: string;
  readonly terminalHead: string;
  readonly bottom: HostMember;
}

/**
 * Arrange the stack, its host responses, and its canonical delivery records.
 *
 * @param repository - An initialized temporary repository with an `origin` remote already configured.
 * @param options - `collision` arranges a wedge: `suffix` collides a member against the advanced target,
 *   `terminal` collides the terminal top against the retargeted member below it.
 * @returns Every locator the landing, settlement, and decline routes need.
 */
export async function installNativeSuffixStack(
  repository: string,
  options: { readonly collision?: "suffix" | "terminal" } = {},
): Promise<NativeSuffixStackFixture> {
  const plan = deliveryFourMemberStackPlanFixture();
  const initial = deliveryStateFixture(plan);
  const baseHead = await git(repository, ["rev-parse", "HEAD"]);
  const baseTree = await git(repository, ["rev-parse", "HEAD^{tree}"]);
  const topBranch = `feat/${plan.workUnitId}`;
  await git(repository, ["checkout", "-b", topBranch]);

  // One writer for both the original member and its replay onto a moved predecessor, so a retargeted member
  // carries exactly the contribution the proof reapplies and nothing else.
  const contribute = async (index: number): Promise<void> => {
    await writeFile(join(repository, `member-${index + 1}.txt`), `${plan.members[index]!.title}\n`);
    await git(repository, ["add", `member-${index + 1}.txt`]);
    if (index === 2 && options.collision === "suffix") {
      await writeFile(join(repository, SHARED_PATH), SUFFIX_LINE);
      await git(repository, ["add", SHARED_PATH]);
    }
    if (index === 3 && options.collision === "terminal") {
      await writeFile(join(repository, SHARED_PATH), TERMINAL_LINE);
      await git(repository, ["add", SHARED_PATH]);
    }
  };

  let predecessor = baseHead;
  const bound: (typeof initial.members)[number][] = [];
  const refs: string[] = [];
  for (const [index, member] of plan.members.entries()) {
    await contribute(index);
    await git(repository, ["commit", "-m", `member ${index + 1}`]);
    const head = await git(repository, ["rev-parse", "HEAD"]);
    const tree = await git(repository, ["rev-parse", "HEAD^{tree}"]);
    const ref = index === plan.members.length - 1
      ? topBranch
      : `delivery/${plan.workUnitId}/${member.chunkKey}`;
    if (index < plan.members.length - 1) await git(repository, ["branch", ref, head]);
    bound.push({
      ...initial.members[index]!,
      ref: `refs/heads/${ref}`,
      changeRequest: { providerId: "github" as const, changeRequestId: String(41 + index) },
      coordinates: { base: predecessor, head, tree },
    });
    refs.push(`refs/heads/${ref}`);
    predecessor = head;
  }

  const state = {
    ...initial,
    target: { ref: "refs/heads/main", coordinates: { head: baseHead, tree: baseTree } },
    members: bound,
  };
  const nonTerminal = bound.slice(0, -1);
  const terminal = bound.at(-1)!;
  const hostMembers: HostMember[] = nonTerminal.map((member, index) => ({
    deliverableId: member.deliverableId,
    changeRequestId: member.changeRequest!.changeRequestId,
    headRef: member.ref!.replace(/^refs\/heads\//u, ""),
    headSha: member.coordinates!.head,
    baseRef: index === 0 ? "main" : nonTerminal[index - 1]!.ref!.replace(/^refs\/heads\//u, ""),
  }));
  const bottom = hostMembers[0]!;

  // The target does not stand still while the stack waits on it. Without a commit of its own, every member
  // replays byte-identically onto the landing and no collision the segment exists to settle can arise at all.
  let targetHead = baseHead;
  if (options.collision !== undefined) {
    await git(repository, ["checkout", "--detach", baseHead]);
    await writeFile(join(repository, SHARED_PATH), TARGET_LINE);
    await git(repository, ["add", SHARED_PATH]);
    await git(repository, ["commit", "-m", "independent target advance"]);
    targetHead = await git(repository, ["rev-parse", "HEAD"]);
    await git(repository, ["checkout", topBranch]);
  }

  const landedTargetTree = await git(repository, [
    "merge-tree", "--write-tree", "--no-messages",
    "--merge-base", baseHead, targetHead, nonTerminal[0]!.coordinates!.head,
  ]);
  const landedTargetHead = await git(repository, [
    "commit-tree", landedTargetTree,
    "-p", targetHead, "-p", nonTerminal[0]!.coordinates!.head,
    "-m", "native bottom-member merge",
  ]);

  // Each remaining member is replayed onto what now precedes it rather than reparented, so its retargeted tree is
  // the one the contribution proof's own reapply produces. A member whose replay collides with the advanced target
  // lands here as the resolution the host published — which is the state the proof can no longer prove.
  const retargetedHeads: string[] = [];
  let retargetParent = landedTargetHead;
  for (const offset of nonTerminal.slice(1).keys()) {
    await git(repository, ["checkout", "--detach", retargetParent]);
    await contribute(offset + 1);
    await git(repository, ["commit", "-m", "retargeted member"]);
    retargetParent = await git(repository, ["rev-parse", "HEAD"]);
    retargetedHeads.push(retargetParent);
  }
  await git(repository, ["checkout", topBranch]);

  // `origin` is a distinct repository, not this one. The retarget the host performs moves the remote member
  // branches while the local ones stay where they were, and that difference is what settlement reconciles; an
  // origin aliased back to this checkout would make the two refs the same object and hide the case entirely.
  const originPath = join(repository, ".git", "arc-suffix-origin.git");
  await git(repository, ["init", "--bare", "--initial-branch", "main", originPath]);
  await git(repository, ["remote", "add", "origin", `file://${originPath}`]);
  await git(repository, [
    "push", "origin",
    `${baseHead}:refs/heads/main`,
    ...nonTerminal.map((member, index) => (
      `${member.coordinates!.head}:refs/heads/${hostMembers[index]!.headRef}`
    )),
    `${terminal.coordinates!.head}:${terminal.ref!}`,
  ]);

  const common = await git(repository, ["rev-parse", "--git-common-dir"]);
  const commonDir = common.startsWith("/") ? common : join(repository, common);
  const plans = join(commonDir, "arc", "delivery", "plans");
  const states = join(commonDir, "arc", "delivery", "state");
  await Promise.all([mkdir(plans, { recursive: true }), mkdir(states, { recursive: true })]);
  const statePath = join(states, `${plan.planId}.json`);
  await Promise.all([
    writeFile(join(plans, `${plan.planId}.json`), `${JSON.stringify(plan)}\n`),
    writeFile(statePath, `${JSON.stringify({
      schemaVersion: 1,
      semanticsVersion: "delivery-state-store/v1",
      planId: plan.planId,
      revision: 1,
      value: state,
    })}\n`),
  ]);

  const env = await writeFakeHost(repository, {
    hostMembers,
    terminal: {
      changeRequestId: terminal.changeRequest!.changeRequestId,
      headRef: terminal.ref!.replace(/^refs\/heads\//u, ""),
      headSha: terminal.coordinates!.head,
      baseRef: hostMembers.at(-1)!.headRef,
    },
    baseHead,
    baseTree,
    landedTargetHead,
    landedTargetTree,
    retargetedHeads,
  });

  return {
    repository,
    suffixRefs: refs.slice(1, -1),
    plan,
    planId: plan.planId,
    statePath,
    env,
    baseHead,
    landedTargetHead,
    memberRefs: refs.slice(0, -1),
    suffixHeads: nonTerminal.slice(1).map((member) => member.coordinates!.head),
    retargetedHeads,
    terminalRef: terminal.ref!,
    terminalHead: terminal.coordinates!.head,
    bottom,
  };
}

async function writeFakeHost(repository: string, input: {
  readonly hostMembers: readonly HostMember[];
  readonly terminal: { changeRequestId: string; headRef: string; headSha: string; baseRef: string };
  readonly baseHead: string;
  readonly baseTree: string;
  readonly landedTargetHead: string;
  readonly landedTargetTree: string;
  readonly retargetedHeads: readonly string[];
}): Promise<Record<string, string>> {
  const { hostMembers, terminal, retargetedHeads } = input;
  const open = (member: HostMember, headSha: string, baseRef: string) => JSON.stringify({
    number: Number(member.changeRequestId),
    state: "open",
    merged: false,
    draft: false,
    head: { ref: member.headRef, sha: headSha, repo: { full_name: REPOSITORY } },
    base: { ref: baseRef, repo: { full_name: REPOSITORY } },
  });
  const registered = hostMembers.map((member) => open(member, member.headSha, member.baseRef));
  // After the bottom member lands, the host reports it merged and reports each remaining member at the head its
  // retarget produced, based on whatever now precedes it.
  const settledResponses = hostMembers.map((member, index) => (index === 0
    ? JSON.stringify({
        number: Number(member.changeRequestId),
        state: "closed",
        merged: true,
        draft: false,
        head: { ref: member.headRef, sha: member.headSha, repo: { full_name: REPOSITORY } },
        base: { ref: member.baseRef, repo: { full_name: REPOSITORY } },
        merge_commit_sha: input.landedTargetHead,
      })
    : open(member, retargetedHeads[index - 1]!, index === 1 ? "main" : hostMembers[index - 1]!.headRef)));
  const stackResponse = JSON.stringify([{
    number: 7,
    base: { ref: hostMembers[0]!.baseRef },
    pull_requests: hostMembers.map((member) => ({
      number: Number(member.changeRequestId),
      head: { ref: member.headRef, sha: member.headSha },
      base: { ref: member.baseRef },
    })),
  }]);
  const listResponses = hostMembers.map((member) => JSON.stringify([{
    number: Number(member.changeRequestId),
    url: `https://github.com/${REPOSITORY}/pull/${member.changeRequestId}`,
    state: "OPEN",
    baseRefName: member.baseRef,
    headRefName: member.headRef,
    headRefOid: member.headSha,
  }]));
  const terminalResponse = JSON.stringify({
    number: Number(terminal.changeRequestId),
    state: "open",
    merged: false,
    draft: false,
    head: { ref: terminal.headRef, sha: terminal.headSha, repo: { full_name: REPOSITORY } },
    base: { ref: terminal.baseRef, repo: { full_name: REPOSITORY } },
  });
  const mergeResponse = JSON.stringify({
    status: "pending",
    details: {
      uuid: "native-effect-1",
      expected_head_sha: hostMembers[0]!.headSha,
      merge_method: "merge",
      merge_action: "direct_merge",
    },
  });

  // Outside the working tree: settlement checks out the terminal top and refuses a dirty worktree, which an
  // untracked stub in the tree would trip.
  const fakeBin = join(repository, ".git", "fake-bin");
  const fakeGh = join(fakeBin, "gh");
  await mkdir(fakeBin, { recursive: true });
  await writeFile(fakeGh, [
    "#!/bin/sh",
    "case \"$*\" in",
    "  *\"pr checks \"*) printf '[]\\n'; exit 0 ;;",
    "  *\"rules/branches/\"*) printf '[[]]\\n'; exit 0 ;;",
    ...hostMembers.map((member, index) => (
      `  *"pr list "*"--head ${member.headRef}"*) printf '%s\\n' '${listResponses[index]}'; exit 0 ;;`
    )),
    "esac",
    "case \"$2\" in",
    "  view)",
    `    printf '%s\\n' '{"nameWithOwner":"${REPOSITORY}","defaultBranchRef":{"name":"main"}}'`,
    "    ;;",
    `  repos/${REPOSITORY})`,
    "    printf '%s\\n' '{\"allow_merge_commit\":true,\"allow_rebase_merge\":true,\"allow_squash_merge\":true}'",
    "    ;;",
    `  repos/${REPOSITORY}/branches/*)`,
    "    printf '%s\\n' '{\"protection\":null}'",
    "    ;;",
    `  repos/${REPOSITORY}/git/ref/heads/main)`,
    `    if [ "\${ARC_FAKE_GH_MODE:-registered}" = "settled" ]; then printf '%s\\n' '{"object":{"sha":"${input.landedTargetHead}"}}'; else printf '%s\\n' '{"object":{"sha":"${input.baseHead}"}}'; fi`,
    "    ;;",
    `  repos/${REPOSITORY}/git/commits/${input.baseHead})`,
    `    printf '%s\\n' '{"tree":{"sha":"${input.baseTree}"}}'`,
    "    ;;",
    `  repos/${REPOSITORY}/git/commits/${input.landedTargetHead})`,
    `    printf '%s\\n' '{"tree":{"sha":"${input.landedTargetTree}"}}'`,
    "    ;;",
    `  repos/${REPOSITORY}/stacks)`,
    `    printf '%s\\n' '${stackResponse}'`,
    "    ;;",
    ...hostMembers.flatMap((member, index) => [
      `  repos/${REPOSITORY}/pulls/${member.changeRequestId})`,
      `    if [ "\${ARC_FAKE_GH_MODE:-registered}" = "settled" ]; then printf '%s\\n' '${settledResponses[index]}'; else printf '%s\\n' '${registered[index]}'; fi`,
      "    ;;",
    ]),
    `  repos/${REPOSITORY}/pulls/${terminal.changeRequestId})`,
    `    printf '%s\\n' '${terminalResponse}'`,
    "    ;;",
    `  repos/${REPOSITORY}/pulls/${hostMembers[0]!.changeRequestId}/merge-async)`,
    `    printf '%s\\n' '${mergeResponse}'`,
    "    ;;",
    `  repos/${REPOSITORY}/pulls/${hostMembers[0]!.changeRequestId}/merge-async/native-effect-1)`,
    "    printf '%s\\n' '{\"status\":\"merged\"}'",
    "    ;;",
    "  *) echo \"unexpected gh invocation: $*\" >&2; exit 1 ;;",
    "esac",
    "",
  ].join("\n"));
  await chmod(fakeGh, 0o755);
  return { PATH: `${fakeBin}:${process.env.PATH ?? ""}` };
}

/**
 * Advance the stack's canonical state to a submitted bottom-member landing carrying a persisted effect identity.
 *
 * Composed through the same transitions the verbs use, so the seeded reservation is one the landing path could
 * itself have produced; only the attended preparation gate is skipped.
 *
 * @param fixture - The arranged stack whose state file is advanced in place.
 */
export async function seedSubmittedBottomLanding(fixture: NativeSuffixStackFixture): Promise<void> {
  const envelope = JSON.parse(await readFile(fixture.statePath, "utf8")) as {
    readonly planId: string;
    readonly revision: number;
    readonly value: DeliveryStateV1;
  };
  const bottom = envelope.value.members[0]!;
  const snapshot = { target: envelope.value.target, members: [bottom] };
  const reserved = reserveDeliveryOperation({ revision: envelope.revision, value: envelope.value }, fixture.plan, {
    operationId: OPERATION_ID,
    kind: "land",
    mode: "native",
    nativeArm: "linked-single",
    affectedDeliverableIds: [bottom.deliverableId],
    expectedStateRevision: envelope.revision,
    before: snapshot,
    requested: snapshot,
    effect: {
      providerId: "github",
      repository: REPOSITORY,
      changeRequestId: bottom.changeRequest!.changeRequestId,
      headSha: bottom.coordinates!.head,
      baseRef: "main",
      targetRef: "refs/heads/main",
      strategy: "merge",
      mergePolicy: {
        repository: REPOSITORY,
        stackPosition: "intermediate",
        method: "merge",
        allowedMethods: ["merge"],
        policyFingerprint: `sha256:${"a".repeat(64)}`,
      },
    },
  });
  if (reserved.status !== "reserved") throw new Error("fixture native reservation refused");
  const submitting = beginNativeDeliverySubmission(
    { revision: envelope.revision + 1, value: reserved.state }, OPERATION_ID,
  );
  if (submitting.status !== "begun") throw new Error("fixture native submission transition refused");
  const attached = attachDeliveryOperationEffectIdentity(
    { revision: envelope.revision + 2, value: submitting.state },
    OPERATION_ID,
    { providerId: "github", effectId: EFFECT_ID },
  );
  if (attached.status !== "attached") throw new Error("fixture native identity attachment refused");
  await writeFile(fixture.statePath, `${JSON.stringify({
    ...envelope,
    revision: envelope.revision + 3,
    value: attached.state,
  })}\n`);
}

/**
 * Move the remote to where the host leaves it once the bottom member merges: the target carries the merge, and
 * each remaining member has been rebased onto what now precedes it. Local refs are deliberately left behind,
 * which is the state settlement exists to reconcile.
 *
 * @param fixture - The arranged stack whose origin is advanced.
 */
export async function retargetRemoteSuffix(fixture: NativeSuffixStackFixture): Promise<void> {
  await git(fixture.repository, [
    "push", "--force", "origin",
    `${fixture.landedTargetHead}:refs/heads/main`,
    ...fixture.suffixRefs.map((ref, index) => `${fixture.retargetedHeads[index]!}:${ref}`),
  ]);
}
