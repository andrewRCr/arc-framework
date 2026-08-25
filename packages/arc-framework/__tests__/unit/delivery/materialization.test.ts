import { describe, expect, it } from "vitest";

import {
  bindInitialDeliveryRef,
  bindInitialDeliveryRequest,
  deriveDeliveryMaterialization,
  describeDeliveryMemberPresentation,
  materializeBoundDeliveryChain,
  publishDeliveryRequests,
  resolveDeliveryMemberPresentations,
  resolveDeliveryPublicationPresentations,
} from "../../../src/lib/delivery/materialization.js";
import type { DeliveryStateV1 } from "../../../src/lib/delivery/schema.js";
import {
  deliveryPlanFixture,
  deliverySingleMemberStackPlanFixture,
  deliveryThreeMemberStackPlanFixture,
} from "../../fixtures/delivery-plan.js";

const protectedHead = "1".repeat(40);
const protectedTree = "2".repeat(40);
const firstHead = "3".repeat(40);
const firstTree = "4".repeat(40);
const topHead = "5".repeat(40);
const topTree = "6".repeat(40);

function eligible(plan = deliveryPlanFixture()) {
  return {
    planId: plan.planId,
    workUnitId: plan.workUnitId,
    planRevision: plan.planRevision,
    planDigest: plan.planDigest,
    protectedBase: { ref: "refs/heads/main", head: protectedHead, tree: protectedTree },
    top: { ref: "refs/heads/feat/example", head: topHead, tree: topTree },
    members: plan.members.map((member, index) => ({
      deliverableId: member.deliverableId,
      ref: `refs/heads/candidate-${index + 1}`,
      head: index === 0 ? firstHead : topHead,
      tree: index === 0 ? firstTree : topTree,
    })),
    lifecyclePaths: [],
  };
}

function memoryStateStore() {
  let record: { revision: number; value: DeliveryStateV1 } | null = null;
  return {
    read: async () => ({ status: "ok" as const, value: record }),
    publish: async (_planId: string, value: DeliveryStateV1, expectedRevision: number) => {
      if (record?.revision !== expectedRevision && !(record === null && expectedRevision === 0)) {
        return { status: "refused" as const, reason: "version-conflict" as const };
      }
      record = { revision: expectedRevision + 1, value };
      return { status: "ok" as const, value: record };
    },
  };
}

