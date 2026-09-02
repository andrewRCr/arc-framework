/** GitHub native-stack refresh preparation behind the provider-neutral delivery port. */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import { deleteDeliveryRefreshCandidateRef } from "../../../lib/delivery/git-materialization.js";
import type { GitExec } from "../../../lib/git/exec.js";
import { normalizeGitRejection } from "../../../lib/git/process-error.js";
import {
  deliveryProviderRefreshCandidateFor,
  deriveDeliveryProviderRefreshCandidates,
  type DeliveryProviderRefreshCandidate,
  type DeliveryProviderRefreshExecutionScope,
  type DeliveryProviderRefreshPreparationPort,
  type DeliveryProviderRefreshPreparationResult,
} from "../../../lib/delivery/provider-refresh-execution.js";
import {
  observeDeliveryNativeStack,
  type DeliveryNativeStackInput,
  type DeliveryNativeStackPort,
} from "../../../lib/delivery/native-stack.js";
import type { DeliveryOperationSnapshotV1, DeliveryPlanV1 } from "../../../lib/delivery/schema.js";
import type { DeliveryTerminalConflictPreparation } from
  "../../../lib/delivery/suffix-reconciliation.js";
import {
  DeliveryProviderProcessError,
  type DeliveryProviderProcessRunner,
} from "../provider-process.js";

const objectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const MAX_PROVIDER_FAILURE_DETAIL_LENGTH = 1_000;

const GhStackViewSchema = z.object({
  trunk: z.string().min(1),
  currentBranch: z.string().min(1),
  branches: z.array(z.object({
    name: z.string().min(1),
    head: z.string().regex(objectId),
    base: z.string().regex(objectId),
    isCurrent: z.boolean(),
    isMerged: z.boolean(),
    isQueued: z.boolean(),
    needsRebase: z.boolean(),
    pr: z.object({
      number: z.number().int().positive(),
      url: z.string().min(1),
      state: z.string().min(1),
    }),
  })).min(1),
});

export type GhStackView = z.infer<typeof GhStackViewSchema>;

