/** Cross-service rehearsal of an eight-member delivery's remaining integration boundaries. */

import { describe, expect, it } from "vitest";

import { closeoutCompletedDelivery } from "../../src/lib/delivery/closeout.js";
import {
  deriveNativeDeliveryRegisteredRemainder,
  prepareNativeDeliveryLanding,
  selectNativeDeliveryLandingArm,
} from "../../src/lib/delivery/native-landing.js";
import { routeDeliveryPosition, type DeliveryPositionFactsV1 } from "../../src/lib/delivery/position.js";
import { deriveDeliveryResidueLocators } from "../../src/lib/delivery/residue-reaping.js";
import { DeliveryStateV1Schema, type DeliveryStateV1 } from "../../src/lib/delivery/schema.js";
import { teardownLandedDeliveryMember } from "../../src/lib/delivery/teardown.js";
import {
  assessDeliveryTerminalTop,
  rebindDeliveryTerminalCoordinates,
} from "../../src/lib/delivery/terminal-integration.js";
import { canonicalDigest, type CanonicalDigest } from "../../src/lib/kernel/index.js";
import {
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
} from "../../src/lib/work-unit/candidate-attestation.js";
import { createReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  composeDeliveryReviewObligation,
  resolveReviewStatus,
} from "../../src/scripts/review-gate/status.js";
import { deliveryEightMemberStackPlanFixture } from "../fixtures/delivery-plan.js";

const oid = (character: string): string => character.repeat(40);

function positionFacts(
  state: DeliveryStateV1,
  landedDeliverableIds: readonly CanonicalDigest[],
): DeliveryPositionFactsV1 {
  return {
    target: state.target,
    members: state.members.map(({ deliverableId, ref, changeRequest, coordinates }) => ({
      deliverableId,
      ref,
      changeRequest,
      coordinates,
    })),
    landedDeliverableIds: [...landedDeliverableIds],
  };
}