describe("deriveDeliveryMaterialization", () => {
  it("derives ordered member refs and binds the terminal to the originating top ref", () => {
    const plan = deliveryPlanFixture();
    const result = deriveDeliveryMaterialization(plan, eligible(plan));
    expect(result.status).toBe("derived");
    if (result.status !== "derived") return;
    expect(result.value.members).toEqual([
      expect.objectContaining({
        deliverableId: plan.members[0]!.deliverableId,
        ref: `refs/heads/delivery/${plan.workUnitId}/${plan.members[0]!.chunkKey}`,
        requestBaseRef: "refs/heads/main",
        coordinates: { base: protectedHead, head: firstHead, tree: firstTree },
      }),
      expect.objectContaining({
        deliverableId: plan.members[1]!.deliverableId,
        ref: "refs/heads/feat/example",
        requestBaseRef: `refs/heads/delivery/${plan.workUnitId}/${plan.members[0]!.chunkKey}`,
        coordinates: { base: firstHead, head: topHead, tree: topTree },
      }),
    ]);
    expect(deriveDeliveryMaterialization(plan, { ...eligible(plan), planDigest: "sha256:" + "0".repeat(64) }))
      .toEqual({ status: "refused", reason: "snapshot-mismatch" });
  });

  it("bases each higher non-terminal request on its predecessor's delivery ref", () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const secondHead = "7".repeat(40);
    const secondTree = "8".repeat(40);
    const snapshot = {
      ...eligible(plan),
      members: plan.members.map((member, index) => ({
        deliverableId: member.deliverableId,
        ref: `refs/heads/candidate-${index + 1}`,
        head: [firstHead, secondHead, topHead][index]!,
        tree: [firstTree, secondTree, topTree][index]!,
      })),
    };
    const result = deriveDeliveryMaterialization(plan, snapshot);
    expect(result.status).toBe("derived");
    if (result.status !== "derived") return;
    expect(result.value.members).toEqual([
      expect.objectContaining({
        ref: `refs/heads/delivery/${plan.workUnitId}/${plan.members[0]!.chunkKey}`,
        requestBaseRef: "refs/heads/main",
        coordinates: { base: protectedHead, head: firstHead, tree: firstTree },
      }),
      expect.objectContaining({
        ref: `refs/heads/delivery/${plan.workUnitId}/${plan.members[1]!.chunkKey}`,
        requestBaseRef: `refs/heads/delivery/${plan.workUnitId}/${plan.members[0]!.chunkKey}`,
        coordinates: { base: firstHead, head: secondHead, tree: secondTree },
      }),
      expect.objectContaining({
        ref: "refs/heads/feat/example",
        requestBaseRef: `refs/heads/delivery/${plan.workUnitId}/${plan.members[1]!.chunkKey}`,
        coordinates: { base: secondHead, head: topHead, tree: topTree },
      }),
    ]);
  });

  it("bases a one-member terminal request directly on the protected branch", () => {
    const plan = deliverySingleMemberStackPlanFixture();
    const result = deriveDeliveryMaterialization(plan, eligible(plan));
    expect(result).toMatchObject({
      status: "derived",
      value: {
        members: [{
          kind: "terminal",
          ref: "refs/heads/feat/example",
          requestBaseRef: "refs/heads/main",
          coordinates: { base: protectedHead, head: topHead, tree: topTree },
        }],
      },
    });
  });
});

describe("describeDeliveryMemberPresentation", () => {
  it("combines the deterministic member title with authored reviewer context", () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const second = plan.members[1]!;
    expect(describeDeliveryMemberPresentation(
      plan,
      { deliverableId: second.deliverableId, chunkKey: second.chunkKey },
      {
        deliverableId: second.deliverableId,
        summary: "Makes the remaining delivery suffix safe to rebuild after an interrupted landing.",
        changes: [
          { topic: "Reconciliation", description: "Reobserves the landed prefix before rebuilding the suffix." },
          { topic: "Recovery", description: "Retains a retryable operation when provider evidence is incomplete." },
        ],
        designReference: "spec-example.md",
      },
    ))
      .toEqual({
        title: `${plan.workUnitId} [2/3]: ${second.title}`,
        body: [
          "**Design:** `spec-example.md`",
          "",
          "## Summary",
          "",
          "Makes the remaining delivery suffix safe to rebuild after an interrupted landing.",
          "",
          "## Changes",
          "",
          "- _Reconciliation_ — Reobserves the landed prefix before rebuilding the suffix.",
          "",
          "- _Recovery_ — Retains a retryable operation when provider evidence is incomplete.",
        ].join("\n"),
      });
  });

  it("omits content-gated sections and rejects a member outside the plan", () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const first = plan.members[0]!;
    expect(describeDeliveryMemberPresentation(
      plan,
      { deliverableId: first.deliverableId, chunkKey: first.chunkKey },
      { deliverableId: first.deliverableId, summary: "Establishes the boundary for choosing stacked delivery." },
    )).toEqual({
      title: `${plan.workUnitId} [1/3]: ${first.title}`,
      body: [
        "## Summary",
        "",
        "Establishes the boundary for choosing stacked delivery.",
      ].join("\n"),
    });
    expect(() => describeDeliveryMemberPresentation(
      plan,
      { deliverableId: "missing", chunkKey: "orphan" },
      { deliverableId: "missing", summary: "Orphaned presentation." },
    )).toThrow(/outside the delivery plan/u);
  });

  it("requires exact authored coverage of every non-terminal plan member", () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const presentations = plan.members.slice(0, -1).map((member) => ({
      deliverableId: member.deliverableId,
      summary: `Review ${member.title}.`,
    }));
    expect(resolveDeliveryMemberPresentations(plan, presentations)).toMatchObject({ status: "resolved" });

    for (const invalid of [
      presentations.slice(0, 1),
      [presentations[0]!, presentations[0]!],
      [...presentations, { deliverableId: plan.members.at(-1)!.deliverableId, summary: "Terminal." }],
      [presentations[0]!, { deliverableId: "foreign", summary: "Foreign." }],
    ]) {
      expect(resolveDeliveryMemberPresentations(plan, invalid))
        .toEqual({ status: "refused", reason: "presentation-mismatch" });
    }
  });

  it("refuses an invalid effective member request presentation", () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const first = plan.members[0]!;
    const malformed = {
      ...plan,
      members: plan.members.map((member, index) => index === 0
        ? { ...member, title: "Member title\nwith a second line" }
        : member),
    };

    expect(resolveDeliveryMemberPresentations(malformed, plan.members.slice(0, -1).map((member) => ({
      deliverableId: member.deliverableId,
      summary: `Review ${member.title}.`,
    })))).toEqual({ status: "refused", reason: "presentation-mismatch" });
    expect(first.title).not.toContain("\n");
  });

  it("validates the ordinary terminal presentation in the same preflight set", () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const members = plan.members.slice(0, -1).map((member) => ({
      deliverableId: member.deliverableId,
      summary: `Review ${member.title}.`,
    }));

    expect(resolveDeliveryPublicationPresentations(plan, members, {
      title: "feat(delivery): publish the work unit",
      body: "Publish the complete work unit.",
    })).toMatchObject({ status: "resolved" });
    expect(resolveDeliveryPublicationPresentations(plan, members, {
      title: "feat(delivery): publish\nwork unit",
      body: "Publish the complete work unit.",
    })).toEqual({ status: "refused", reason: "presentation-mismatch" });
  });
});