/** Decode the official `gh stack view --json` contract used by refresh preparation. */
export function decodeGhStackView(value: string): GhStackView | null {
  try {
    const parsed = GhStackViewSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface DeliveryRefreshTemporaryDirectories {
  create(): Promise<string>;
  remove(path: string): Promise<void>;
}

const defaultTemporaryDirectories: DeliveryRefreshTemporaryDirectories = {
  create: async () => mkdtemp(join(tmpdir(), "arc-delivery-refresh-")),
  remove: async (path) => rm(path, { recursive: true, force: true }),
};

export interface GhDeliveryProviderRefreshPortOptions {
  readonly git: GitExec;
  readonly gh: DeliveryProviderProcessRunner;
  readonly nativeStack: Pick<DeliveryNativeStackPort, "observe">;
  readonly checkoutPath: string;
  readonly remote: string;
  readonly temporaryDirectories?: DeliveryRefreshTemporaryDirectories;
}

function refName(ref: string | null): string | null {
  if (ref === null || !ref.startsWith("refs/heads/")) return null;
  const name = ref.slice("refs/heads/".length);
  return name === "" ? null : name;
}

function nativeInput(
  repository: string,
  before: DeliveryOperationSnapshotV1,
): DeliveryNativeStackInput | null {
  const targetRef = refName(before.target?.ref ?? null);
  if (targetRef === null || before.target?.coordinates === null || before.target === null) return null;
  const members = before.members.flatMap((member, index) => {
    const headRef = refName(member.ref);
    const baseRef = index === 0 ? targetRef : refName(before.members[index - 1]?.ref ?? null);
    if (headRef === null || baseRef === null || member.coordinates === null || member.changeRequest === null) {
      return [];
    }
    return [{
      deliverableId: member.deliverableId,
      changeRequestId: member.changeRequest.changeRequestId,
      headRef,
      headSha: member.coordinates.head,
      baseRef,
      headRepository: repository,
    }];
  });
  return members.length === before.members.length ? { repository, members } : null;
}

function viewMatchesBefore(
  view: GhStackView,
  input: DeliveryNativeStackInput,
  before: DeliveryOperationSnapshotV1,
  currentTargetHead: string,
): boolean {
  const trunk = refName(before.target?.ref ?? null);
  return trunk !== null && view.trunk === trunk && view.branches.length === input.members.length
    && input.members.every((member, index) => {
      const branch = view.branches[index];
      const coordinates = before.members[index]?.coordinates;
      const expectedBase = index === 0
        ? currentTargetHead
        : before.members[index - 1]?.coordinates?.head;
      return branch !== undefined && coordinates !== null && coordinates !== undefined
        && expectedBase !== undefined
        && branch.name === member.headRef
        && branch.head === coordinates.head
        && branch.base === expectedBase
        && String(branch.pr.number) === member.changeRequestId
        && branch.pr.state === "OPEN";
    });
}

async function readCoordinates(git: GitExec, cwd: string, ref: string): Promise<{
  readonly head: string;
  readonly tree: string;
} | null> {
  try {
    const [{ stdout: headOut }, { stdout: treeOut }] = await Promise.all([
      git("git", ["rev-parse", "--verify", ref], { cwd }),
      git("git", ["rev-parse", "--verify", `${ref}^{tree}`], { cwd }),
    ]);
    const head = headOut.trim();
    const tree = treeOut.trim();
    return objectId.test(head) && objectId.test(tree) ? { head, tree } : null;
  } catch {
    return null;
  }
}

async function isAncestor(git: GitExec, cwd: string, ancestor: string, descendant: string): Promise<boolean> {
  try {
    const { stdout } = await git("git", ["merge-base", ancestor, descendant], { cwd });
    return stdout.trim() === ancestor;
  } catch {
    return false;
  }
}

function mergeTreeOutput(value: string): { readonly tree: string; readonly paths: readonly string[] } | null {
  const values = value.split("\0").filter((item) => item !== "");
  const [tree, ...paths] = values;
  return tree !== undefined && objectId.test(tree)
    ? { tree, paths: [...new Set(paths)].sort() }
    : null;
}

type ProviderHistoryCollisionRecovery =
  | {
      readonly status: "recovered";
      readonly members: DeliveryOperationSnapshotV1["members"];
      readonly locallyResolvedDeliverableIds: readonly string[];
    }
  | {
      readonly status: "blocked";
      readonly reason: "content-conflict";
      readonly paths: readonly string[];
      readonly conflictPreparation: DeliveryTerminalConflictPreparation;
    }
  | { readonly status: "refused"; readonly reason: string; readonly detail?: string };

type ProviderHistoryConflictResolution =
  | { readonly status: "pending" }
  | { readonly status: "accepted"; readonly head: string; readonly tree: string }
  | { readonly status: "refused" };

async function checkedOutRef(git: GitExec, cwd: string): Promise<string | null> {
  try {
    const { stdout } = await git("git", ["symbolic-ref", "-q", "HEAD"], { cwd });
    const ref = stdout.trim();
    return ref.startsWith("refs/heads/") ? ref : null;
  } catch {
    return null;
  }
}

async function readProviderHistoryConflictResolution(input: {
  readonly git: GitExec;
  readonly cwd: string;
  readonly ref: string;
  readonly oldHead: string;
  readonly oldTree: string;
  readonly refreshedPredecessorHead: string;
}): Promise<ProviderHistoryConflictResolution> {
  const coordinates = await readCoordinates(input.git, input.cwd, input.ref);
  if (coordinates === null) return { status: "refused" };
  if (coordinates.head === input.oldHead) {
    return coordinates.tree === input.oldTree ? { status: "pending" } : { status: "refused" };
  }
  try {
    const parentLine = (await input.git(
      "git",
      ["rev-list", "--parents", "-n", "1", coordinates.head],
      { cwd: input.cwd },
    )).stdout.trim();
    return parentLine === `${coordinates.head} ${input.oldHead} ${input.refreshedPredecessorHead}`
      ? { status: "accepted", ...coordinates }
      : { status: "refused" };
  } catch {
    return { status: "refused" };
  }
}

async function readOrderedParents(
  git: GitExec,
  cwd: string,
  head: string,
): Promise<readonly string[] | null> {
  try {
    const fields = (await git("git", ["rev-list", "--parents", "-n", "1", head], { cwd }))
      .stdout.trim().split(" ");
    return fields[0] === head ? fields.slice(1) : null;
  } catch {
    return null;
  }
}

async function conflictCandidateReuse(input: {
  readonly git: GitExec;
  readonly cwd: string;
  readonly plan: DeliveryPlanV1;
  readonly before: DeliveryOperationSnapshotV1;
}): Promise<{
  readonly retained: readonly DeliveryProviderRefreshCandidate[];
  readonly reusable: readonly DeliveryProviderRefreshCandidate[];
}> {
  const retained: DeliveryProviderRefreshCandidate[] = [];
  const reusable = new Map<string, DeliveryProviderRefreshCandidate>();
  for (let index = 1; index < input.before.members.length; index += 1) {
    const member = input.before.members[index];
    const predecessor = input.before.members[index - 1];
    if (member?.ref === null || member?.ref === undefined || member.coordinates === null
      || predecessor === undefined) continue;
    const local = await readCoordinates(input.git, input.cwd, member.ref);
    if (local === null || local.head === member.coordinates.head) continue;
    const parents = await readOrderedParents(input.git, input.cwd, local.head);
    if (parents?.length !== 2 || parents[0] !== member.coordinates.head || parents[1] === undefined) continue;
    const candidate = deliveryProviderRefreshCandidateFor({
      plan: input.plan,
      deliverableId: predecessor.deliverableId,
      head: parents[1],
    });
    if (candidate === null) continue;
    const chain: DeliveryProviderRefreshCandidate[] = [];
    let chainIndex = index - 1;
    let chainHead = candidate.head;
    let valid = true;
    while (chainIndex >= 0) {
      const chainMember = input.before.members[chainIndex];
      if (chainMember?.coordinates === null || chainMember?.coordinates === undefined) {
        valid = false;
        break;
      }
      const chainCandidate = deliveryProviderRefreshCandidateFor({
        plan: input.plan,
        deliverableId: chainMember.deliverableId,
        head: chainHead,
      });
      const [coordinates, chainParents] = await Promise.all([
        readCoordinates(input.git, input.cwd, chainHead),
        readOrderedParents(input.git, input.cwd, chainHead),
      ]);
      if (chainCandidate === null || coordinates?.head !== chainHead || chainParents?.length !== 2
        || chainParents[0] !== chainMember.coordinates.head || chainParents[1] === undefined) {
        valid = false;
        break;
      }
      chain.push(chainCandidate);
      if (chainIndex === 0) break;
      const earlier = input.before.members[chainIndex - 1];
      if (earlier?.coordinates === null || earlier?.coordinates === undefined || earlier.ref === null) {
        valid = false;
        break;
      }
      const localEarlier = await readCoordinates(input.git, input.cwd, earlier.ref);
      if (chainParents[1] === earlier.coordinates.head || localEarlier?.head === chainParents[1]) break;
      chainHead = chainParents[1];
      chainIndex -= 1;
    }
    if (!valid || chain.some(({ deliverableId, head }) => {
      const existing = reusable.get(deliverableId);
      return existing !== undefined && existing.head !== head;
    })) continue;
    retained.push(candidate);
    for (const chainCandidate of chain) reusable.set(chainCandidate.deliverableId, chainCandidate);
  }
  return { retained, reusable: [...reusable.values()] };
}

async function ensureConflictCandidateAnchors(input: {
  readonly git: GitExec;
  readonly cwd: string;
  readonly candidates: readonly DeliveryProviderRefreshCandidate[];
}): Promise<boolean> {
  for (const candidate of input.candidates) {
    const current = await readCoordinates(input.git, input.cwd, candidate.ref);
    if (current?.head === candidate.head) continue;
    if (current !== null) return false;
    try {
      await input.git("git", [
        "update-ref", "-m", "delivery conflict predecessor anchor",
        candidate.ref, candidate.head, "0".repeat(candidate.head.length),
      ], { cwd: input.cwd });
    } catch {
      const raced = await readCoordinates(input.git, input.cwd, candidate.ref);
      if (raced?.head !== candidate.head) return false;
    }
    const installed = await readCoordinates(input.git, input.cwd, candidate.ref);
    const object = await readCoordinates(input.git, input.cwd, candidate.head);
    if (installed?.head !== candidate.head || object?.head !== candidate.head
      || installed.tree !== object.tree) return false;
  }
  return true;
}

async function normalizeProviderHistoryConflictResolutions(input: {
  readonly git: GitExec;
  readonly cwd: string;
  readonly before: DeliveryOperationSnapshotV1;
  readonly targetHead: string;
  readonly members: DeliveryOperationSnapshotV1["members"];
}): Promise<{
  readonly members: DeliveryOperationSnapshotV1["members"];
  readonly locallyResolvedDeliverableIds: readonly string[];
} | null> {
  const normalized: DeliveryOperationSnapshotV1["members"][number][] = [];
  const locallyResolvedDeliverableIds: string[] = [];
  for (const [index, member] of input.members.entries()) {
    const beforeMember = input.before.members[index];
    const expectedBase = index === 0 ? input.targetHead : normalized[index - 1]?.coordinates?.head;
    if (beforeMember === undefined || member.coordinates === null || expectedBase === undefined) return null;
    if (member.coordinates.base === expectedBase) {
      normalized.push(member);
      continue;
    }
    if (beforeMember.ref === null || beforeMember.coordinates === null) return null;
    const resolution = await readProviderHistoryConflictResolution({
      git: input.git,
      cwd: input.cwd,
      ref: beforeMember.ref,
      oldHead: beforeMember.coordinates.head,
      oldTree: beforeMember.coordinates.tree,
      refreshedPredecessorHead: expectedBase,
    });
    if (resolution.status !== "accepted"
      || resolution.head !== member.coordinates.head || resolution.tree !== member.coordinates.tree) return null;
    normalized.push({
      ...member,
      coordinates: { ...member.coordinates, base: expectedBase },
    });
    locallyResolvedDeliverableIds.push(member.deliverableId);
  }
  return { members: normalized, locallyResolvedDeliverableIds };
}

async function absorbProviderHistoryCollision(input: {
  readonly git: GitExec;
  readonly cwd: string;
  readonly resolutionCwd: string;
  readonly before: DeliveryOperationSnapshotV1;
  readonly selectedIndex: number;
  readonly targetHead: string;
  readonly reusableCandidates: readonly DeliveryProviderRefreshCandidate[];
}): Promise<ProviderHistoryCollisionRecovery> {
  try {
    await input.git("git", ["rebase", "--abort"], { cwd: input.cwd });
  } catch {
    return {
      status: "refused",
      reason: "conflict",
      detail: "The provider reported a conflict without a recoverable Git rebase state.",
    };
  }
  const members: DeliveryOperationSnapshotV1["members"][number][] = [];
  const locallyResolvedDeliverableIds: string[] = [];
  for (const [index, beforeMember] of input.before.members.entries()) {
    if (beforeMember.ref === null || beforeMember.coordinates === null) {
      return { status: "refused", reason: "scope-mismatch" };
    }
    const predecessorHead = index === 0 ? input.targetHead : members[index - 1]?.coordinates?.head;
    if (predecessorHead === undefined) return { status: "refused", reason: "scope-mismatch" };
    let coordinates = await readCoordinates(input.git, input.cwd, beforeMember.ref);
    if (coordinates === null) return { status: "refused", reason: "scope-mismatch" };
    if (index <= input.selectedIndex) {
      if (coordinates.head !== beforeMember.coordinates.head) {
        return { status: "refused", reason: "scope-mismatch" };
      }
    } else if (coordinates.head !== beforeMember.coordinates.head) {
      if (!await isAncestor(input.git, input.cwd, predecessorHead, coordinates.head)) {
        return { status: "refused", reason: "scope-mismatch" };
      }
    } else if (beforeMember.coordinates.base !== predecessorHead) {
      await input.git("git", ["switch", "--", beforeMember.ref.slice("refs/heads/".length)], { cwd: input.cwd });
      const status = (await input.git("git", ["status", "--porcelain=v1"], { cwd: input.cwd })).stdout.trim();
      if (status !== "" || await checkedOutRef(input.git, input.cwd) !== beforeMember.ref) {
        return { status: "refused", reason: "workspace-unavailable" };
      }
      const mergeArgs = [
        "merge-tree", "--write-tree", "--merge-base", beforeMember.coordinates.base,
        "--name-only", "-z", "--no-messages", beforeMember.coordinates.head, predecessorHead,
      ];
      let merged: ReturnType<typeof mergeTreeOutput>;
      try {
        merged = mergeTreeOutput((await input.git("git", mergeArgs, { cwd: input.cwd })).stdout);
      } catch (error) {
        const failure = normalizeGitRejection(error, { command: "git", args: mergeArgs });
        const conflicted = failure.kind === "nonzero-exit" && failure.exitCode === 1
          ? mergeTreeOutput(failure.stdout)
          : null;
        if (conflicted !== null && conflicted.paths.length > 0) {
          const resolution = await readProviderHistoryConflictResolution({
            git: input.git,
            cwd: input.resolutionCwd,
            ref: beforeMember.ref,
            oldHead: beforeMember.coordinates.head,
            oldTree: beforeMember.coordinates.tree,
            refreshedPredecessorHead: predecessorHead,
          });
          if (resolution.status === "refused") {
            return {
              status: "refused",
              reason: "conflict-resolution-mismatch",
              detail: "The named local member ref does not contain the exact approved two-parent resolution.",
            };
          }
          if (resolution.status === "accepted") {
            const imported = await readCoordinates(input.git, input.cwd, resolution.head);
            if (imported?.head !== resolution.head || imported.tree !== resolution.tree) {
              return { status: "refused", reason: "workspace-unavailable" };
            }
            await input.git("git", ["read-tree", "--reset", "-u", resolution.tree], { cwd: input.cwd });
            await input.git("git", [
              "update-ref", "-m", "delivery conflict resolution import",
              beforeMember.ref, resolution.head, beforeMember.coordinates.head,
            ], { cwd: input.cwd });
            coordinates = await readCoordinates(input.git, input.cwd, beforeMember.ref);
            const parentLine = (await input.git(
              "git",
              ["rev-list", "--parents", "-n", "1", resolution.head],
              { cwd: input.cwd },
            )).stdout.trim();
            const clean = (await input.git(
              "git",
              ["status", "--porcelain=v1"],
              { cwd: input.cwd },
            )).stdout.trim() === "";
            if (coordinates?.head !== resolution.head || coordinates.tree !== resolution.tree
              || parentLine !== `${resolution.head} ${beforeMember.coordinates.head} ${predecessorHead}`
              || await checkedOutRef(input.git, input.cwd) !== beforeMember.ref || !clean) {
              return { status: "refused", reason: "workspace-unavailable" };
            }
            members.push({
              ...beforeMember,
              coordinates: { base: predecessorHead, head: resolution.head, tree: resolution.tree },
            });
            locallyResolvedDeliverableIds.push(beforeMember.deliverableId);
            continue;
          }
          return {
            status: "blocked",
            reason: "content-conflict",
            paths: conflicted.paths,
            conflictPreparation: {
              topRef: beforeMember.ref,
              logicalMergeBase: beforeMember.coordinates.base,
              parents: { top: beforeMember.coordinates.head, refreshedPredecessor: predecessorHead },
              mergeTree: { argv: ["git", ...mergeArgs] },
            },
          };
        }
        return { status: "refused", reason: "workspace-unavailable" };
      }
      if (merged === null || merged.paths.length > 0) {
        return { status: "refused", reason: "workspace-unavailable" };
      }
      const reusable = input.reusableCandidates.find(({ deliverableId }) => (
        deliverableId === beforeMember.deliverableId
      ));
      let commit: string;
      if (reusable === undefined) {
        const { stdout: commitOut } = await input.git("git", [
          "commit-tree", merged.tree,
          "-p", beforeMember.coordinates.head,
          "-p", predecessorHead,
          "-m", "Absorb refreshed delivery predecessor",
        ], { cwd: input.cwd });
        commit = commitOut.trim();
        if (!objectId.test(commit)) return { status: "refused", reason: "workspace-unavailable" };
      } else {
        const [local, isolated, parents] = await Promise.all([
          readCoordinates(input.git, input.resolutionCwd, reusable.head),
          readCoordinates(input.git, input.cwd, reusable.head),
          readOrderedParents(input.git, input.cwd, reusable.head),
        ]);
        if (local?.head !== reusable.head || local.tree !== merged.tree
          || isolated?.head !== reusable.head || isolated.tree !== merged.tree
          || parents?.length !== 2 || parents[0] !== beforeMember.coordinates.head
          || parents[1] !== predecessorHead) {
          return { status: "refused", reason: "conflict-resolution-mismatch" };
        }
        commit = reusable.head;
      }
      await input.git("git", ["read-tree", "--reset", "-u", merged.tree], { cwd: input.cwd });
      await input.git("git", [
        "update-ref", "-m", "delivery predecessor absorption",
        beforeMember.ref, commit, beforeMember.coordinates.head,
      ], { cwd: input.cwd });
      coordinates = await readCoordinates(input.git, input.cwd, beforeMember.ref);
      const parentLine = (await input.git(
        "git",
        ["rev-list", "--parents", "-n", "1", commit],
        { cwd: input.cwd },
      )).stdout.trim();
      const clean = (await input.git("git", ["status", "--porcelain=v1"], { cwd: input.cwd })).stdout.trim() === "";
      if (coordinates?.head !== commit || coordinates.tree !== merged.tree
        || parentLine !== `${commit} ${beforeMember.coordinates.head} ${predecessorHead}` || !clean) {
        return { status: "refused", reason: "workspace-unavailable" };
      }
    }
    members.push({
      ...beforeMember,
      coordinates: { base: predecessorHead, head: coordinates.head, tree: coordinates.tree },
    });
  }
  return { status: "recovered", members, locallyResolvedDeliverableIds };
}

async function anchorConflictPredecessor(input: {
  readonly git: GitExec;
  readonly isolatedCwd: string;
  readonly checkoutCwd: string;
  readonly plan: DeliveryPlanV1;
  readonly before: DeliveryOperationSnapshotV1;
  readonly conflict: DeliveryTerminalConflictPreparation;
}): Promise<DeliveryProviderRefreshCandidate | null> {
  const conflictIndex = input.before.members.findIndex(({ ref }) => ref === input.conflict.topRef);
  if (conflictIndex < 0) throw new Error("conflict member unavailable");
  const predecessorHead = input.conflict.parents.refreshedPredecessor;
  const readable = await readCoordinates(input.git, input.checkoutCwd, predecessorHead);
  if (conflictIndex === 0) {
    if (readable?.head !== predecessorHead) throw new Error("conflict predecessor unavailable");
    return null;
  }
  const predecessor = input.before.members[conflictIndex - 1];
  if (predecessor?.ref === null || predecessor?.ref === undefined) {
    throw new Error("conflict predecessor unavailable");
  }
  const localPredecessor = await readCoordinates(input.git, input.checkoutCwd, predecessor.ref);
  if (localPredecessor?.head === predecessorHead) return null;
  const candidate = deliveryProviderRefreshCandidateFor({
    plan: input.plan,
    deliverableId: predecessor.deliverableId,
    head: predecessorHead,
  });
  if (candidate === null) throw new Error("conflict predecessor unavailable");
  const isolatedPredecessor = await readCoordinates(input.git, input.isolatedCwd, predecessor.ref);
  if (isolatedPredecessor?.head !== predecessorHead) throw new Error("conflict predecessor unavailable");
  await input.git("git", [
    "fetch", "--no-tags", input.isolatedCwd, `${predecessor.ref}:${candidate.ref}`,
  ], { cwd: input.checkoutCwd });
  const imported = await readCoordinates(input.git, input.checkoutCwd, candidate.ref);
  if (imported?.head !== predecessorHead || imported.tree !== isolatedPredecessor.tree) {
    throw new Error("conflict predecessor import mismatch");
  }
  return candidate;
}

function providerFailureDetail(error: DeliveryProviderProcessError): string {
  const source = error.stderr.trim() || error.stdout.trim() || error.message;
  return source.replace(/\s+/gu, " ").trim().slice(0, MAX_PROVIDER_FAILURE_DETAIL_LENGTH);
}

class ProviderRefreshPreparationRefusal extends Error {
  constructor(
    readonly reason: string,
    readonly detail?: string,
  ) {
    super(detail ?? reason);
  }
}

async function uniqueForkBoundary(
  git: GitExec,
  cwd: string,
  selectedHead: string,
  dependentHead: string,
): Promise<string> {
  let stdout: string;
  try {
    ({ stdout } = await git(
      "git",
      ["merge-base", "--all", selectedHead, dependentHead],
      { cwd },
    ));
  } catch {
    throw new ProviderRefreshPreparationRefusal(
      "scope-mismatch",
      "The selected member and first dependent do not have a usable fork boundary.",
    );
  }
  const boundaries = [...new Set(stdout.trim().split(/\s+/u).filter((value) => value !== ""))];
  const [boundary] = boundaries;
  if (boundaries.length !== 1 || boundary === undefined || !objectId.test(boundary)) {
    throw new ProviderRefreshPreparationRefusal(
      "scope-mismatch",
      "The selected member and first dependent do not have one unambiguous fork boundary.",
    );
  }
  return boundary;
}

async function seedSelectedPredecessorTransition(
  git: GitExec,
  cwd: string,
  before: DeliveryOperationSnapshotV1,
  selectedIndex: number,
): Promise<void> {
  const selected = before.members[selectedIndex];
  const firstDependent = before.members[selectedIndex + 1];
  const selectedRef = selected?.ref;
  const selectedHead = selected?.coordinates?.head;
  const dependentHead = firstDependent?.coordinates?.head;
  const recordedPredecessor = firstDependent?.coordinates?.base;
  if (selectedRef === null || selectedRef === undefined || selectedHead === undefined
    || dependentHead === undefined || recordedPredecessor === undefined
    || recordedPredecessor === selectedHead) return;
  const previousHead = await isAncestor(git, cwd, recordedPredecessor, dependentHead)
    ? recordedPredecessor
    : await uniqueForkBoundary(git, cwd, selectedHead, dependentHead);
  if (previousHead === selectedHead) return;
  const message = "provider refresh predecessor transition";
  await git("git", ["update-ref", "-m", message, selectedRef, previousHead, selectedHead], { cwd });
  await git("git", ["update-ref", "-m", message, selectedRef, selectedHead, previousHead], { cwd });
}

async function listCandidateRefs(git: GitExec, cwd: string, planId: string): Promise<DeliveryProviderRefreshCandidate[]> {
  const prefix = `refs/arc/delivery-refresh-candidates/${planId}/`;
  const { stdout } = await git("git", ["for-each-ref", "--format=%(refname) %(objectname)", prefix], { cwd });
  return stdout.split("\n").flatMap((line) => {
    if (line === "") return [];
    const [ref, head, ...extra] = line.split(" ");
    if (ref === undefined || head === undefined || extra.length > 0 || !ref.startsWith(prefix)
      || !objectId.test(head)) throw new Error("malformed refresh-candidate ref");
    return [{ deliverableId: "", ref, head }];
  });
}

/** GitHub adapter for isolated native refresh preparation; publication remains in ARC's Git boundary. */
export class GhDeliveryProviderRefreshPort implements DeliveryProviderRefreshPreparationPort {
  private readonly temporaryDirectories: DeliveryRefreshTemporaryDirectories;

  constructor(private readonly options: GhDeliveryProviderRefreshPortOptions) {
    this.temporaryDirectories = options.temporaryDirectories ?? defaultTemporaryDirectories;
  }

  async cleanup(candidates: readonly DeliveryProviderRefreshCandidate[]): Promise<
    { readonly status: "cleaned" } | { readonly status: "refused"; readonly reason: string }
  > {
    try {
      const exec: GitExec = (command, args, options) => this.options.git(command, args, {
        ...options,
        cwd: this.options.checkoutPath,
      });
      for (const candidate of candidates) {
        const deleted = await deleteDeliveryRefreshCandidateRef({
          exec,
          ref: candidate.ref,
          expectedHead: candidate.head,
        });
        if (deleted.status === "refused") {
          return { status: "refused", reason: "cleanup-required" };
        }
      }
      return { status: "cleaned" };
    } catch {
      return { status: "refused", reason: "cleanup-required" };
    }
  }

  async prepare(input: {
    readonly plan: DeliveryPlanV1;
    readonly repository: string;
    readonly scope: DeliveryProviderRefreshExecutionScope;
    readonly before: DeliveryOperationSnapshotV1;
  }): Promise<DeliveryProviderRefreshPreparationResult> {
    const registration = nativeInput(input.repository, input.before);
    let stale: readonly DeliveryProviderRefreshCandidate[];
    try {
      stale = await listCandidateRefs(
        this.options.git,
        this.options.checkoutPath,
        input.plan.planId,
      );
    } catch {
      return { status: "refused", reason: "candidate-observation-unavailable" };
    }
    if (registration === null) {
      return (await this.cleanup(stale)).status === "cleaned"
        ? { status: "refused", reason: "invalid-input" }
        : { status: "refused", reason: "candidate-cleanup-required" };
    }
    const conflictReuse = await conflictCandidateReuse({
      git: this.options.git,
      cwd: this.options.checkoutPath,
      plan: input.plan,
      before: input.before,
    });
    const reusableRefHeads = new Map(conflictReuse.retained.map(({ ref, head }) => [ref, head]));
    if ((await this.cleanup(stale.filter(({ ref, head }) => reusableRefHeads.get(ref) !== head))).status === "refused") {
      return { status: "refused", reason: "candidate-cleanup-required" };
    }
    if (!await ensureConflictCandidateAnchors({
      git: this.options.git,
      cwd: this.options.checkoutPath,
      candidates: conflictReuse.retained,
    })) {
      const cleaned = await this.cleanup(conflictReuse.retained);
      return cleaned.status === "cleaned"
        ? { status: "refused", reason: "candidate-observation-unavailable" }
        : { status: "refused", reason: "candidate-cleanup-required" };
    }
    const refuseBeforeWorkspace = async (reason: string): Promise<DeliveryProviderRefreshPreparationResult> => (
      (await this.cleanup(conflictReuse.retained)).status === "cleaned"
        ? { status: "refused", reason }
        : { status: "refused", reason: "candidate-cleanup-required" }
    );
    try {
      await this.options.gh.run(["stack", "--version"], { cwd: this.options.checkoutPath });
    } catch {
      return await refuseBeforeWorkspace("unsupported");
    }
    const observed = await observeDeliveryNativeStack(registration, this.options.nativeStack);
    if (observed.status !== "registered") {
      return await refuseBeforeWorkspace(`presentation-${observed.status}`);
    }

    let temporaryPath: string;
    try {
      temporaryPath = await this.temporaryDirectories.create();
    } catch {
      return await refuseBeforeWorkspace("workspace-unavailable");
    }
    let result: DeliveryProviderRefreshPreparationResult;
    let retainedConflictCandidate: DeliveryProviderRefreshCandidate | null = null;
    try {
      const { stdout: remoteUrlOut } = await this.options.git(
        "git",
        ["remote", "get-url", this.options.remote],
        { cwd: this.options.checkoutPath },
      );
      const remoteUrl = remoteUrlOut.trim();
      if (remoteUrl === "") throw new Error("remote unavailable");
      await this.options.git("git", [
        "clone", "--shared", "--no-checkout", "--", this.options.checkoutPath, temporaryPath,
      ], { cwd: this.options.checkoutPath });
      await this.options.git("git", ["remote", "set-url", "origin", remoteUrl], { cwd: temporaryPath });
      await this.options.gh.run(["stack", "checkout", String(observed.stackNumber)], { cwd: temporaryPath });
      const beforeView = decodeGhStackView(
        (await this.options.gh.run(["stack", "view", "--json"], { cwd: temporaryPath })).stdout,
      );
      const targetRef = input.before.target?.ref ?? null;
      const targetName = refName(targetRef);
      const localTarget = targetName === null
        ? null
        : await readCoordinates(this.options.git, temporaryPath, `refs/heads/${targetName}`);
      const beforeTarget = input.before.target?.coordinates;
      if (beforeView === null || targetRef === null || targetName === null || localTarget === null
        || !viewMatchesBefore(beforeView, registration, input.before, localTarget.head)) {
        result = { status: "refused", reason: "scope-mismatch" };
      } else {
        const targetMovement = beforeTarget !== null && beforeTarget !== undefined
          && localTarget.head === beforeTarget.head
          ? "exact" as const
          : beforeTarget !== null && beforeTarget !== undefined
            && await isAncestor(this.options.git, temporaryPath, beforeTarget.head, localTarget.head)
            ? "append-only" as const
            : null;
        const selectedId = input.scope.kind === "dependent-suffix"
          ? input.scope.selectedDeliverableId
          : input.before.members[0]?.deliverableId;
        const selectedIndex = input.before.members.findIndex(({ deliverableId }) => deliverableId === selectedId);
        const selectedBranch = registration.members[selectedIndex]?.headRef;
        if (selectedIndex < 0 || selectedBranch === undefined) {
          result = { status: "refused", reason: "scope-mismatch" };
        } else if (targetMovement === null) {
          result = { status: "refused", reason: "target-mismatch" };
        } else {
          if (input.scope.kind === "dependent-suffix") {
            await seedSelectedPredecessorTransition(this.options.git, temporaryPath, input.before, selectedIndex);
          }
          await this.options.git("git", ["switch", "--", selectedBranch], { cwd: temporaryPath });
          let collisionRecovery: ProviderHistoryCollisionRecovery | null = null;
          try {
            await this.options.gh.run([
              "stack", "rebase", "--upstack",
              ...(input.scope.kind === "dependent-suffix" ? ["--no-trunk"] : []),
            ], { cwd: temporaryPath });
          } catch (error) {
            if (!(error instanceof DeliveryProviderProcessError) || error.exitCode !== 3) throw error;
            collisionRecovery = await absorbProviderHistoryCollision({
              git: this.options.git,
              cwd: temporaryPath,
              resolutionCwd: this.options.checkoutPath,
              before: input.before,
              selectedIndex: input.scope.kind === "dependent-suffix" ? selectedIndex : -1,
              targetHead: localTarget.head,
              reusableCandidates: conflictReuse.reusable,
            });
          }
          if (collisionRecovery !== null && collisionRecovery.status !== "recovered") {
            if (collisionRecovery.status === "blocked") {
              retainedConflictCandidate = await anchorConflictPredecessor({
                git: this.options.git,
                isolatedCwd: temporaryPath,
                checkoutCwd: this.options.checkoutPath,
                plan: input.plan,
                before: input.before,
                conflict: collisionRecovery.conflictPreparation,
              });
              result = {
                status: "refused",
                reason: collisionRecovery.reason,
                paths: collisionRecovery.paths,
                conflictPreparation: collisionRecovery.conflictPreparation,
              };
            } else {
              result = collisionRecovery;
            }
          } else {
            const refreshedTarget = await readCoordinates(
              this.options.git,
              temporaryPath,
              `refs/heads/${targetName}`,
            );
            const requestedMembers: DeliveryOperationSnapshotV1["members"][number][] = [];
            if (collisionRecovery?.status === "recovered") {
              requestedMembers.push(...collisionRecovery.members);
            } else {
              const afterView = decodeGhStackView(
                (await this.options.gh.run(["stack", "view", "--json"], { cwd: temporaryPath })).stdout,
              );
              if (afterView !== null && afterView.trunk === targetName
                && afterView.branches.length === input.before.members.length) {
                for (const [index, beforeMember] of input.before.members.entries()) {
                  const branch = afterView.branches[index];
                  const registrationMember = registration.members[index];
                  if (branch === undefined || registrationMember === undefined
                    || branch.name !== registrationMember.headRef
                    || String(branch.pr.number) !== registrationMember.changeRequestId
                    || branch.pr.state !== "OPEN") {
                    requestedMembers.length = 0;
                    break;
                  }
                  const coordinates = await readCoordinates(this.options.git, temporaryPath, branch.head);
                  const expectedBase = index === 0 ? refreshedTarget?.head : afterView.branches[index - 1]?.head;
                  if (coordinates === null || expectedBase === undefined
                    || (input.scope.kind === "dependent-suffix" && index <= selectedIndex
                      && branch.head !== beforeMember.coordinates?.head)) {
                    requestedMembers.length = 0;
                    break;
                  }
                  requestedMembers.push({
                    deliverableId: beforeMember.deliverableId,
                    ref: beforeMember.ref,
                    changeRequest: beforeMember.changeRequest,
                    coordinates: { base: branch.base, head: branch.head, tree: coordinates.tree },
                  });
                }
              }
            }
            const normalizedMembers = refreshedTarget === null
              ? null
              : await normalizeProviderHistoryConflictResolutions({
                  git: this.options.git,
                  cwd: this.options.checkoutPath,
                  before: input.before,
                  targetHead: refreshedTarget.head,
                  members: requestedMembers,
                });
            const locallyResolvedDeliverableIds = normalizedMembers === null
              ? []
              : input.before.members
                  .map(({ deliverableId }) => deliverableId)
                  .filter((deliverableId) => (
                    collisionRecovery?.status === "recovered"
                    && collisionRecovery.locallyResolvedDeliverableIds.includes(deliverableId)
                  ) || normalizedMembers.locallyResolvedDeliverableIds.includes(deliverableId));
            if (refreshedTarget === null
              || refreshedTarget.head !== localTarget.head || refreshedTarget.tree !== localTarget.tree) {
              result = { status: "refused", reason: "malformed-result" };
            } else if (normalizedMembers === null
              || normalizedMembers.members.length !== input.before.members.length) {
              result = { status: "refused", reason: "scope-mismatch" };
            } else {
              const snapshot: DeliveryOperationSnapshotV1 = {
                target: { ref: targetRef, coordinates: refreshedTarget },
                members: normalizedMembers.members,
              };
              const candidateResult = deriveDeliveryProviderRefreshCandidates({
                plan: input.plan,
                before: input.before,
                requested: snapshot,
              });
              if (candidateResult.status !== "derived") {
                result = { status: "refused", reason: candidateResult.reason };
              } else {
                for (const candidate of candidateResult.candidates) {
                  const memberIndex = input.before.members.findIndex(
                    ({ deliverableId }) => deliverableId === candidate.deliverableId,
                  );
                  const source = registration.members[memberIndex]?.headRef;
                  if (source === undefined) throw new Error("candidate source unavailable");
                  await this.options.git("git", [
                    "fetch", "--no-tags", temporaryPath, `refs/heads/${source}:${candidate.ref}`,
                  ], { cwd: this.options.checkoutPath });
                  const imported = await readCoordinates(
                    this.options.git,
                    this.options.checkoutPath,
                    candidate.ref,
                  );
                  if (imported?.head !== candidate.head) throw new Error("candidate import mismatch");
                }
                result = {
                  status: "prepared",
                  observation: { snapshot, targetMovement },
                  candidates: candidateResult.candidates,
                  ...(locallyResolvedDeliverableIds.length === 0
                    ? {}
                    : { locallyResolvedDeliverableIds }),
                };
              }
            }
          }
        }
      }
    } catch (error) {
      result = error instanceof ProviderRefreshPreparationRefusal
        ? { status: "refused", reason: error.reason, detail: error.detail }
        : error instanceof DeliveryProviderProcessError && error.exitCode === 3
        ? { status: "refused", reason: "conflict", detail: providerFailureDetail(error) }
        : error instanceof DeliveryProviderProcessError
          ? { status: "refused", reason: "unavailable", detail: providerFailureDetail(error) }
          : { status: "refused", reason: "unavailable" };
    }

    let workspaceCleaned = true;
    try {
      await this.temporaryDirectories.remove(temporaryPath);
    } catch {
      workspaceCleaned = false;
    }
    if (!workspaceCleaned) {
      result = { status: "refused", reason: "workspace-cleanup-required" };
      retainedConflictCandidate = null;
    }
    if (result.status === "refused") {
      let residue: readonly DeliveryProviderRefreshCandidate[];
      try {
        residue = await listCandidateRefs(this.options.git, this.options.checkoutPath, input.plan.planId);
      } catch {
        return { status: "refused", reason: "candidate-cleanup-required" };
      }
      const cleaned = await this.cleanup(residue.filter(({ ref, head }) => (
        ref !== retainedConflictCandidate?.ref || head !== retainedConflictCandidate.head
      )));
      if (cleaned.status === "refused") return { status: "refused", reason: "candidate-cleanup-required" };
    }
    return result;
  }
}
