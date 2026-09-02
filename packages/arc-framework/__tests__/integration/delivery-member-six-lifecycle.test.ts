import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { handleDeliveryExecution } from "../../src/handlers/delivery-execution.js";
import type { RawGitExec } from "../../src/lib/change-facts.js";
import {
  absorbGitDeliveryChain,
  preflightGitDeliveryChainAbsorption,
} from "../../src/lib/delivery/chain-absorption.js";
import { proveGitDeliveryContribution } from "../../src/lib/delivery/git-contribution-proof.js";
import {
  publishDeliveryTopRef,
  rewriteDeliveryLocalRef,
  rewriteDeliveryMemberRef,
} from "../../src/lib/delivery/git-materialization.js";
import {
  applyDeliveryLanding,
  prepareDeliveryLanding,
  reconcileDeliveryExecution,
} from "../../src/lib/delivery/landing.js";
import {
  deriveNativeDeliveryRegisteredRemainder,
  selectNativeDeliveryLandingArm,
} from "../../src/lib/delivery/native-landing.js";
import {
  deriveDeliveryProviderRefreshSubject,
  observeDeliveryProviderRefresh,
  type DeliveryProviderRefreshSubject,
} from "../../src/lib/delivery/provider-refresh-observation.js";
import {
  deriveDeliveryProviderRefreshCandidates,
  executeDeliveryProviderRefresh,
} from "../../src/lib/delivery/provider-refresh-execution.js";
import { deriveDeliveryPosition, type DeliveryPositionFactsV1 } from "../../src/lib/delivery/position.js";
import {
  DeliveryStateV1Schema,
  type DeliveryStateV1,
} from "../../src/lib/delivery/schema.js";
import {
  adoptExternalDeliverySuffixRefresh,
  settleReservedDeliverySuffixRefresh,
  type DeliveryProviderRefreshMovement,
} from "../../src/lib/delivery/suffix-reconciliation.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { readAncestry } from "../../src/lib/work-unit/git-decomposition-object-readers.js";
import {
  deliveryStackPlanFixture,
  deliveryThreeMemberStackPlanFixture,
} from "../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../fixtures/delivery-state.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => removeGitBackedDir(root)));
});

interface RefreshFixture {
  readonly repository: string;
  readonly plan: ReturnType<typeof deliveryStackPlanFixture>;
  readonly initial: { readonly revision: number; readonly value: DeliveryStateV1 };
  readonly facts: DeliveryPositionFactsV1;
  readonly subject: DeliveryProviderRefreshSubject;
  readonly originalTop: string;
  readonly refreshedMember: string;
  readonly advancedTarget: string;
  readonly collisionHead: string;
  readonly rawExec: RawGitExec;
  readonly gitExec: GitExec;
  readonly git: (args: readonly string[]) => Promise<string>;
  readonly coordinate: (head: string) => Promise<{ readonly head: string; readonly tree: string }>;
  readonly observeRefresh: () => ReturnType<typeof observeDeliveryProviderRefresh>;
  readonly proveMovement: (
    movement: DeliveryProviderRefreshMovement,
  ) => ReturnType<typeof proveGitDeliveryContribution>;
}

