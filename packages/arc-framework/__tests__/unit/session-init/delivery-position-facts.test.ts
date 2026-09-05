import { describe, expect, it, vi } from "vitest";

import { reserveDeliveryOperation } from "../../../src/lib/delivery/operation.js";
import type {
  DeliveryOperationSnapshotV1,
  DeliveryStateV1,
} from "../../../src/lib/delivery/schema.js";
import { observeRepositoryDeliveryPosition } from "../../../src/lib/session-init/delivery-position-facts.js";
import { deliveryStackPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

function exactDependencies(state: ReturnType<typeof deliveryStateFixture>) {
  if (state.target === null || state.target.coordinates === null) throw new Error("fixture target missing");
  const targetCoordinates = state.target.coordinates;
  const trees = new Map(state.members.flatMap((member) => member.coordinates === null
    ? []
    : [[member.coordinates.head, member.coordinates.tree] as const]));
  trees.set(targetCoordinates.head, targetCoordinates.tree);
  const availableCommits = new Set(trees.keys());
  const exec = vi.fn(async (
    _command: string,
    args: readonly string[],
    options?: { cwd?: string; objectAccess?: string },
  ) => {
    expect(options).toMatchObject({ cwd: "/repository", objectAccess: "local-only" });
    if (args[0] === "rev-parse" && args[2]?.endsWith("^{commit}")) {
      const head = args[2].slice(0, -"^{commit}".length);
      if (!availableCommits.has(head)) throw new Error("commit unavailable");
      return { stdout: `${head}\n`, stderr: "" };
    }
    if (args[0] === "rev-list") return { stdout: `${args.at(-1)}\n`, stderr: "" };
    if (args[0] === "merge-base" && args[1] === "--is-ancestor") {
      return { stdout: "", stderr: "" };
    }
    if (args[0] === "rev-parse" && args[1]?.endsWith("^{tree}")) {
      return { stdout: `${trees.get(args[1].slice(0, -"^{tree}".length)) ?? ""}\n`, stderr: "" };
    }
    throw new Error(`unexpected git args: ${args.join(" ")}`);
  });
  const host = {
    observeTarget: vi.fn(async () => ({ status: "observed" as const, coordinates: targetCoordinates })),
    readRequest: vi.fn(),
    observeRequest: vi.fn(),
    openRequest: vi.fn(),
    mergeRequest: vi.fn(),
  };
  return {
    exec,
    cwd: "/repository",
    host,
    repository: "owner/repository",
    materializeTarget: vi.fn(async (coordinates: { head: string; tree: string }) => {
      trees.set(coordinates.head, coordinates.tree);
      availableCommits.add(coordinates.head);
      return true;
    }),
    observeLandedResult: vi.fn(async ({ mergeCommitSha }: { mergeCommitSha: string }) => ({
      predecessor: targetCoordinates,
      member: { head: mergeCommitSha, tree: trees.get(mergeCommitSha) ?? targetCoordinates.tree },
    })),
    proveContribution: vi.fn(async () => ({
      status: "accepted" as const,
      proof: "mechanical-reapply" as const,
    })),
    remoteHeads: Object.fromEntries(state.members.flatMap((member) => (
      member.ref === null || member.coordinates === null
        ? []
        : [[member.ref.replace(/^refs\/heads\//u, ""), member.coordinates.head]]
    ))),
    localCommits: Object.fromEntries(state.members.flatMap((member) => (
      member.coordinates === null ? [] : [[member.coordinates.head, true]]
    ))),
    localHeads: {} as Record<string, string>,
  };
}

function snapshot(state: DeliveryStateV1): DeliveryOperationSnapshotV1 {
  return { target: state.target, members: [state.members[0]!] };
}

describe("session-init delivery position facts", () => {
  it("reobserves exact target, ref heads, and trees without mutation", async () => {
    const plan = deliveryStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const dependencies = exactDependencies(state);
    const result = await observeRepositoryDeliveryPosition(plan, state, 3, dependencies);
    expect(result).toEqual({
      status: "observed",
      facts: { target: state.target, members: state.members, landedDeliverableIds: [] },
      operationObservation: null,
      projectedState: state,
    });
    expect(dependencies.exec).toHaveBeenCalled();
    expect(dependencies.exec.mock.calls.some(([, args]) => args[0] === "ls-remote")).toBe(false);
  });

  it("keeps append-only protected-target movement readable without rebasing stored member facts", async () => {
    const plan = deliveryStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const dependencies = exactDependencies(state);
    const advancedTarget = {
      status: "observed",
      coordinates: { head: "f".repeat(40), tree: "e".repeat(40) },
    } as const;
    dependencies.host.observeTarget.mockResolvedValue(advancedTarget);

    await expect(observeRepositoryDeliveryPosition(plan, state, 3, dependencies))
      .resolves.toMatchObject({
        status: "observed",
        facts: {
          target: state.target,
          members: state.members,
          landedDeliverableIds: [],
          targetMovement: "append-only",
        },
      });
  });

  it("recognizes append-only terminal authoring movement only for the review-fix observation", async () => {
    const plan = deliveryStackPlanFixture();
    const initial = deliveryStateFixture(plan);
    const terminalIndex = initial.members.length - 1;
    const terminal = initial.members[terminalIndex]!;
    const binding = { providerId: "github", changeRequestId: "402" };
    const state = {
      ...initial,
      members: initial.members.map((member, index) => index === terminalIndex
        ? { ...member, changeRequest: binding }
        : member),
    };
    const dependencies = exactDependencies(state);
    const advanced = { head: "f".repeat(40), tree: "e".repeat(40) };
    await dependencies.materializeTarget(advanced);
    const terminalBranch = terminal.ref!.replace(/^refs\/heads\//u, "");
    dependencies.remoteHeads[terminalBranch] = advanced.head;
    dependencies.localCommits[advanced.head] = true;
    const observedRequest = {
      status: "observed",
      request: {
        binding,
        repository: "owner/repository",
        headRepository: "owner/repository",
        headRef: terminalBranch,
        headSha: advanced.head,
        baseRef: state.members[0]!.ref!.replace(/^refs\/heads\//u, ""),
        state: "open",
        draft: true,
      },
    } as const;
    dependencies.host.readRequest.mockResolvedValue(observedRequest);

    await expect(observeRepositoryDeliveryPosition(plan, state, 3, dependencies))
      .resolves.toEqual({ status: "refused" });
    dependencies.host.readRequest.mockResolvedValue({
      ...observedRequest,
      request: { ...observedRequest.request, headSha: terminal.coordinates!.head },
    });
    await expect(observeRepositoryDeliveryPosition(plan, state, 3, dependencies, {
      terminalAuthoringMovement: "allow-append-only",
    })).resolves.toEqual({ status: "refused" });
    dependencies.host.readRequest.mockResolvedValue(observedRequest);

    dependencies.localCommits[advanced.head] = false;
    await expect(observeRepositoryDeliveryPosition(plan, state, 3, dependencies, {
      terminalAuthoringMovement: "allow-append-only",
    })).resolves.toEqual({ status: "refused" });
    dependencies.localCommits[advanced.head] = true;

    const exactExec = dependencies.exec.getMockImplementation();
    if (exactExec === undefined) throw new Error("fixture git boundary is missing");
    dependencies.exec.mockImplementation(async (command, args, options) => {
      if (args[0] === "merge-base" && args[1] === "--is-ancestor") {
        throw new Error("ancestry unavailable");
      }
      return exactExec(command, args, options);
    });
    await expect(observeRepositoryDeliveryPosition(plan, state, 3, dependencies, {
      terminalAuthoringMovement: "allow-append-only",
    })).resolves.toEqual({ status: "refused" });
    dependencies.exec.mockImplementation(async (command, args, options) => {
      if (args[0] === "merge-base" && args[1] === "--is-ancestor") {
        throw Object.assign(new Error("not an ancestor"), { exitCode: 1, stderr: "" });
      }
      return exactExec(command, args, options);
    });
    await expect(observeRepositoryDeliveryPosition(plan, state, 3, dependencies, {
      terminalAuthoringMovement: "allow-append-only",
    })).resolves.toEqual({ status: "refused" });
    dependencies.exec.mockImplementation(exactExec);

    await expect(observeRepositoryDeliveryPosition(plan, state, 3, dependencies, {
      terminalAuthoringMovement: "allow-append-only",
    })).resolves.toMatchObject({
      status: "observed",
      facts: {
        members: state.members,
        terminalAuthoringMovement: {
          deliverableId: terminal.deliverableId,
          before: terminal.coordinates,
          after: { ...advanced, base: terminal.coordinates!.base },
          publicationLeaseHead: advanced.head,
        },
      },
    });
  });

  it("retains a local-only append-only terminal head with its bound publication lease", async () => {
    const plan = deliveryStackPlanFixture();
    const initial = deliveryStateFixture(plan);
    const terminalIndex = initial.members.length - 1;
    const terminal = initial.members[terminalIndex]!;
    const binding = { providerId: "github", changeRequestId: "402" };
    const state = {
      ...initial,
      members: initial.members.map((member, index) => index === terminalIndex
        ? { ...member, changeRequest: binding }
        : member),
    };
    const dependencies = exactDependencies(state);
    const advanced = { head: "f".repeat(40), tree: "e".repeat(40) };
    await dependencies.materializeTarget(advanced);
    const terminalBranch = terminal.ref!.replace(/^refs\/heads\//u, "");
    dependencies.localHeads[terminalBranch] = advanced.head;
    dependencies.localCommits[advanced.head] = true;
    dependencies.host.readRequest.mockResolvedValue({
      status: "observed",
      request: {
        binding,
        repository: "owner/repository",
        headRepository: "owner/repository",
        headRef: terminalBranch,
        headSha: terminal.coordinates!.head,
        baseRef: state.members[0]!.ref!.replace(/^refs\/heads\//u, ""),
        state: "open",
        draft: true,
      },
    });

    await expect(observeRepositoryDeliveryPosition(plan, state, 3, dependencies, {
      terminalAuthoringMovement: "allow-append-only",
    })).resolves.toMatchObject({
      status: "observed",
      facts: {
        terminalAuthoringMovement: {
          deliverableId: terminal.deliverableId,
          before: terminal.coordinates,
          after: { ...advanced, base: terminal.coordinates!.base },
          publicationLeaseHead: terminal.coordinates!.head,
        },
      },
    });
  });

  it("retains persisted coordinates while leasing an advanced remote head for local authoring", async () => {
    const plan = deliveryStackPlanFixture();
    const initial = deliveryStateFixture(plan);
    const terminalIndex = initial.members.length - 1;
    const terminal = initial.members[terminalIndex]!;
    const binding = { providerId: "github", changeRequestId: "402" };
    const state = {
      ...initial,
      members: initial.members.map((member, index) => index === terminalIndex
        ? { ...member, changeRequest: binding }
        : member),
    };
    const dependencies = exactDependencies(state);
    const remote = { head: "f".repeat(40), tree: "e".repeat(40) };
    const local = { head: "d".repeat(40), tree: "c".repeat(40) };
    await dependencies.materializeTarget(remote);
    await dependencies.materializeTarget(local);
    const terminalBranch = terminal.ref!.replace(/^refs\/heads\//u, "");
    dependencies.remoteHeads[terminalBranch] = remote.head;
    dependencies.localHeads[terminalBranch] = local.head;
    dependencies.localCommits[remote.head] = true;
    dependencies.localCommits[local.head] = true;
    dependencies.host.readRequest.mockResolvedValue({
      status: "observed",
      request: {
        binding,
        repository: "owner/repository",
        headRepository: "owner/repository",
        headRef: terminalBranch,
        headSha: remote.head,
        baseRef: state.members[0]!.ref!.replace(/^refs\/heads\//u, ""),
        state: "open",
        draft: true,
      },
    });

    await expect(observeRepositoryDeliveryPosition(plan, state, 3, dependencies, {
      terminalAuthoringMovement: "allow-append-only",
    })).resolves.toMatchObject({
      status: "observed",
      facts: {
        terminalAuthoringMovement: {
          deliverableId: terminal.deliverableId,
          before: terminal.coordinates,
          after: { ...local, base: terminal.coordinates!.base },
          publicationLeaseHead: remote.head,
        },
      },
    });
  });


  it("fails closed when a remote member head is unavailable", async () => {
    const plan = deliveryStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const dependencies = exactDependencies(state);
    dependencies.remoteHeads = {};
    await expect(observeRepositoryDeliveryPosition(plan, state, 3, dependencies))
      .resolves.toEqual({ status: "refused" });
    expect(dependencies.exec).not.toHaveBeenCalled();
  });

  it("fails closed without inspecting an advertised member object that is not locally available", async () => {
    const plan = deliveryStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const dependencies = exactDependencies(state);
    dependencies.localCommits = {};
    await expect(observeRepositoryDeliveryPosition(plan, state, 3, dependencies))
      .resolves.toEqual({ status: "refused" });
    expect(dependencies.exec).not.toHaveBeenCalled();
  });

  it("proves a merged retained head locally after its remote ref is deleted", async () => {
    const plan = deliveryStackPlanFixture();
    const initial = deliveryStateFixture(plan);
    const state = {
      ...initial,
      members: initial.members.map((member, index) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(401 + index) },
      })),
    };
    const retained = state.members[0]!;
    const dependencies = exactDependencies(state);
    const retainedBranch = retained.ref!.replace(/^refs\/heads\//u, "");
    dependencies.remoteHeads = Object.fromEntries(
      Object.entries(dependencies.remoteHeads).filter(([branch]) => branch !== retainedBranch),
    );
    dependencies.localCommits = Object.fromEntries(
      Object.entries(dependencies.localCommits).filter(([head]) => head !== retained.coordinates!.head),
    );
    dependencies.host.readRequest.mockImplementation(async (_repository, binding) => {
      const member = state.members.find((candidate) => (
        candidate.changeRequest?.changeRequestId === binding.changeRequestId
      ))!;
      return {
        status: "observed" as const,
        request: {
          binding,
          repository: "owner/repository",
          headRepository: "owner/repository",
          headRef: member.ref!.replace(/^refs\/heads\//u, ""),
          headSha: member.coordinates!.head,
          baseRef: state.target!.ref.replace(/^refs\/heads\//u, ""),
          state: binding.changeRequestId === "401" ? "merged" as const : "open" as const,
          draft: true,
        },
      };
    });

    await expect(observeRepositoryDeliveryPosition(plan, state, 3, dependencies))
      .resolves.toMatchObject({
        status: "observed",
        facts: { landedDeliverableIds: [retained.deliverableId] },
      });
    expect(dependencies.exec).toHaveBeenCalled();
  });

  it("recognizes a fully torn-down nonterminal prefix while leaving the terminal unlanded", async () => {
    const plan = deliveryStackPlanFixture();
    const initial = deliveryStateFixture(plan);
    const state = {
      ...initial,
      members: initial.members.map((member) => ({
        deliverableId: member.deliverableId,
        ref: null,
        changeRequest: null,
        coordinates: null,
      })),
    };
    const result = await observeRepositoryDeliveryPosition(plan, state, 4, exactDependencies(state));
    expect(result).toEqual({
      status: "observed",
      facts: {
        target: state.target,
        members: state.members,
        landedDeliverableIds: [plan.members[0]!.deliverableId],
      },
      operationObservation: null,
      projectedState: state,
    });
  });

  it("projects snapshot operations from either the requested or before coordinates", async () => {
    const plan = deliveryStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const before = snapshot(state);
    const requested = {
      target: state.target,
      members: before.members.map((member) => ({
        ...member,
        coordinates: { base: "1".repeat(40), head: "a".repeat(40), tree: "b".repeat(40) },
      })),
    };
    const reserved = reserveDeliveryOperation({ revision: 3, value: state }, plan, {
      operationId: "rewrite-1",
      kind: "rewrite",
      mode: "provider-adoption",
      affectedDeliverableIds: [state.members[0]!.deliverableId],
      expectedStateRevision: 3,
      before,
      requested,
    });
    expect(reserved.status).toBe("reserved");
    if (reserved.status !== "reserved") return;

    const requestedState = {
      ...state,
      members: [
        { ...state.members[0]!, coordinates: requested.members[0]!.coordinates },
        ...state.members.slice(1),
      ],
    };
    await expect(observeRepositoryDeliveryPosition(
      plan,
      reserved.state,
      4,
      exactDependencies(requestedState),
    )).resolves.toMatchObject({
      status: "observed",
      operationObservation: requested,
      projectedState: { activeOperation: null, members: requestedState.members },
    });

    await expect(observeRepositoryDeliveryPosition(
      plan,
      reserved.state,
      4,
      exactDependencies(state),
    )).resolves.toMatchObject({
      status: "observed",
      operationObservation: before,
      projectedState: { activeOperation: null, members: state.members },
    });
  });

  it("projects an applied publish, an open landing retry, and a merged landing", async () => {
    const plan = deliveryStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const first = state.members[0]!;
    const before = snapshot(state);
    const effect = {
      providerId: "github" as const,
      repository: "owner/repository",
      headRef: first.ref!.replace(/^refs\/heads\//u, ""),
      headSha: first.coordinates!.head,
      baseRef: "main",
      draft: true,
    };
    const publish = reserveDeliveryOperation({ revision: 3, value: state }, plan, {
      operationId: "publish-1",
      kind: "publish",
      affectedDeliverableIds: [first.deliverableId],
      expectedStateRevision: 3,
      before,
      requested: before,
      effect,
    });
    expect(publish.status).toBe("reserved");
    if (publish.status !== "reserved") return;
    const binding = { providerId: "github", changeRequestId: "401" };
    const publishedState = {
      ...state,
      members: [{ ...first, changeRequest: binding }, ...state.members.slice(1)],
    };
    const publishDeps = exactDependencies(publishedState);
    publishDeps.host.observeRequest.mockResolvedValue({
      status: "observed",
      request: {
        binding,
        repository: "owner/repository",
        headRepository: "owner/repository",
        headRef: effect.headRef,
        headSha: effect.headSha,
        baseRef: "main",
        state: "open",
        draft: true,
      },
    });
    publishDeps.host.readRequest.mockResolvedValue({
      status: "observed",
      request: {
        binding,
        repository: "owner/repository",
        headRepository: "owner/repository",
        headRef: effect.headRef,
        headSha: effect.headSha,
        baseRef: "main",
        state: "open",
        draft: true,
      },
    });
    await expect(observeRepositoryDeliveryPosition(plan, publish.state, 4, publishDeps))
      .resolves.toMatchObject({
        status: "observed",
        operationObservation: { outcome: "applied" },
        projectedState: { activeOperation: null, members: publishedState.members },
      });

    const landBefore = snapshot(publishedState);
    const land = reserveDeliveryOperation({ revision: 5, value: publishedState }, plan, {
      operationId: "land-1",
      kind: "land",
      mode: "sequential",
      nativeArm: null,
      affectedDeliverableIds: [first.deliverableId],
      expectedStateRevision: 5,
      before: landBefore,
      requested: landBefore,
      effect: {
        providerId: "github",
        repository: "owner/repository",
        changeRequestId: "401",
        headSha: effect.headSha,
        baseRef: "main",
        targetRef: state.target!.ref,
        strategy: "merge",
        mergePolicy: {
          repository: "owner/repository",
          stackPosition: "intermediate",
          method: "merge",
          allowedMethods: ["merge"],
          policyFingerprint: `sha256:${"a".repeat(64)}`,
        },
      },
    });
    expect(land.status).toBe("reserved");
    if (land.status !== "reserved") return;
    const landDeps = exactDependencies(publishedState);
    landDeps.host.readRequest.mockResolvedValue(publishDeps.host.readRequest.mock.results[0]!.value);
    await expect(observeRepositoryDeliveryPosition(plan, land.state, 6, landDeps))
      .resolves.toMatchObject({
        status: "observed",
        operationObservation: { outcome: "not-applied" },
        projectedState: { activeOperation: null },
      });
    const landOperation = land.state.activeOperation;
    if (landOperation?.kind !== "land") throw new Error("fixture must reserve landing");
    const nativeLand: DeliveryStateV1 = {
      ...land.state,
      activeOperation: { ...landOperation, mode: "native" },
    };
    await expect(observeRepositoryDeliveryPosition(plan, nativeLand, 6, landDeps))
      .resolves.toEqual({ status: "refused" });

    const mergedCoordinates = { head: "a".repeat(40), tree: "b".repeat(40) };
    const mergedState = {
      ...publishedState,
      target: { ...publishedState.target!, coordinates: mergedCoordinates },
      members: publishedState.members,
    };
    const mergedDeps = exactDependencies(mergedState);
    mergedDeps.remoteHeads[effect.headRef] = effect.headSha;
    mergedDeps.localCommits[effect.headSha] = true;
    mergedDeps.host.readRequest.mockResolvedValue({
      status: "observed",
      request: {
        binding,
        repository: "owner/repository",
        headRepository: "owner/repository",
        headRef: effect.headRef,
        headSha: effect.headSha,
        baseRef: "main",
        state: "merged",
        draft: true,
        mergeCommitSha: mergedCoordinates.head,
      },
    });
    mergedDeps.observeLandedResult.mockResolvedValue({
      predecessor: publishedState.target!.coordinates!,
      member: mergedCoordinates,
    });
    await expect(observeRepositoryDeliveryPosition(plan, land.state, 6, mergedDeps))
      .resolves.toMatchObject({
        status: "observed",
        operationObservation: { outcome: "applied" },
        projectedState: {
          activeOperation: null,
          target: mergedState.target,
          members: mergedState.members,
        },
      });

    const mismatchedMergedState = {
      ...mergedState,
      members: mergedState.members.map((member, index) => index === 0
        ? { ...member, coordinates: { ...member.coordinates!, tree: "c".repeat(40) } }
        : member),
    };
    const mismatchedMergedDeps = exactDependencies(mismatchedMergedState);
    mismatchedMergedDeps.remoteHeads[effect.headRef] = effect.headSha;
    mismatchedMergedDeps.localCommits[effect.headSha] = true;
    mismatchedMergedDeps.host.readRequest.mockResolvedValue({
      status: "observed",
      request: {
        binding,
        repository: "owner/repository",
        headRepository: "owner/repository",
        headRef: effect.headRef,
        headSha: effect.headSha,
        baseRef: "main",
        state: "merged",
        draft: true,
      },
    });
    await expect(observeRepositoryDeliveryPosition(plan, land.state, 6, mismatchedMergedDeps))
      .resolves.toEqual({ status: "refused" });
  });

  it("classifies a reserved top remedy as applied, retryable, or ambiguous from exact request facts", async () => {
    const plan = deliveryStackPlanFixture();
    const initial = deliveryStateFixture(plan);
    const bindings = initial.members.map((_, index) => ({
      providerId: "github", changeRequestId: String(401 + index),
    }));
    const state = {
      ...initial,
      target: { ...initial.target!, ref: "refs/heads/main" },
      members: initial.members.map((member, index) => ({ ...member, changeRequest: bindings[index]! })),
    };
    const top = state.members.at(-1)!;
    const before = { target: state.target, members: [top] };
    const effect = {
      providerId: "github",
      repository: "owner/repository",
      changeRequestId: top.changeRequest!.changeRequestId,
      headRef: top.ref!.replace(/^refs\/heads\//u, ""),
      headSha: top.coordinates!.head,
      triggerRef: state.members.at(-2)!.ref!,
      triggerHeadSha: state.members.at(-2)!.coordinates!.head,
      fromBaseRef: "member-1",
      protectedBaseRef: "main",
      action: "retarget" as const,
    };
    const reserved = reserveDeliveryOperation({ revision: 7, value: state }, plan, {
      operationId: "top-remedy-1",
      kind: "top-remedy",
      affectedDeliverableIds: [top.deliverableId],
      expectedStateRevision: 7,
      before,
      requested: before,
      effect,
    });
    expect(reserved.status).toBe("reserved");
    if (reserved.status !== "reserved") return;
    const foreignReservation = reserveDeliveryOperation({ revision: 7, value: state }, plan, {
      operationId: "top-remedy-foreign-repository",
      kind: "top-remedy",
      affectedDeliverableIds: [top.deliverableId],
      expectedStateRevision: 7,
      before,
      requested: before,
      effect: { ...effect, repository: "owner/other" },
    });
    expect(foreignReservation.status).toBe("reserved");
    if (foreignReservation.status !== "reserved") return;
    const foreignDependencies = exactDependencies(state);
    await expect(observeRepositoryDeliveryPosition(plan, foreignReservation.state, 8, foreignDependencies))
      .resolves.toEqual({ status: "refused" });
    expect(foreignDependencies.host.readRequest).not.toHaveBeenCalled();

    const requestFor = (changeRequestId: string, topBaseRef: string) => ({
      status: "observed" as const,
      request: {
        binding: { providerId: "github", changeRequestId },
        repository: "owner/repository",
        headRepository: "owner/repository",
        headRef: changeRequestId === effect.changeRequestId
          ? effect.headRef : state.members[0]!.ref!.replace(/^refs\/heads\//u, ""),
        headSha: changeRequestId === effect.changeRequestId
          ? effect.headSha : state.members[0]!.coordinates!.head,
        baseRef: changeRequestId === effect.changeRequestId ? topBaseRef : "main",
        state: changeRequestId === effect.changeRequestId ? "open" as const : "merged" as const,
        draft: true,
      },
    });
    const triggerBranch = effect.triggerRef.replace(/^refs\/heads\//u, "");
    for (const [baseRef, outcome] of [["main", "applied"], ["member-1", "not-applied"]] as const) {
      const dependencies = exactDependencies(state);
      dependencies.remoteHeads = Object.fromEntries(
        Object.entries(dependencies.remoteHeads).filter(([branch]) => branch !== triggerBranch),
      );
      dependencies.localCommits = Object.fromEntries(
        Object.entries(dependencies.localCommits).filter(([head]) => head !== effect.triggerHeadSha),
      );
      dependencies.host.readRequest.mockImplementation(async (_repository, binding) => (
        requestFor(binding.changeRequestId, baseRef)
      ));
      await expect(observeRepositoryDeliveryPosition(plan, reserved.state, 8, dependencies))
        .resolves.toMatchObject({
          status: "observed",
          operationObservation: { outcome },
          projectedState: { activeOperation: null },
        });
    }
    const ambiguous = exactDependencies(state);
    ambiguous.remoteHeads = Object.fromEntries(
      Object.entries(ambiguous.remoteHeads).filter(([branch]) => branch !== triggerBranch),
    );
    ambiguous.localCommits = Object.fromEntries(
      Object.entries(ambiguous.localCommits).filter(([head]) => head !== effect.triggerHeadSha),
    );
    ambiguous.host.readRequest.mockImplementation(async (_repository, binding) => (
      requestFor(binding.changeRequestId, binding.changeRequestId === effect.changeRequestId ? "release" : "main")
    ));
    await expect(observeRepositoryDeliveryPosition(plan, reserved.state, 8, ambiguous))
      .resolves.toEqual({ status: "refused" });
  });

  it("classifies retained-binding teardown from the physical ref outcome", async () => {
    const plan = deliveryStackPlanFixture();
    const initial = deliveryStateFixture(plan);
    const state = {
      ...initial,
      members: initial.members.map((member, index) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(401 + index) },
      })),
    };
    const member = state.members[1]!;
    const before = { target: state.target, members: [member] };
    const reserved = reserveDeliveryOperation({ revision: 7, value: state }, plan, {
      operationId: "teardown-1",
      kind: "teardown",
      mode: "member",
      candidateHeads: [],
      affectedDeliverableIds: [member.deliverableId],
      expectedStateRevision: 7,
      before,
      requested: before,
    });
    expect(reserved.status).toBe("reserved");
    if (reserved.status !== "reserved") return;
    const requestFor = (changeRequestId: string) => {
      const requestedMember = state.members.find((candidate) => (
        candidate.changeRequest?.changeRequestId === changeRequestId
      ))!;
      return {
        status: "observed" as const,
        request: {
          binding: requestedMember.changeRequest!,
          repository: "owner/repository",
          headRepository: "owner/repository",
          headRef: requestedMember.ref!.replace(/^refs\/heads\//u, ""),
          headSha: requestedMember.coordinates!.head,
          baseRef: requestedMember.deliverableId === state.members[0]!.deliverableId
            ? state.target!.ref.replace(/^refs\/heads\//u, "")
            : state.members[state.members.indexOf(requestedMember) - 1]!.ref!.replace(/^refs\/heads\//u, ""),
          state: changeRequestId === "401" || changeRequestId === "402"
            ? "merged" as const
            : "open" as const,
          draft: true,
        },
      };
    };
    const present = exactDependencies(state);
    present.host.readRequest.mockImplementation(async (_repository, binding) => (
      requestFor(binding.changeRequestId)
    ));
    await expect(observeRepositoryDeliveryPosition(plan, reserved.state, 8, present))
      .resolves.toMatchObject({
        status: "observed",
        operationObservation: { outcome: "not-applied" },
        projectedState: { activeOperation: null },
      });

    const absent = exactDependencies(state);
    const branch = member.ref!.replace(/^refs\/heads\//u, "");
    absent.remoteHeads = Object.fromEntries(
      Object.entries(absent.remoteHeads).filter(([candidate]) => candidate !== branch),
    );
    absent.localCommits = Object.fromEntries(
      Object.entries(absent.localCommits).filter(([head]) => head !== member.coordinates!.head),
    );
    absent.host.readRequest.mockImplementation(async (_repository, binding) => (
      requestFor(binding.changeRequestId)
    ));
    await expect(observeRepositoryDeliveryPosition(plan, reserved.state, 8, absent))
      .resolves.toMatchObject({
        status: "observed",
        operationObservation: { outcome: "applied", snapshot: before },
        projectedState: { activeOperation: null },
      });

    const moved = exactDependencies(state);
    moved.remoteHeads[branch] = "f".repeat(40);
    moved.host.readRequest.mockImplementation(async (_repository, binding) => (
      requestFor(binding.changeRequestId)
    ));
    await expect(observeRepositoryDeliveryPosition(plan, reserved.state, 8, moved))
      .resolves.toEqual({ status: "refused" });
    await expect(observeRepositoryDeliveryPosition(plan, reserved.state, 8, moved, {
      terminalAuthoringMovement: "allow-append-only",
    })).resolves.toEqual({ status: "refused" });
  });
});
