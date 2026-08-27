/** GitHub native-stack refresh preparation behind the provider-neutral delivery port. */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import type { GitExec } from "../../../lib/git/exec.js";
import {
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
import {
  DeliveryProviderProcessError,
  type DeliveryProviderProcessRunner,
} from "../provider-process.js";

const objectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

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

function viewMatchesBefore(view: GhStackView, input: DeliveryNativeStackInput, before: DeliveryOperationSnapshotV1): boolean {
  const trunk = refName(before.target?.ref ?? null);
  return trunk !== null && view.trunk === trunk && view.branches.length === input.members.length
    && input.members.every((member, index) => {
      const branch = view.branches[index];
      const coordinates = before.members[index]?.coordinates;
      return branch !== undefined && coordinates !== null && coordinates !== undefined
        && branch.name === member.headRef
        && branch.head === coordinates.head
        && branch.base === coordinates.base
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
      for (const candidate of candidates) {
        await this.options.git("git", ["update-ref", "-d", candidate.ref, candidate.head], {
          cwd: this.options.checkoutPath,
        });
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
    if (registration === null) return { status: "refused", reason: "invalid-input" };
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
    if ((await this.cleanup(stale)).status === "refused") {
      return { status: "refused", reason: "candidate-cleanup-required" };
    }
    try {
      await this.options.gh.run(["stack", "--version"], { cwd: this.options.checkoutPath });
    } catch {
      return { status: "refused", reason: "unsupported" };
    }
    const observed = await observeDeliveryNativeStack(registration, this.options.nativeStack);
    if (observed.status !== "registered") {
      return { status: "refused", reason: `presentation-${observed.status}` };
    }

    let temporaryPath: string;
    try {
      temporaryPath = await this.temporaryDirectories.create();
    } catch {
      return { status: "refused", reason: "workspace-unavailable" };
    }
    let result: DeliveryProviderRefreshPreparationResult;
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
      if (beforeView === null || !viewMatchesBefore(beforeView, registration, input.before)) {
        result = { status: "refused", reason: "scope-mismatch" };
      } else {
        const targetRef = input.before.target?.ref ?? null;
        const targetName = refName(targetRef);
        const selectedId = input.scope.kind === "dependent-suffix"
          ? input.scope.selectedDeliverableId
          : input.before.members[0]?.deliverableId;
        const selectedIndex = input.before.members.findIndex(({ deliverableId }) => deliverableId === selectedId);
        const selectedBranch = registration.members[selectedIndex]?.headRef;
        if (targetRef === null || targetName === null || selectedIndex < 0 || selectedBranch === undefined) {
          result = { status: "refused", reason: "scope-mismatch" };
        } else {
          const localTarget = await readCoordinates(this.options.git, temporaryPath, `refs/heads/${targetName}`);
          const beforeTarget = input.before.target?.coordinates;
          const targetMovement = localTarget !== null && beforeTarget !== null && beforeTarget !== undefined
            && localTarget.head === beforeTarget.head
            ? "exact" as const
            : localTarget !== null && beforeTarget !== null && beforeTarget !== undefined
              && await isAncestor(this.options.git, temporaryPath, beforeTarget.head, localTarget.head)
              ? "append-only" as const
              : null;
          if (targetMovement === null || (input.scope.kind === "dependent-suffix" && targetMovement !== "exact")) {
            result = { status: "refused", reason: "target-mismatch" };
          } else {
            await this.options.git("git", ["switch", "--", selectedBranch], { cwd: temporaryPath });
            await this.options.gh.run([
              "stack", "rebase", "--upstack",
              ...(input.scope.kind === "dependent-suffix" ? ["--no-trunk"] : []),
            ], { cwd: temporaryPath });
            const afterView = decodeGhStackView(
              (await this.options.gh.run(["stack", "view", "--json"], { cwd: temporaryPath })).stdout,
            );
            const refreshedTarget = await readCoordinates(
              this.options.git,
              temporaryPath,
              `refs/heads/${targetName}`,
            );
            if (afterView === null || localTarget === null || refreshedTarget === null
              || afterView.trunk !== targetName
              || refreshedTarget.head !== localTarget.head || refreshedTarget.tree !== localTarget.tree
              || afterView.branches.length !== input.before.members.length) {
              result = { status: "refused", reason: "malformed-result" };
            } else {
              const requestedMembers: DeliveryOperationSnapshotV1["members"][number][] = [];
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
                const expectedBase = index === 0 ? refreshedTarget.head : afterView.branches[index - 1]?.head;
                if (coordinates === null || expectedBase === undefined || branch.base !== expectedBase
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
              if (requestedMembers.length !== input.before.members.length) {
                result = { status: "refused", reason: "scope-mismatch" };
              } else {
                const snapshot: DeliveryOperationSnapshotV1 = {
                  target: { ref: targetRef, coordinates: refreshedTarget },
                  members: requestedMembers,
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
                  };
                }
              }
            }
          }
        }
      }
    } catch (error) {
      result = {
        status: "refused",
        reason: error instanceof DeliveryProviderProcessError && error.exitCode === 3
          ? "conflict"
          : "unavailable",
      };
    }

    let workspaceCleaned = true;
    try {
      await this.temporaryDirectories.remove(temporaryPath);
    } catch {
      workspaceCleaned = false;
    }
    if (!workspaceCleaned) result = { status: "refused", reason: "workspace-cleanup-required" };
    if (result.status === "refused") {
      let residue: readonly DeliveryProviderRefreshCandidate[];
      try {
        residue = await listCandidateRefs(this.options.git, this.options.checkoutPath, input.plan.planId);
      } catch {
        return { status: "refused", reason: "candidate-cleanup-required" };
      }
      const cleaned = await this.cleanup(residue);
      if (cleaned.status === "refused") return { status: "refused", reason: "candidate-cleanup-required" };
    }
    return result;
  }
}