async function createRefreshFixture(input: { readonly conflict?: boolean } = {}): Promise<RefreshFixture> {
  const repository = await createTempRepoCore({ prefix: "arc-delivery-member-six-" });
  roots.push(repository);
  const remoteParent = await mkdtemp(join(tmpdir(), "arc-delivery-member-six-remote-"));
  roots.push(remoteParent);
  const remote = join(remoteParent, "remote.git");
  await execFileAsync("git", ["init", "--bare", remote]);
  await execFileAsync("git", ["remote", "add", "origin", remote], { cwd: repository });
  const git = async (args: readonly string[]): Promise<string> => (
    await execFileAsync("git", [...args], { cwd: repository })
  ).stdout.trim();
  const commit = async (path: string, content: string, message: string): Promise<string> => {
    await writeFile(join(repository, path), content, "utf8");
    await git(["add", path]);
    await git(["commit", "-m", message]);
    return git(["rev-parse", "HEAD"]);
  };

  await writeFile(join(repository, "shared.txt"), "base\n", "utf8");
  await writeFile(join(repository, "base.txt"), "base\n", "utf8");
  await git(["add", "shared.txt", "base.txt"]);
  await git(["commit", "-m", "base"]);
  const base = await git(["rev-parse", "HEAD"]);
  await git(["push", "origin", `${base}:refs/heads/main`]);

  await git(["switch", "-c", "delivery/member-1"]);
  const originalMember = await commit("member.txt", "member\n", "member");
  await git(["push", "origin", `${originalMember}:refs/heads/delivery/member-1`]);

  await git(["switch", "-c", "feat/example"]);
  await writeFile(join(repository, "residual.txt"), "residual\n", "utf8");
  if (input.conflict === true) await writeFile(join(repository, "shared.txt"), "top\n", "utf8");
  await git(["add", "residual.txt", "shared.txt"]);
  await git(["commit", "-m", "top residual"]);
  const originalTop = await git(["rev-parse", "HEAD"]);
  await git(["push", "origin", `${originalTop}:refs/heads/feat/example`]);

  await git(["switch", "-c", "collision"]);
  const collisionHead = await commit("collision.txt", "collision\n", "competing top");
  await git(["switch", "feat/example"]);

  await git(["switch", "-c", "advanced-target", base]);
  await writeFile(join(repository, "external.txt"), "external\n", "utf8");
  if (input.conflict === true) await writeFile(join(repository, "shared.txt"), "advanced\n", "utf8");
  await git(["add", "external.txt", "shared.txt"]);
  await git(["commit", "-m", "advance target"]);
  const advancedTarget = await git(["rev-parse", "HEAD"]);
  await git(["push", "origin", `${advancedTarget}:refs/heads/main`]);
  await git(["switch", "-c", "refreshed-member"]);
  await git(["cherry-pick", originalMember]);
  const refreshedMember = await git(["rev-parse", "HEAD"]);
  await git([
    "push",
    `--force-with-lease=refs/heads/delivery/member-1:${originalMember}`,
    "origin",
    `${refreshedMember}:refs/heads/delivery/member-1`,
  ]);
  await git(["switch", "feat/example"]);

  const coordinate = async (head: string) => ({ head, tree: await git(["rev-parse", `${head}^{tree}`]) });
  const rawExec: RawGitExec = async (args) => {
    const result = await execFileAsync("git", args, { cwd: repository, encoding: "buffer" });
    return { stdout: new Uint8Array(result.stdout), stderr: new Uint8Array(result.stderr) };
  };
  const gitExec: GitExec = async (command, args) => {
    const result = await execFileAsync(command, args, { cwd: repository });
    return { stdout: result.stdout, stderr: result.stderr };
  };
  const plan = deliveryStackPlanFixture();
  const state = deliveryStateFixture(plan);
  const value = DeliveryStateV1Schema.parse({
    ...state,
    target: { ref: "refs/heads/main", coordinates: await coordinate(base) },
    members: [
      {
        ...state.members[0],
        ref: "refs/heads/delivery/member-1",
        changeRequest: { providerId: "github", changeRequestId: "41" },
        coordinates: { base, ...await coordinate(originalMember) },
      },
      {
        ...state.members[1],
        ref: "refs/heads/feat/example",
        changeRequest: { providerId: "github", changeRequestId: "42" },
        coordinates: { base: originalMember, ...await coordinate(originalTop) },
      },
    ],
  });
  const facts = { target: value.target, members: value.members, landedDeliverableIds: [] };
  const subjectResult = deriveDeliveryProviderRefreshSubject({ plan, state: value, facts });
  if (subjectResult.status !== "derived") throw new Error("refresh subject fixture must derive");
  const subject = subjectResult.subject;
  const observeRemote = async (ref: string) => {
    const output = await git(["ls-remote", "--refs", "origin", ref]);
    const head = output.split(/\s+/u)[0];
    if (head === undefined || head === "") return null;
    await git(["fetch", "--no-write-fetch-head", "origin", head]);
    return coordinate(head);
  };
  const observeRefresh = () => observeDeliveryProviderRefresh({
    subject,
    repository: "owner/repo",
  }, {
    observeTarget: async (_repository, ref) => {
      const observed = await observeRemote(ref);
      return observed === null ? { status: "refused" as const } : { status: "observed" as const, coordinates: observed };
    },
    readAncestry: async (ancestor, descendant) => {
      try {
        await git(["merge-base", "--is-ancestor", ancestor, descendant]);
        return "ancestor" as const;
      } catch {
        return "not-ancestor" as const;
      }
    },
    observeRef: observeRemote,
    observeRequest: async (_repository, binding) => {
      const member = subject.before.members.find(
        (candidate) => candidate.changeRequest?.changeRequestId === binding.changeRequestId,
      );
      const observed = member?.ref === null || member?.ref === undefined ? null : await observeRemote(member.ref);
      return member?.ref === null || member?.ref === undefined || observed === null
        ? { status: "absent" as const }
        : {
            status: "observed" as const,
            request: {
              binding,
              repository: "owner/repo",
              headRepository: "owner/repo",
              headRef: member.ref.replace(/^refs\/heads\//u, ""),
              headSha: observed.head,
              baseRef: "main",
              state: "open" as const,
              draft: true,
            },
          };
    },
  });
  const proveMovement = async (movement: DeliveryProviderRefreshMovement) => {
    const before = movement.before.coordinates;
    const after = movement.after.coordinates;
    if (before === null || after === null) {
      return { status: "refused" as const, reason: "contribution-endpoints-unverified" as const };
    }
    return proveGitDeliveryContribution({
      exec: rawExec,
      before: {
        predecessor: await coordinate(before.base),
        member: { head: before.head, tree: before.tree },
      },
      after: {
        predecessor: await coordinate(after.base),
        member: { head: after.head, tree: after.tree },
      },
    });
  };
  return {
    repository,
    plan,
    initial: { revision: 7, value },
    facts,
    subject,
    originalTop,
    refreshedMember,
    advancedTarget,
    collisionHead,
    rawExec,
    gitExec,
    git,
    coordinate,
    observeRefresh,
    proveMovement,
  };
}

function revisionStore(initial: { readonly revision: number; readonly value: DeliveryStateV1 }) {
  let current = initial;
  return {
    current: () => current,
    store: {
      publish: async (_planId: string, value: DeliveryStateV1, expectedRevision: number) => {
        if (expectedRevision !== current.revision) {
          return { status: "refused" as const, reason: "version-conflict" as const };
        }
        current = { revision: current.revision + 1, value };
        return { status: "ok" as const, value: current };
      },
    },
  };
}

function refreshDependencies(fixture: RefreshFixture, stateStore: ReturnType<typeof revisionStore>["store"]) {
  return {
    observeResult: fixture.observeRefresh,
    readTargetAncestry: async (ancestor: string, descendant: string) => {
      const result = await readAncestry(fixture.gitExec, ancestor, descendant);
      return result === "ancestor" || result === "not-ancestor" ? result : null;
    },
    proveContribution: fixture.proveMovement,
    preflightTop: (input: {
      readonly topRef: string;
      readonly top: { readonly head: string; readonly tree: string };
    }) => preflightGitDeliveryChainAbsorption({ exec: fixture.rawExec, ...input }),
    absorbTop: (input: {
      readonly topRef: string;
      readonly top: { readonly head: string; readonly tree: string };
      readonly previousHighestMember: { readonly head: string; readonly tree: string };
      readonly highestMember: { readonly head: string; readonly tree: string };
    }) => absorbGitDeliveryChain({ exec: fixture.rawExec, ...input }),
    publishTop: (input: {
      readonly ref: string;
      readonly beforeHead: string;
      readonly requestedHead: string;
    }) => publishDeliveryTopRef({ exec: fixture.gitExec, remote: "origin", ...input }),
    rewriteLocalRef: (input: {
      readonly ref: string;
      readonly beforeHead: string;
      readonly requestedHead: string;
    }) => rewriteDeliveryLocalRef({ exec: fixture.gitExec, ...input }),
    stateStore,
  };
}

describe("member-six refresh adoption lifecycle", () => {
  it("reserves and lease-publishes a prepared provider-native refresh before settling the top", async () => {
    const fixture = await createRefreshFixture();
    const memberRef = fixture.subject.before.members[0]!.ref!;
    const originalMember = fixture.subject.before.members[0]!.coordinates!.head;
    const observed = await fixture.observeRefresh();
    if (observed.status !== "observed") throw new Error("prepared refresh observation must resolve");
    await fixture.git([
      "push",
      `--force-with-lease=${memberRef}:${fixture.refreshedMember}`,
      "origin",
      `${originalMember}:${memberRef}`,
    ]);
    const candidates = deriveDeliveryProviderRefreshCandidates({
      plan: fixture.plan,
      before: fixture.subject.before,
      requested: observed.observation.snapshot,
    });
    if (candidates.status !== "derived") throw new Error("refresh candidates must derive");
    for (const candidate of candidates.candidates) {
      await fixture.git(["update-ref", candidate.ref, candidate.head]);
    }
    const records = revisionStore(fixture.initial);
    const events: string[] = [];
    const result = await executeDeliveryProviderRefresh({
      plan: fixture.plan,
      current: fixture.initial,
      repository: "owner/repo",
      scope: { kind: "complete-remainder" },
      facts: fixture.facts,
    }, {
      preparation: { prepare: async () => ({
        status: "prepared",
        observation: observed.observation,
        candidates: candidates.candidates,
      }) },
      preflightTop: (input) => preflightGitDeliveryChainAbsorption({ exec: fixture.rawExec, ...input }),
      observePublishedHeads: async (snapshot) => Promise.all(snapshot.members.map(async (member) => {
        const output = await fixture.git(["ls-remote", "--refs", "origin", member.ref!]);
        return { deliverableId: member.deliverableId, head: output.split(/\s+/u)[0] ?? null };
      })),
      rewriteMemberRef: async (input) => {
        events.push("publish-member");
        return rewriteDeliveryMemberRef({ exec: fixture.gitExec, remote: "origin", ...input });
      },
      observeResult: fixture.observeRefresh,
      readTargetAncestry: async (ancestor, descendant) => {
        const result = await readAncestry(fixture.gitExec, ancestor, descendant);
        return result === "ancestor" || result === "not-ancestor" ? result : null;
      },
      proveContribution: fixture.proveMovement,
      absorbTop: async (input) => {
        events.push("absorb-top");
        return absorbGitDeliveryChain({ exec: fixture.rawExec, ...input });
      },
      publishTop: async (input) => {
        events.push("publish-top");
        return publishDeliveryTopRef({ exec: fixture.gitExec, remote: "origin", ...input });
      },
      rewriteLocalRef: (input) => rewriteDeliveryLocalRef({ exec: fixture.gitExec, ...input }),
      cleanupPreparedCandidates: async (prepared) => {
        for (const candidate of prepared) {
          await fixture.git(["update-ref", "-d", candidate.ref, candidate.head]);
        }
        events.push("cleanup");
        return { status: "cleaned" };
      },
      stateStore: records.store,
    });

    expect(result).toMatchObject({
      status: "applied",
      state: {
        value: {
          activeOperation: null,
          target: { coordinates: { head: fixture.advancedTarget } },
          members: [
            { coordinates: { head: fixture.refreshedMember } },
            { coordinates: { base: fixture.refreshedMember } },
          ],
        },
      },
    });
    expect(events).toEqual(["publish-member", "absorb-top", "publish-top", "cleanup"]);
    for (const candidate of candidates.candidates) {
      await expect(fixture.git(["rev-parse", "--verify", candidate.ref])).rejects.toThrow();
    }
  });

  for (const crashBoundary of ["local-merge", "remote-publication"] as const) {
    it(`recovers ${crashBoundary} interruption through the exact adoption selector`, async () => {
      const fixture = await createRefreshFixture();
      const records = revisionStore(fixture.initial);
      const dependencies = refreshDependencies(fixture, records.store);
      await expect(adoptExternalDeliverySuffixRefresh({
        plan: fixture.plan,
        current: fixture.initial,
        affectedDeliverableIds: fixture.subject.affectedDeliverableIds,
        ...dependencies,
        absorbTop: crashBoundary === "local-merge"
          ? async (input) => {
              await dependencies.absorbTop(input);
              throw new Error("crash after local merge");
            }
          : dependencies.absorbTop,
        publishTop: crashBoundary === "remote-publication"
          ? async (input) => {
              await dependencies.publishTop(input);
              throw new Error("crash after remote publication");
            }
          : dependencies.publishTop,
      })).rejects.toThrow(`crash after ${crashBoundary === "local-merge" ? "local merge" : "remote publication"}`);

      const interrupted = records.current();
      expect(interrupted.value.activeOperation).toMatchObject({ kind: "rewrite", mode: "provider-adoption" });
      const recovery = await reconcileDeliveryExecution({
        planId: fixture.plan.planId,
        current: interrupted,
        observation: {
          observe: async () => ({
            status: "observed" as const,
            value: interrupted.value.activeOperation!.before,
          }),
        },
        stateStore: records.store,
      });
      expect(recovery).toMatchObject({
        status: "retryable",
        transition: "preserved",
        action: "delivery-refresh-adopt",
        selector: {
          operationId: interrupted.value.activeOperation!.operationId,
          operationKind: "rewrite",
          mode: "provider-adoption",
        },
      });

      let output = "";
      await handleDeliveryExecution("refresh-adopt", { input: "-", json: true }, undefined, {
        readText: async () => JSON.stringify({
          planId: fixture.plan.planId,
          repository: "owner/repo",
          remote: "origin",
          operationId: interrupted.value.activeOperation!.operationId,
        }),
        execute: async (_command, request) => {
          const operationId = (request as { readonly operationId?: string }).operationId;
          if (operationId !== interrupted.value.activeOperation!.operationId) {
            return { status: "refused", reason: "operation-mismatch" };
          }
          return settleReservedDeliverySuffixRefresh({
            plan: fixture.plan,
            current: records.current(),
            ...dependencies,
          });
        },
        write: (text) => { output = text; },
        setExitCode: () => { throw new Error("successful recovery must not set a failure exit code"); },
      });
      const result = JSON.parse(output) as {
        readonly status: string;
        readonly state?: { readonly revision: number; readonly value: DeliveryStateV1 };
      };
      expect(result.status).toBe("applied");
      expect(result.state).toEqual(records.current());
      expect(records.current()).toMatchObject({
        revision: 9,
        value: {
          target: { coordinates: { head: fixture.advancedTarget } },
          activeOperation: null,
          members: [
            { coordinates: { head: fixture.refreshedMember } },
            { coordinates: { base: fixture.refreshedMember } },
          ],
        },
      });
      const terminalHead = records.current().value.members.at(-1)!.coordinates!.head;
      expect(await fixture.git(["ls-remote", "--refs", "origin", "refs/heads/feat/example"]))
        .toContain(terminalHead);
      expect((await fixture.git(["rev-list", "--parents", "-n", "1", terminalHead])).split(" "))
        .toEqual([terminalHead, fixture.originalTop, fixture.refreshedMember]);
    });
  }

  for (const refusal of ["content-conflict", "top-collision"] as const) {
    it(`retains the settlement reservation on ${refusal}`, async () => {
      const fixture = await createRefreshFixture({ conflict: refusal === "content-conflict" });
      const records = revisionStore(fixture.initial);
      const dependencies = refreshDependencies(fixture, records.store);
      const result = await adoptExternalDeliverySuffixRefresh({
        plan: fixture.plan,
        current: fixture.initial,
        affectedDeliverableIds: fixture.subject.affectedDeliverableIds,
        ...dependencies,
        publishTop: refusal === "top-collision"
          ? async (input) => {
              await fixture.git(["push", "origin", `${fixture.collisionHead}:refs/heads/feat/example`]);
              return dependencies.publishTop(input);
            }
          : dependencies.publishTop,
      });
      expect(result).toMatchObject(refusal === "content-conflict"
        ? { status: "blocked", reason: "content-conflict", paths: ["shared.txt"] }
        : { status: "blocked", reason: "top-publish-collision" });
      expect(records.current()).toMatchObject({
        revision: 8,
        value: {
          target: fixture.initial.value.target,
          activeOperation: { kind: "rewrite", mode: "provider-adoption" },
          members: [
            { coordinates: fixture.initial.value.members[0]!.coordinates },
            { coordinates: fixture.initial.value.members[1]!.coordinates },
          ],
        },
      });
      const remoteTop = await fixture.git(["ls-remote", "--refs", "origin", "refs/heads/feat/example"]);
      expect(remoteTop).toContain(refusal === "top-collision" ? fixture.collisionHead : fixture.originalTop);
    });
  }
});

function deliveryFacts(state: DeliveryStateV1): DeliveryPositionFactsV1 {
  return {
    target: state.target,
    members: state.members.map(({ deliverableId, ref, changeRequest, coordinates }) => ({
      deliverableId,
      ref,
      changeRequest,
      coordinates,
    })),
    landedDeliverableIds: [],
  };
}

describe("member-six semantic native fallback lifecycle", () => {
  it("clears exact sequential no-effect and selects the canonical registered remainder", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const initial = DeliveryStateV1Schema.parse({
      ...deliveryStateFixture(plan),
      members: deliveryStateFixture(plan).members.map((member, index) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(41 + index) },
      })),
    });
    const member = initial.members[0]!;
    const mergePolicy = {
      repository: "owner/repo",
      stackPosition: "intermediate" as const,
      method: "merge" as const,
      allowedMethods: ["merge"] as Array<"merge" | "rebase" | "squash">,
      policyFingerprint: `sha256:${"a".repeat(64)}`,
    };
    const exactRequest = async () => ({
      status: "observed" as const,
      request: {
        binding: member.changeRequest!,
        repository: "owner/repo",
        headRepository: "owner/repo",
        headRef: member.ref!.replace(/^refs\/heads\//u, ""),
        headSha: member.coordinates!.head,
        baseRef: "delivery-target",
        state: "open" as const,
        draft: true,
      },
    });
    const host = {
      observeRequest: async () => ({ status: "absent" as const }),
      openRequest: async () => ({ status: "submitted" as const }),
      readRequest: exactRequest,
      mergeRequest: async () => ({ status: "refused" as const, reason: "native-stack-required" as const }),
      observeTarget: async () => ({ status: "observed" as const, coordinates: initial.target!.coordinates! }),
    };
    const readiness = {
      assess: async () => ({ status: "ready" as const, settledReviewState: "settled" }),
    };
    const preparedRecords = revisionStore({ revision: 7, value: initial });
    const prepared = await prepareDeliveryLanding({
      plan,
      current: preparedRecords.current(),
      facts: deliveryFacts(initial),
      selectedDeliverableId: member.deliverableId,
      repository: "owner/repo",
      baseRef: "refs/heads/delivery-target",
      targetRef: "refs/heads/delivery-target",
      mergePolicy,
      releaseMergeLock: false,
      stateStore: preparedRecords.store,
      host,
      readiness,
    });
    if (prepared.status !== "prepared") throw new Error("sequential landing fixture must prepare");
    const reserved = preparedRecords.current();
    const clearedRecords = revisionStore(reserved);
    const observation = {
      revalidateMergePolicy: async () => ({ status: "exact" as const }),
      observeSelection: async () => ({
        status: "observed" as const,
        facts: deliveryFacts(initial),
        snapshot: { target: initial.target, members: [member] },
      }),
      observeLandedResult: async () => null,
      proveLandedContribution: async () => ({ status: "accepted" as const, proof: "tree-equality" as const }),
    };

    let applyOutput = "";
    await handleDeliveryExecution("land-apply", { input: "-", json: true }, undefined, {
      readText: async () => JSON.stringify({
        planId: plan.planId,
        approved: prepared.presentation,
        remote: "origin",
        treeRoot: ".",
      }),
      execute: async () => applyDeliveryLanding({
        plan,
        current: reserved,
        approved: prepared.presentation,
        stateStore: clearedRecords.store,
        host,
        readiness,
        lock: { release: async () => ({ status: "not-configured" as const }) },
        observation,
      }),
      write: (text) => { applyOutput = text; },
      setExitCode: () => { throw new Error("semantic refusal transition must remain executable"); },
    });
    const transition = JSON.parse(applyOutput) as {
      readonly status: string;
      readonly action?: string;
      readonly transition?: string;
    };
    expect(transition).toMatchObject({
      status: "retryable",
      transition: "cleared",
      action: "delivery-native-land-select",
    });
    expect(transition.action).not.toBe("delivery-refresh-adopt");
    expect(clearedRecords.current().value.activeOperation).toBeNull();

    let selectionOutput = "";
    const selectRequest = {
      planId: plan.planId,
      repository: "owner/repo",
      remote: "origin",
      mergeAction: "direct",
      explicitAtomic: true,
    } as const;
    let executedRequest: unknown;
    await handleDeliveryExecution("native-land-select", { input: "-", json: true }, undefined, {
      readText: async () => JSON.stringify(selectRequest),
      execute: async (_command, request) => {
        executedRequest = request;
        const parsed = request as typeof selectRequest;
        const position = deriveDeliveryPosition(
          plan,
          clearedRecords.current().value,
          deliveryFacts(clearedRecords.current().value),
        );
        if (position.status !== "derived") return { status: "blocked", reason: position.reason };
        const firstRemaining = plan.members[position.position.landedPrefix.length];
        if (firstRemaining === undefined) return { status: "blocked", reason: "member-set-mismatch" };
        const chain = deriveNativeDeliveryRegisteredRemainder({
          plan,
          state: clearedRecords.current().value,
          firstDeliverableId: firstRemaining.deliverableId,
          repository: parsed.repository,
          baseRef: "delivery-target",
        });
        if (chain.status !== "derived") return { status: "blocked", reason: chain.reason };
        return selectNativeDeliveryLandingArm({
          plan,
          landedPrefix: position.position.landedPrefix,
          observation: { status: "registered", stackNumber: 7 },
          mergeStrategy: "merge",
          mergeAction: parsed.mergeAction,
          explicitAtomic: parsed.explicitAtomic,
          members: chain.members.map(({ deliverableId, changeRequestId, headSha }) => ({
            deliverableId,
            changeRequestId,
            headSha,
          })),
        });
      },
      write: (text) => { selectionOutput = text; },
      setExitCode: () => { throw new Error("canonical registered remainder must select a native arm"); },
    });
    expect(executedRequest).toEqual(selectRequest);
    expect(Object.hasOwn(executedRequest as object, "members")).toBe(false);
    expect(Object.hasOwn(executedRequest as object, "facts")).toBe(false);
    expect(JSON.parse(selectionOutput)).toMatchObject({
      status: "selected",
      arm: "linked-atomic",
      members: plan.members.slice(0, -1).map((planned) => ({ deliverableId: planned.deliverableId })),
    });
  });
});