describe("eight-member delivery integration rehearsal", () => {
  it("reaches review, native landing, teardown, terminal, and closeout boundaries without shape drift", async () => {
    const plan = deliveryEightMemberStackPlanFixture();
    const target = { head: oid("1"), tree: oid("a") };
    const memberHeads = ["2", "3", "4", "5", "6", "7", "8", "9"].map(oid);
    const memberTrees = ["b", "c", "d", "e", "f", "a", "b", "c"].map(oid);
    const initial = DeliveryStateV1Schema.parse({
      schemaVersion: 1,
      semanticsVersion: "delivery-state/v1",
      planId: plan.planId,
      workUnitId: plan.workUnitId,
      boundPlan: { planRevision: plan.planRevision, planDigest: plan.planDigest },
      target: { ref: "refs/heads/main", coordinates: target },
      members: plan.members.map((member, index) => ({
        deliverableId: member.deliverableId,
        ref: index === plan.members.length - 1
          ? "refs/heads/feat/example"
          : `refs/heads/delivery/${plan.workUnitId}/${member.chunkKey}`,
        changeRequest: { providerId: "github", changeRequestId: String(401 + index) },
        coordinates: {
          base: index === 0 ? target.head : memberHeads[index - 1],
          head: memberHeads[index],
          tree: memberTrees[index],
        },
      })),
      activeOperation: null,
      pendingReviewFixVerification: null,
    });
    const subject = createCandidateSubjectSnapshot([{
      path: "feature.ts",
      digest: canonicalDigest({ content: "candidate" }),
      mode: "100644",
      treatment: "reviewable",
    }]);
    const candidateHead = oid("d");
    const record = {
      schemaVersion: 1 as const,
      semanticsVersion: "candidate-attestation/v1" as const,
      attestation: createCandidateAttestation({
        workUnit: plan.workUnitId,
        subject,
        baseRevision: candidateHead,
        attestedBy: "reviewer",
        attestedAt: "2026-08-27T12:00:00.000Z",
        verificationEvidenceRef: "verification://candidate",
      }),
      subject,
      transitions: [],
      lineageAttestations: [],
    };
    const candidate = {
      schemaVersion: 1 as const,
      mode: "candidate-effective-target" as const,
      state: "current" as const,
      nextAction: "continue" as const,
      candidateId: record.attestation.candidateId,
      durableBaselineTarget: { revision: candidateHead, subject },
      recognizedTarget: { revision: candidateHead, subject },
      recognition: { kind: "durable" as const },
      implementationChanged: false,
      convergenceVerification: "satisfied" as const,
      convergenceScope: null,
    };
    const predecessor = initial.members.at(-2)!;
    const terminal = initial.members.at(-1)!;
    const terminalCoordinates = {
      base: predecessor.coordinates!.head,
      head: candidateHead,
      tree: oid("e"),
    };
    const rebound = rebindDeliveryTerminalCoordinates({
      plan,
      state: initial,
      candidate,
      publication: {
        settled: true,
        candidateId: candidate.candidateId,
        candidateSubjectDigest: candidate.recognizedTarget.subject.subjectDigest,
      },
      repository: "owner/repo",
      protectedTargetRef: initial.target!.ref,
      request: {
        binding: terminal.changeRequest!,
        repository: "owner/repo",
        headRepository: "owner/repo",
        headRef: "feat/example",
        headSha: candidateHead,
        baseRef: predecessor.ref!.replace(/^refs\/heads\//u, ""),
        state: "open",
      },
      coordinates: terminalCoordinates,
    });
    expect(rebound).toMatchObject({ status: "rebound", nextAction: "rerun-checkpoint" });
    if (rebound.status !== "rebound") throw new Error("terminal rebind must succeed");
    const state = rebound.state;

    expect(routeDeliveryPosition(plan, state, positionFacts(state, []))).toMatchObject({
      status: "position",
      nextAction: "review-member",
      selectedDeliverableId: plan.members[0]!.deliverableId,
    });

    const targets = state.members.map((member, index) => ({
      repository: "owner/repo",
      pullRequest: 401 + index,
      headSha: member.coordinates!.head,
      position: index + 1,
      memberCount: state.members.length,
      chunkKey: plan.members[index]!.chunkKey,
      title: plan.members[index]!.title,
      vehicle: {
        kind: "delivery-member" as const,
        planId: plan.planId,
        deliverableId: member.deliverableId,
        workUnitId: plan.workUnitId,
        head: member.coordinates!.head,
      },
    }));
    const responseTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "delivery-member",
      repositoryId: "repository-1",
      baseRef: "main",
      diffBaseSha: target.head,
      diffBaseTree: target.tree,
      headSha: targets[0]!.headSha,
      headTree: state.members[0]!.coordinates!.tree,
    });
    const responsePlan = {
      schemaVersion: 1 as const,
      target: responseTarget,
      source: {
        kind: "hosted" as const,
        attemptRef: "arc-review-source:v1:hosted:lane-progress%2Fretained:hosted%2Fretained",
      },
      findings: [{
        findingId: "retained-finding",
        severity: "major" as const,
        locus: "src/example.ts:1",
        evidenceUrlOrId: "https://example.test/retained-finding",
        sourceOrdinal: 1,
      }],
    };
    const outstanding = composeDeliveryReviewObligation({
      targets,
      discharges: targets.map((_, index) => ({
        completedPasses: 0,
        completePasses: 0,
        passCeiling: 2,
        attemptHistory: [],
        ...(index === 0
        ? {
            discharged: false,
            detail: "Retained findings await disposition.",
            nextSource: null,
            responsePlan,
          }
        : { discharged: false, detail: "Review is pending.", nextSource: "coderabbit-pr" }),
      })),
    });
    const statusTarget = {
      repository: "owner/repo",
      headRef: "delivery/member-1",
      headSha: targets[0]!.headSha,
    };
    await expect(resolveReviewStatus({ target: statusTarget }, {
      observe: async () => ({
        actualHeadSha: statusTarget.headSha,
        requiredChecks: "green",
        routedObligation: outstanding,
        currentBaseOid: target.head,
        baseContained: true,
      }),
    })).resolves.toMatchObject({
      state: "review-required",
      nextAction: "respond-to-findings",
      responsePlan,
    });

    const settled = composeDeliveryReviewObligation({
      targets,
      discharges: targets.map(() => ({
        discharged: true,
        detail: "Hosted source is settled.",
        nextSource: null,
        completedPasses: 1,
        completePasses: 1,
        passCeiling: 2,
        attemptHistory: [],
      })),
    });
    await expect(resolveReviewStatus({ target: statusTarget }, {
      observe: async () => ({
        actualHeadSha: statusTarget.headSha,
        requiredChecks: "green",
        routedObligation: settled,
        currentBaseOid: target.head,
        baseContained: true,
      }),
    })).resolves.toMatchObject({ state: "settled", nextAction: "continue-reconcile" });

    const registered = deriveNativeDeliveryRegisteredRemainder({
      plan,
      state,
      firstDeliverableId: plan.members[0]!.deliverableId,
      repository: "owner/repo",
      baseRef: "main",
    });
    expect(registered.status).toBe("derived");
    if (registered.status !== "derived") throw new Error("registered remainder must derive");
    const selection = selectNativeDeliveryLandingArm({
      plan,
      landedPrefix: [],
      observation: { status: "registered", stackNumber: 17 },
      mergeStrategy: "merge",
      mergeAction: "direct",
      explicitAtomic: true,
      members: registered.members.map(({ deliverableId, changeRequestId, headSha }) => ({
        deliverableId,
        changeRequestId,
        headSha,
      })),
    });
    expect(selection).toMatchObject({
      status: "selected",
      arm: "linked-atomic",
      members: plan.members.slice(0, -1).map(({ deliverableId }) => ({ deliverableId })),
    });
    if (selection.status !== "selected") throw new Error("native arm must select");
    await expect(prepareNativeDeliveryLanding(selection, {
      readiness: async () => ({ status: "ready" }),
    })).resolves.toMatchObject({ status: "prepared", members: selection.members });

    let persisted: { revision: number; value: DeliveryStateV1 } | null = { revision: 1, value: state };
    const localRefs = new Map(state.members.slice(0, -1).map((member) => [
      member.ref!, member.coordinates!.head,
    ]));
    const remoteRefs = new Map(localRefs);
    const stateStore = {
      publish: async (_planId: string, value: DeliveryStateV1, expectedRevision: number) => {
        if (persisted === null || expectedRevision !== persisted.revision) {
          return { status: "refused" as const, reason: "version-conflict" as const };
        }
        persisted = { revision: expectedRevision + 1, value };
        return { status: "ok" as const, value: persisted };
      },
    };
    let terminalBaseRef = predecessor.ref!.replace(/^refs\/heads\//u, "");
    const host = {
      readRequest: async (_repository: string, binding: { providerId: string; changeRequestId: string }) => {
        const member = state.members.find((candidateMember) => (
          candidateMember.changeRequest?.providerId === binding.providerId
          && candidateMember.changeRequest.changeRequestId === binding.changeRequestId
        ));
        if (member?.ref === null || member?.ref === undefined || member.coordinates === null) {
          return { status: "absent" as const };
        }
        const isTerminal = member.deliverableId === terminal.deliverableId;
        return {
          status: "observed" as const,
          request: {
            binding,
            repository: "owner/repo",
            headRepository: "owner/repo",
            headRef: member.ref.replace(/^refs\/heads\//u, ""),
            headSha: member.coordinates.head,
            baseRef: isTerminal ? terminalBaseRef : "main",
            state: isTerminal ? "open" as const : "merged" as const,
            draft: false,
            ...(isTerminal ? {} : { mergeCommitSha: member.coordinates.head }),
          },
        };
      },
      applyTopRemedy: async () => {
        terminalBaseRef = "main";
        return { status: "submitted" as const };
      },
    };
    for (const [index, member] of state.members.slice(0, -1).entries()) {
      const current = persisted;
      if (current === null) throw new Error("teardown state disappeared before closeout");
      const teardown = await teardownLandedDeliveryMember({
        plan,
        current,
        facts: positionFacts(state, plan.members.slice(0, index + 1).map(({ deliverableId }) => deliverableId)),
        deliverableId: member.deliverableId,
        repository: "owner/repo",
        protectedTargetRef: "refs/heads/main",
        host,
        deleteLocalRef: async ({ ref, expectedHead }) => {
          if (localRefs.get(ref) !== expectedHead) return { status: "refused" as const };
          localRefs.delete(ref);
          return { status: "deleted" as const };
        },
        deleteRemoteRef: async ({ ref, expectedHead }) => {
          if (remoteRefs.get(ref) !== expectedHead) return { status: "refused" as const };
          remoteRefs.delete(ref);
          return { status: "deleted" as const };
        },
        stateStore,
      });
      expect(teardown).toMatchObject(index === state.members.length - 2
        ? { status: "torn-down", nextAction: "terminal-checkpoint" }
        : { status: "torn-down", nextAction: "continue" });
    }
    expect({ localRefs: [...localRefs], remoteRefs: [...remoteRefs] })
      .toEqual({ localRefs: [], remoteRefs: [] });
    terminalBaseRef = "main";
    expect(assessDeliveryTerminalTop({
      terminal: true,
      protectedBaseRef: "refs/heads/main",
      publicationHead: terminalCoordinates.head,
      request: {
        binding: terminal.changeRequest!,
        repository: "owner/repo",
        headRef: "feat/example",
        headSha: terminalCoordinates.head,
        baseRef: terminalBaseRef,
        state: "open",
      },
    })).toMatchObject({ status: "ready" });

    const locators = deriveDeliveryResidueLocators(plan, "/repo/.git");
    if (locators.status !== "derived") throw new Error("closeout locators must derive");
    const candidateHeads = new Map(locators.locators.map((locator, index) => [
      locator.candidateRef,
      state.members[index]!.coordinates!.head,
    ]));
    const gateHeads = new Map(locators.locators.map((locator, index) => [
      locator.gatePath,
      state.members[index]!.coordinates!.head,
    ]));
    const plans = new Map([[plan.planId, plan]]);
    const closed = await closeoutCompletedDelivery({
      workUnitId: plan.workUnitId,
      repository: "owner/repo",
      remote: "origin",
    }, {
      planStore: {
        enumerateCurrent: async () => ({ status: "ok", value: [...plans.values()] }),
        removeCurrent: async (planId, expectedDigest) => {
          const current = plans.get(planId);
          if (current?.planDigest !== expectedDigest) return { status: "refused", reason: "version-conflict" };
          plans.delete(planId);
          return { status: "ok", value: { removed: true } };
        },
      },
      stateStore: {
        read: async () => ({ status: "ok", value: persisted }),
        publish: stateStore.publish,
        remove: async (_planId, expectedRevision) => {
          if (persisted === null) return { status: "ok", value: { removed: false } };
          if (expectedRevision !== persisted.revision) return { status: "refused", reason: "version-conflict" };
          persisted = null;
          return { status: "ok", value: { removed: true } };
        },
      },
      gitCommonDir: "/repo/.git",
      renameAuthority: { status: "established", ref: "refs/heads/main" },
      renameTransitionSource: { enumerate: async () => ({ status: "ok", value: [] }) },
      residue: {
        observeRefreshCandidates: async () => ({ status: "observed", candidates: [] }),
        observeCandidate: async (ref) => candidateHeads.has(ref)
          ? { status: "observed", head: candidateHeads.get(ref)! }
          : { status: "absent" },
        observeGate: async (path) => gateHeads.has(path)
          ? { status: "observed", head: gateHeads.get(path)! }
          : { status: "absent" },
        deleteCandidate: async ({ ref, expectedHead }) => {
          if (candidateHeads.get(ref) !== expectedHead) return { status: "refused" };
          candidateHeads.delete(ref);
          return { status: "deleted" };
        },
        deleteRefreshCandidate: async () => ({ status: "adopted" }),
        removeGate: async ({ path, expectedHead }) => {
          if (gateHeads.get(path) !== expectedHead) return { status: "refused" };
          gateHeads.delete(path);
          return { status: "removed" };
        },
        deleteLocalMember: async ({ ref }) => localRefs.has(ref)
          ? { status: "refused" }
          : { status: "adopted" },
        deleteRemoteMember: async ({ ref }) => remoteRefs.has(ref)
          ? { status: "refused" }
          : { status: "adopted" },
      },
      retirement: {
        observeLocalRef: async () => ({ status: "absent" }),
        observeRemoteRef: async () => ({ status: "absent" }),
        // The rehearsal binds the terminal to one exact head, so identity is the only relation it
        // models; a distinct pair is one this rehearsal establishes nothing about.
        readAncestry: async (ancestor, descendant) => ancestor === descendant ? "ancestor" : "not-ancestor",
        readTerminalRequest: async () => ({
          status: "observed",
          request: {
            binding: terminal.changeRequest!,
            repository: "owner/repo",
            headRepository: "owner/repo",
            headRef: "feat/example",
            headSha: terminalCoordinates.head,
            baseRef: "main",
            state: "merged",
            draft: false,
            mergeCommitSha: terminalCoordinates.head,
          },
        }),
      },
    });
    expect(closed).toMatchObject({ status: "closed-out", planIds: [plan.planId] });
    expect({
      plans: plans.size,
      state: persisted,
      localRefs: [...localRefs],
      remoteRefs: [...remoteRefs],
      candidates: candidateHeads.size,
      gates: gateHeads.size,
    }).toEqual({ plans: 0, state: null, localRefs: [], remoteRefs: [], candidates: 0, gates: 0 });
  });
});