describe("delivery materialization orchestration", () => {
  it("binds the first exact ref once, then reserves target and remaining coordinate changes", async () => {
    const plan = deliveryPlanFixture();
    const derived = deriveDeliveryMaterialization(plan, eligible(plan));
    if (derived.status !== "derived") throw new Error("fixture must derive");
    const store = memoryStateStore();
    const refs = {
      publish: async () => ({ status: "published" as const }),
      observe: async (ref: string) => ({
        status: "observed" as const,
        head: ref === "refs/heads/main" ? protectedHead : firstHead,
      }),
    };
    const bound = await bindInitialDeliveryRef({ plan, materialization: derived.value, stateStore: store, refs });
    expect(bound.status).toBe("bound");
    if (bound.status !== "bound") return;
    expect(bound.state.value.members[0]).toMatchObject({
      ref: derived.value.members[0]!.ref,
      coordinates: derived.value.members[0]!.coordinates,
    });
    await expect(bindInitialDeliveryRef({ plan, materialization: derived.value, stateStore: store, refs }))
      .resolves.toEqual({ status: "refused", reason: "state-exists" });

    const materialized = await materializeBoundDeliveryChain({
      plan,
      materialization: derived.value,
      stateStore: store,
      refs,
    });
    expect(materialized.status).toBe("materialized");
    if (materialized.status === "materialized") {
      expect(materialized.state.value.target).toEqual({
        ref: "refs/heads/main",
        coordinates: { head: protectedHead, tree: protectedTree },
      });
      expect(materialized.state.value.activeOperation).toBeNull();
    }
  });

  it("adopts one exact request result", async () => {
    const plan = deliveryPlanFixture();
    const derived = deriveDeliveryMaterialization(plan, eligible(plan));
    if (derived.status !== "derived") throw new Error("fixture must derive");
    const store = memoryStateStore();
    const refs = {
      publish: async () => ({ status: "adopted" as const }),
      observe: async (ref: string) => ({
        status: "observed" as const,
        head: ref === "refs/heads/main" ? protectedHead : firstHead,
      }),
    };
    await bindInitialDeliveryRef({ plan, materialization: derived.value, stateStore: store, refs });
    await materializeBoundDeliveryChain({ plan, materialization: derived.value, stateStore: store, refs });
    let openedRequests = 0;
    let composedMembers = 0;
    const host = {
      observeRequest: async (effect: {
        readonly repository: string; readonly headRef: string; readonly headSha: string;
        readonly baseRef: string; readonly draft: boolean;
      }) => ({
        status: "observed" as const,
        request: {
          binding: { providerId: "github", changeRequestId: effect.headRef.startsWith("delivery/") ? "401" : "402" },
          repository: effect.repository,
          headRepository: effect.repository,
          headRef: effect.headRef,
          headSha: effect.headSha,
          baseRef: effect.baseRef,
          state: "open" as const,
          draft: effect.draft,
        },
      }),
      openRequest: async () => {
        openedRequests += 1;
        return { status: "submitted" as const };
      },
      readRequest: async () => ({ status: "absent" as const }),
      mergeRequest: async () => ({ status: "submitted" as const }),
      observeTarget: async () => ({ status: "refused" as const, reason: "unavailable" as const }),
    };
    const published = await publishDeliveryRequests({
      plan,
      materialization: derived.value,
      stateStore: store,
      host,
      providerId: "github",
      repository: "andrewRCr/arc-framework",
      draft: true,
      terminalPresentation: { title: "feat: publish example", body: "## Summary\n\nPublish the work unit." },
      memberPresentation: (member) => {
        if (member.kind === "terminal") throw new Error("terminal reached member composer");
        composedMembers += 1;
        return { title: "First", body: "Exact member" };
      },
    });
    expect(published.status).toBe("published");
    if (published.status === "published") {
      expect(published.state.value.members[0]!.changeRequest).toEqual({
        providerId: "github",
        changeRequestId: "401",
      });
      expect(published.state.value.members[1]).toMatchObject({
        ref: "refs/heads/feat/example",
        changeRequest: { providerId: "github", changeRequestId: "402" },
        coordinates: derived.value.members[1]!.coordinates,
      });
    }
    expect(openedRequests).toBe(0);
    expect(composedMembers).toBe(1);
  });

  it("publishes a one-member plan through its ordinary terminal request", async () => {
    const plan = deliverySingleMemberStackPlanFixture();
    const derived = deriveDeliveryMaterialization(plan, eligible(plan));
    if (derived.status !== "derived") throw new Error("fixture must derive");
    const store = memoryStateStore();
    let remoteHead: string | null = null;
    const refs = {
      publish: async (_ref: string, head: string) => {
        remoteHead = head;
        return { status: "published" as const };
      },
      observe: async (ref: string) => ref === "refs/heads/main"
        ? { status: "observed" as const, head: protectedHead }
        : remoteHead === null
          ? { status: "absent" as const }
          : { status: "observed" as const, head: remoteHead },
    };
    await expect(bindInitialDeliveryRef({ plan, materialization: derived.value, stateStore: store, refs }))
      .resolves.toMatchObject({ status: "bound" });
    await expect(materializeBoundDeliveryChain({ plan, materialization: derived.value, stateStore: store, refs }))
      .resolves.toMatchObject({ status: "materialized" });
    let request: {
      readonly repository: string; readonly headRef: string; readonly headSha: string;
      readonly baseRef: string; readonly draft: boolean;
    } | null = null;
    const host = {
      observeRequest: async () => request === null
        ? { status: "absent" as const }
        : {
          status: "observed" as const,
          request: {
            binding: { providerId: "github", changeRequestId: "401" },
            repository: request.repository,
            headRepository: request.repository,
            headRef: request.headRef,
            headSha: request.headSha,
            baseRef: request.baseRef,
            state: "open" as const,
            draft: request.draft,
          },
        },
      openRequest: async (opened: { readonly effect: NonNullable<typeof request> }) => {
        request = opened.effect;
        return { status: "submitted" as const };
      },
      readRequest: async () => ({ status: "absent" as const }),
      mergeRequest: async () => ({ status: "submitted" as const }),
      observeTarget: async () => ({ status: "refused" as const, reason: "unavailable" as const }),
    };
    const published = await publishDeliveryRequests({
      plan,
      materialization: derived.value,
      stateStore: store,
      host,
      providerId: "github",
      repository: "andrewRCr/arc-framework",
      draft: true,
      terminalPresentation: { title: "feat: publish example", body: "Publish the work unit." },
      memberPresentation: () => {
        throw new Error("one-member plan has no non-terminal presentation");
      },
    });
    expect(published).toMatchObject({
      status: "published",
      state: {
        value: {
          target: { ref: "refs/heads/main" },
          members: [{
            ref: "refs/heads/feat/example",
            changeRequest: { providerId: "github", changeRequestId: "401" },
            coordinates: { base: protectedHead, head: topHead, tree: topTree },
          }],
        },
      },
    });
    expect(request).toMatchObject({ headRef: "feat/example", baseRef: "main" });
  });

  it("opens a missing request with the exact reviewer-authored presentation", async () => {
    const plan = deliveryPlanFixture();
    const derived = deriveDeliveryMaterialization(plan, eligible(plan));
    if (derived.status !== "derived") throw new Error("fixture must derive");
    const store = memoryStateStore();
    const refs = {
      publish: async () => ({ status: "adopted" as const }),
      observe: async (ref: string) => ({
        status: "observed" as const,
        head: ref === "refs/heads/main" ? protectedHead : firstHead,
      }),
    };
    await bindInitialDeliveryRef({ plan, materialization: derived.value, stateStore: store, refs });
    await materializeBoundDeliveryChain({ plan, materialization: derived.value, stateStore: store, refs });
    const opened = new Map<string, { readonly title: string; readonly body: string }>();
    const host = {
      observeRequest: async (effect: {
        readonly repository: string;
        readonly headRef: string;
        readonly headSha: string;
        readonly baseRef: string;
        readonly draft: boolean;
      }) => !opened.has(effect.headRef)
        ? { status: "absent" as const }
        : {
          status: "observed" as const,
          request: {
            binding: { providerId: "github", changeRequestId: "401" },
            repository: effect.repository,
            headRepository: effect.repository,
            headRef: effect.headRef,
            headSha: effect.headSha,
            baseRef: effect.baseRef,
            state: "open" as const,
            draft: effect.draft,
          },
        },
      openRequest: async (request: {
        readonly effect: { readonly headRef: string };
        readonly title: string;
        readonly body: string;
      }) => {
        opened.set(request.effect.headRef, request);
        return { status: "submitted" as const };
      },
      readRequest: async () => ({ status: "absent" as const }),
      mergeRequest: async () => ({ status: "submitted" as const }),
      observeTarget: async () => ({ status: "refused" as const, reason: "unavailable" as const }),
    };
    const member = plan.members[0]!;
    const authored = {
      deliverableId: member.deliverableId,
      summary: "Establishes the review boundary before any request is published.",
      changes: [{ topic: "Boundary", description: "Selects one exact delivery-aware review outcome." }],
    };

    await expect(publishDeliveryRequests({
      plan,
      materialization: derived.value,
      stateStore: store,
      host,
      providerId: "github",
      repository: "andrewRCr/arc-framework",
      draft: true,
      terminalPresentation: { title: "feat: publish example", body: "## Summary\n\nPublish the work unit." },
      memberPresentation: (materialized) => describeDeliveryMemberPresentation(plan, materialized, authored),
    })).resolves.toMatchObject({ status: "published" });
    expect(opened.get(derived.value.members[0]!.ref!.replace("refs/heads/", ""))).toMatchObject({
      title: `${plan.workUnitId} [1/2]: ${member.title}`,
      body: [
        "## Summary",
        "",
        "Establishes the review boundary before any request is published.",
        "",
        "## Changes",
        "",
        "- _Boundary_ — Selects one exact delivery-aware review outcome.",
      ].join("\n"),
    });
    expect(opened.get("feat/example")).toEqual({
      effect: expect.objectContaining({ headRef: "feat/example" }),
      title: "feat: publish example",
      body: "## Summary\n\nPublish the work unit.",
    });
  });

  it("refuses target movement after reservation without overwriting state", async () => {
    const plan = deliveryPlanFixture();
    const derived = deriveDeliveryMaterialization(plan, eligible(plan));
    if (derived.status !== "derived") throw new Error("fixture must derive");
    const store = memoryStateStore();
    const refs = {
      publish: async () => ({ status: "published" as const }),
      observe: async (ref: string) => ({
        status: "observed" as const,
        head: ref === "refs/heads/main" ? "9".repeat(40) : firstHead,
      }),
    };
    await bindInitialDeliveryRef({ plan, materialization: derived.value, stateStore: store, refs });

    await expect(materializeBoundDeliveryChain({
      plan,
      materialization: derived.value,
      stateStore: store,
      refs,
    })).resolves.toEqual({ status: "refused" });
    const retained = await store.read();
    expect(retained.value?.value.target).toBeNull();
    expect(retained.value?.value.activeOperation?.kind).toBe("materialize");
  });

  it("adopts only one exact open initial request", async () => {
    const plan = deliveryPlanFixture();
    const derived = deriveDeliveryMaterialization(plan, eligible(plan));
    if (derived.status !== "derived") throw new Error("fixture must derive");
    const exact = {
      binding: { providerId: "github", changeRequestId: "401" },
      repository: "andrewRCr/arc-framework",
      headRepository: "andrewRCr/arc-framework",
      headRef: derived.value.members[0]!.ref!.replace("refs/heads/", ""),
      headSha: firstHead,
      baseRef: "main",
      state: "open" as const,
      draft: true,
    };
    const host = {
      observeRequest: async () => ({ status: "observed" as const, request: exact }),
      openRequest: async () => ({ status: "submitted" as const }),
      readRequest: async () => ({ status: "absent" as const }),
      mergeRequest: async () => ({ status: "submitted" as const }),
      observeTarget: async () => ({ status: "refused" as const, reason: "unavailable" as const }),
    };
    const adopted = await bindInitialDeliveryRequest({
      plan,
      materialization: derived.value,
      stateStore: memoryStateStore(),
      host,
      providerId: "github",
      repository: exact.repository,
      draft: exact.draft,
    });
    expect(adopted.status).toBe("bound");
    await expect(bindInitialDeliveryRequest({
      plan,
      materialization: derived.value,
      stateStore: memoryStateStore(),
      host: { ...host, observeRequest: async () => ({ status: "absent" as const }) },
      providerId: "github",
      repository: exact.repository,
      draft: exact.draft,
    })).resolves.toEqual({ status: "absent" });

    for (const mismatch of [
      { ...exact, repository: "someone/else" },
      { ...exact, baseRef: "release" },
      { ...exact, headRef: "delivery/example/other" },
      { ...exact, headSha: "8".repeat(40) },
      { ...exact, state: "closed" as const },
      { ...exact, draft: false },
    ]) {
      await expect(bindInitialDeliveryRequest({
        plan,
        materialization: derived.value,
        stateStore: memoryStateStore(),
        host: { ...host, observeRequest: async () => ({ status: "observed" as const, request: mismatch }) },
        providerId: "github",
        repository: exact.repository,
        draft: exact.draft,
      })).resolves.toEqual({ status: "refused" });
    }
  });

  it("resolves every missing request presentation before reserving publication", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const derived = deriveDeliveryMaterialization(plan, eligible(plan));
    if (derived.status !== "derived") throw new Error("fixture must derive");
    const store = memoryStateStore();
    const refs = {
      publish: async () => ({ status: "adopted" as const }),
      observe: async (ref: string) => {
        if (ref === "refs/heads/main") return { status: "observed" as const, head: protectedHead };
        const member = derived.value.members.find((candidate) => candidate.ref === ref);
        return member === undefined
          ? { status: "refused" as const }
          : { status: "observed" as const, head: member.head };
      },
    };
    await bindInitialDeliveryRef({ plan, materialization: derived.value, stateStore: store, refs });
    await materializeBoundDeliveryChain({ plan, materialization: derived.value, stateStore: store, refs });
    let hostObserved = false;
    const host = {
      observeRequest: async () => {
        hostObserved = true;
        return { status: "absent" as const };
      },
      openRequest: async () => ({ status: "submitted" as const }),
      readRequest: async () => ({ status: "absent" as const }),
      mergeRequest: async () => ({ status: "submitted" as const }),
      observeTarget: async () => ({ status: "refused" as const, reason: "unavailable" as const }),
    };

    await expect(publishDeliveryRequests({
      plan,
      materialization: derived.value,
      stateStore: store,
      host,
      providerId: "github",
      repository: "andrewRCr/arc-framework",
      draft: true,
      terminalPresentation: { title: "feat: publish example", body: "## Summary\n\nPublish the work unit." },
      memberPresentation: (member) => {
        if (member.deliverableId === plan.members[1]!.deliverableId) throw new Error("invalid presentation");
        return { title: "First", body: "Exact member" };
      },
    })).resolves.toEqual({ status: "refused" });
    expect(hostObserved).toBe(false);
    const retained = await store.read();
    expect(retained.value?.value.activeOperation).toBeNull();
  });

  it("refuses malformed composed presentation before observing or opening a request", async () => {
    const plan = deliveryPlanFixture();
    const derived = deriveDeliveryMaterialization(plan, eligible(plan));
    if (derived.status !== "derived") throw new Error("fixture must derive");
    const store = memoryStateStore();
    const refs = {
      publish: async () => ({ status: "adopted" as const }),
      observe: async (ref: string) => ({
        status: "observed" as const,
        head: ref === "refs/heads/main" ? protectedHead : firstHead,
      }),
    };
    await bindInitialDeliveryRef({ plan, materialization: derived.value, stateStore: store, refs });
    await materializeBoundDeliveryChain({ plan, materialization: derived.value, stateStore: store, refs });
    let hostMutation = false;
    const host = {
      observeRequest: async () => {
        hostMutation = true;
        return { status: "absent" as const };
      },
      openRequest: async () => {
        hostMutation = true;
        return { status: "submitted" as const };
      },
      readRequest: async () => ({ status: "absent" as const }),
      mergeRequest: async () => ({ status: "submitted" as const }),
      observeTarget: async () => ({ status: "refused" as const, reason: "unavailable" as const }),
    };

    await expect(publishDeliveryRequests({
      plan,
      materialization: derived.value,
      stateStore: store,
      host,
      providerId: "github",
      repository: "andrewRCr/arc-framework",
      draft: true,
      terminalPresentation: { title: "feat: publish example", body: "Publish the work unit." },
      memberPresentation: () => ({ title: "", body: "Missing title." }),
    })).resolves.toEqual({ status: "refused" });
    expect(hostMutation).toBe(false);
  });

  it("resumes an exact request opened before operation acceptance", async () => {
    const plan = deliveryPlanFixture();
    const derived = deriveDeliveryMaterialization(plan, eligible(plan));
    if (derived.status !== "derived") throw new Error("fixture must derive");
    const store = memoryStateStore();
    const refs = {
      publish: async () => ({ status: "adopted" as const }),
      observe: async (ref: string) => ({
        status: "observed" as const,
        head: ref === "refs/heads/main" ? protectedHead : firstHead,
      }),
    };
    await bindInitialDeliveryRef({ plan, materialization: derived.value, stateStore: store, refs });
    await materializeBoundDeliveryChain({ plan, materialization: derived.value, stateStore: store, refs });
    const requests = new Map<string, {
      readonly effect: {
        readonly repository: string; readonly headRef: string; readonly headSha: string;
        readonly baseRef: string; readonly draft: boolean;
      };
      readonly title: string;
      readonly body: string;
    }>();
    const openCounts = new Map<string, number>();
    let interruptAfterFirstOpen = true;
    const host = {
      observeRequest: async (effect: {
        readonly repository: string; readonly headRef: string; readonly headSha: string;
        readonly baseRef: string; readonly draft: boolean;
      }) => {
        const request = requests.get(effect.headRef);
        if (request === undefined) return { status: "absent" as const };
        if (interruptAfterFirstOpen) {
          interruptAfterFirstOpen = false;
          return { status: "refused" as const, reason: "unavailable" as const };
        }
        return {
          status: "observed" as const,
          request: {
            binding: { providerId: "github", changeRequestId: effect.headRef.startsWith("delivery/") ? "401" : "402" },
            repository: effect.repository,
            headRepository: effect.repository,
            headRef: effect.headRef,
            headSha: effect.headSha,
            baseRef: effect.baseRef,
            state: "open" as const,
            draft: effect.draft,
          },
        };
      },
      openRequest: async (request: {
        readonly effect: {
          readonly repository: string; readonly headRef: string; readonly headSha: string;
          readonly baseRef: string; readonly draft: boolean;
        };
        readonly title: string;
        readonly body: string;
      }) => {
        openCounts.set(request.effect.headRef, (openCounts.get(request.effect.headRef) ?? 0) + 1);
        requests.set(request.effect.headRef, request);
        return { status: "submitted" as const };
      },
      readRequest: async () => ({ status: "absent" as const }),
      mergeRequest: async () => ({ status: "submitted" as const }),
      observeTarget: async () => ({ status: "refused" as const, reason: "unavailable" as const }),
    };
    const input = {
      plan,
      materialization: derived.value,
      stateStore: store,
      host,
      providerId: "github",
      repository: "andrewRCr/arc-framework",
      draft: true,
      terminalPresentation: { title: "feat: publish example", body: "Publish the work unit." },
      memberPresentation: (member: typeof derived.value.members[number]) => {
        if (member.kind === "terminal") throw new Error("terminal reached member composer");
        return { title: "First", body: "Exact member." };
      },
    };

    await expect(publishDeliveryRequests(input)).resolves.toEqual({ status: "refused" });
    await expect(publishDeliveryRequests(input)).resolves.toMatchObject({ status: "published" });
    expect([...requests.keys()]).toEqual([
      derived.value.members[0]!.ref!.replace("refs/heads/", ""),
      "feat/example",
    ]);
    expect([...openCounts.values()]).toEqual([1, 1]);
  });

  it("reobserves and adopts an exact first ref after state publication is interrupted", async () => {
    const plan = deliveryPlanFixture();
    const derived = deriveDeliveryMaterialization(plan, eligible(plan));
    if (derived.status !== "derived") throw new Error("fixture must derive");
    let record: { revision: number; value: DeliveryStateV1 } | null = null;
    let refuseFirstStateWrite = true;
    let remoteHead: string | null = null;
    let mutations = 0;
    const store = {
      read: async () => ({ status: "ok" as const, value: record }),
      publish: async (_planId: string, value: DeliveryStateV1, expectedRevision: number) => {
        if (refuseFirstStateWrite) {
          refuseFirstStateWrite = false;
          return { status: "refused" as const, reason: "version-conflict" as const };
        }
        record = { revision: expectedRevision + 1, value };
        return { status: "ok" as const, value: record };
      },
    };
    const refs = {
      observe: async () => remoteHead === null
        ? { status: "absent" as const }
        : { status: "observed" as const, head: remoteHead },
      publish: async (_ref: string, head: string) => {
        if (remoteHead === null) {
          remoteHead = head;
          mutations += 1;
          return { status: "published" as const };
        }
        return remoteHead === head ? { status: "adopted" as const } : { status: "refused" as const };
      },
    };

    await expect(bindInitialDeliveryRef({ plan, materialization: derived.value, stateStore: store, refs }))
      .resolves.toEqual({ status: "refused", reason: "state-refused" });
    const resumed = await bindInitialDeliveryRef({ plan, materialization: derived.value, stateStore: store, refs });
    expect(resumed.status).toBe("bound");
    expect(mutations).toBe(1);
  });
});
