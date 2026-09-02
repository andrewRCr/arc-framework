import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DeliveryStateV1Schema,
  type DeliveryPlanV1,
  type DeliveryStateV1,
} from "../../src/lib/delivery/schema.js";
import {
  RepositoryDeliveryPlanStore,
  RepositoryDeliveryStateStore,
} from "../../src/lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../../src/lib/delivery/plan.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { RepositoryDeliveryMemberLookup } from "../../src/scripts/review-gate/hosts/local/delivery-member-lookup.js";
import { resolveReviewHeadRef } from "../../src/scripts/review-gate/core/review-subject.js";
import { deliveryPlanFixture } from "../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../fixtures/delivery-state.js";
import { cleanupTempDir, createTempRepo, makeGitExec } from "../helpers/integration.js";

const PLAN_ID = "8ddfd842-4c92-4ccb-9958-ae47b43e2c44";
const OTHER_PLAN_ID = "f7f35d3f-8d46-4443-b36b-c4e7d463d5b8";
const FIRST_HEAD = "a".repeat(40);
const SECOND_HEAD = "d".repeat(40);
const BASE = "c".repeat(40);
const TREE = "b".repeat(40);

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

async function repository(): Promise<{ cwd: string; lookup: RepositoryDeliveryMemberLookup }> {
  const cwd = await createTempRepo("arc-review-delivery-lookup-");
  roots.push(cwd);
  return { cwd, lookup: new RepositoryDeliveryMemberLookup({ exec: makeGitExec(cwd), cwd }) };
}

function stateDirectory(cwd: string): string {
  return join(cwd, ".git", "arc", "delivery", "state");
}

async function writeStateRecord(cwd: string, recordName: string, content: string): Promise<void> {
  await mkdir(stateDirectory(cwd), { recursive: true });
  await writeFile(join(stateDirectory(cwd), recordName), content, "utf8");
}

async function publishStateOnly(cwd: string, value: DeliveryStateV1, expectedRevision = 0): Promise<void> {
  const store = new RepositoryDeliveryStateStore(
    new RepositoryGitCommonStatePublisher(makeGitExec(cwd), cwd),
  );
  const published = await store.publish(value.planId, value, expectedRevision);
  expect(published.status).toBe("ok");
}

async function publishPlan(cwd: string, plan: DeliveryPlanV1): Promise<void> {
  const store = new RepositoryDeliveryPlanStore(
    new RepositoryGitCommonStatePublisher(makeGitExec(cwd), cwd),
    DeliveryPlanV1Codec,
  );
  const published = await store.publishCurrent(plan.planId, plan, null);
  expect(published.status).toBe("ok");
}

async function publish(cwd: string, value: DeliveryStateV1, expectedRevision = 0): Promise<void> {
  const store = new RepositoryDeliveryPlanStore(
    new RepositoryGitCommonStatePublisher(makeGitExec(cwd), cwd),
    DeliveryPlanV1Codec,
  );
  const existing = await store.readCurrent(value.planId);
  expect(existing.status).toBe("ok");
  if (existing.status === "ok" && existing.value === null) {
    await publishPlan(cwd, deliveryPlanFixture(value.planId));
  }
  await publishStateOnly(cwd, value, expectedRevision);
}

function state(options: {
  readonly heads?: readonly string[];
  readonly planId?: string;
} = {}): DeliveryStateV1 {
  const planId = options.planId ?? PLAN_ID;
  const current = deliveryStateFixture(deliveryPlanFixture(planId));
  const heads = options.heads ?? [FIRST_HEAD, "e".repeat(40)];
  current.target = { ref: "refs/heads/main", coordinates: null };
  for (const [index, member] of current.members.entries()) {
    member.ref = `refs/heads/delivery/example/member-${index}`;
    member.coordinates = {
      base: BASE,
      head: heads[index] ?? "e".repeat(40),
      tree: TREE,
    };
  }
  return DeliveryStateV1Schema.parse(current);
}

describe("repository delivery member lookup", () => {
  it("returns one coherent plan and state for terminal integration", async () => {
    const { cwd, lookup } = await repository();
    const plan = deliveryPlanFixture();
    const current = deliveryStateFixture(plan);
    await publishPlan(cwd, plan);
    await publish(cwd, current);

    await expect(lookup.resolveTerminalRecords(plan.workUnitId)).resolves.toEqual({
      status: "resolved",
      plan,
      state: current,
    });
  });

  it("reports a work unit without a terminal delivery record as unbound", async () => {
    const { cwd, lookup } = await repository();
    const plan = deliveryPlanFixture();
    await publishPlan(cwd, plan);

    await expect(lookup.resolveTerminalRecords(plan.workUnitId))
      .resolves.toEqual({ status: "unbound" });
  });

  it("re-derives every retained bound member target on each read", async () => {
    const { cwd, lookup } = await repository();
    const plan = deliveryPlanFixture();
    const initial = deliveryStateFixture(plan);
    initial.members[0]!.changeRequest = { providerId: "github", changeRequestId: "41" };
    initial.members[1]!.ref = null;
    await publishPlan(cwd, plan);
    await publish(cwd, initial);

    await expect(lookup.resolveDischargeTargets(plan.workUnitId)).resolves.toMatchObject({
      status: "resolved",
      targets: [{ deliverableId: plan.members[0]!.deliverableId, changeRequestId: "41" }],
    });

    const rebound = structuredClone(initial);
    rebound.members[1]!.changeRequest = { providerId: "github", changeRequestId: "42" };
    await publish(cwd, rebound, 1);

    await expect(lookup.resolveDischargeTargets(plan.workUnitId)).resolves.toMatchObject({
      status: "resolved",
      targets: [
        { deliverableId: plan.members[0]!.deliverableId, changeRequestId: "41" },
        { deliverableId: plan.members[1]!.deliverableId, ref: null, changeRequestId: "42" },
      ],
    });
  });

  it("reports an absent delivery work unit as authoritatively unbound", async () => {
    const { lookup } = await repository();
    await expect(lookup.resolveDischargeTargets("ordinary-work-unit"))
      .resolves.toEqual({ status: "unbound" });
  });

  it("refuses a bound head when its current plan is unavailable", async () => {
    const { cwd, lookup } = await repository();
    await publishStateOnly(cwd, state());

    await expect(lookup.resolveMemberByHead(FIRST_HEAD))
      .resolves.toEqual({ status: "unavailable" });
  });

  it("refuses a bound head when state no longer matches the current plan revision or order", async () => {
    const staleRevision = await repository();
    const plan = deliveryPlanFixture(PLAN_ID);
    const staleState = state();
    staleState.boundPlan.planDigest = canonicalDigest({ stale: "plan" });
    await publishPlan(staleRevision.cwd, plan);
    await publishStateOnly(staleRevision.cwd, staleState);
    await expect(staleRevision.lookup.resolveMemberByHead(FIRST_HEAD))
      .resolves.toEqual({ status: "unavailable" });

    const staleOrder = await repository();
    const reordered = state();
    reordered.members.reverse();
    await publishPlan(staleOrder.cwd, plan);
    await publishStateOnly(staleOrder.cwd, reordered);
    await expect(staleOrder.lookup.resolveMemberByHead(FIRST_HEAD))
      .resolves.toEqual({ status: "unavailable" });
  });

  it("resolves a bound head to its owning plan, member, work unit, and recorded commits", async () => {
    const { cwd, lookup } = await repository();
    const current = state({ heads: [FIRST_HEAD, SECOND_HEAD] });
    await publish(cwd, current);

    await expect(lookup.resolveMemberByHead(FIRST_HEAD)).resolves.toEqual({
      status: "resolved",
      member: {
        planId: PLAN_ID,
        deliverableId: current.members[0]!.deliverableId,
        workUnitId: "delivery-plan-record",
        base: BASE,
        baseRef: "main",
        headRef: "delivery/example/member-0",
        head: FIRST_HEAD,
        candidateHead: SECOND_HEAD,
        isFinalMember: false,
      },
    });
  });

  it("keeps a bound member resolvable while terminal Candidate coordinates are absent", async () => {
    const { cwd, lookup } = await repository();
    const initial = state({ heads: [FIRST_HEAD, SECOND_HEAD] });
    const current = {
      ...initial,
      members: initial.members.map((member, index) => index === 1
        ? { ...member, coordinates: null }
        : member),
    };
    await publish(cwd, current);

    await expect(lookup.resolveMemberByHead(FIRST_HEAD)).resolves.toMatchObject({
      status: "resolved",
      member: {
        head: FIRST_HEAD,
        candidateHead: null,
        isFinalMember: false,
      },
    });
  });


  it("selects the retained member branch while running from the originating checkout", async () => {
    const { cwd, lookup } = await repository();
    await publish(cwd, state({ heads: [FIRST_HEAD, SECOND_HEAD] }));

    const resolved = await lookup.resolveMemberByHead(FIRST_HEAD);
    expect(resolved.status).toBe("resolved");
    if (resolved.status !== "resolved") return;
    expect(resolveReviewHeadRef("feat/delivery-plan-record", resolved.member))
      .toBe("delivery/example/member-0");
  });

  it("answers unbound for a head no member holds, distinct from unavailable", async () => {
    const { cwd, lookup } = await repository();
    await publish(cwd, state());

    await expect(lookup.resolveMemberByHead(SECOND_HEAD)).resolves.toEqual({ status: "unbound" });
  });

  it("marks only the last member of the state's member list as final", async () => {
    const { cwd, lookup } = await repository();
    await publish(cwd, state({ heads: [FIRST_HEAD, SECOND_HEAD] }));

    await expect(lookup.resolveMemberByHead(SECOND_HEAD)).resolves.toMatchObject({
      status: "resolved",
      member: { baseRef: "delivery/example/member-0", candidateHead: SECOND_HEAD, isFinalMember: true },
    });
    await expect(lookup.resolveMemberByHead(FIRST_HEAD)).resolves.toMatchObject({
      status: "resolved",
      member: { candidateHead: SECOND_HEAD, isFinalMember: false },
    });
  });

  it("reports an ambiguous match as unavailable rather than picking a candidate", async () => {
    const { cwd, lookup } = await repository();
    await publish(cwd, state());
    await publish(cwd, state({ planId: OTHER_PLAN_ID }));

    await expect(lookup.resolveMemberByHead(FIRST_HEAD)).resolves.toEqual({ status: "unavailable" });
  });

  it("reports a malformed record, a corrupt namespace, and an identity mismatch as unavailable", async () => {
    const malformed = await repository();
    await writeStateRecord(malformed.cwd, `${PLAN_ID}.json`, "{}\n");
    await expect(malformed.lookup.resolveMemberByHead(FIRST_HEAD))
      .resolves.toEqual({ status: "unavailable" });

    const corrupt = await repository();
    await publish(corrupt.cwd, state());
    await mkdir(join(stateDirectory(corrupt.cwd), "unexpected-directory"), { recursive: true });
    await expect(corrupt.lookup.resolveMemberByHead(FIRST_HEAD))
      .resolves.toEqual({ status: "unavailable" });

    const mismatched = await repository();
    await publish(mismatched.cwd, state());
    await writeStateRecord(
      mismatched.cwd,
      `${OTHER_PLAN_ID}.json`,
      `${JSON.stringify({
        schemaVersion: 1,
        semanticsVersion: "delivery-state-store/v1",
        planId: OTHER_PLAN_ID,
        revision: 1,
        value: state(),
      })}\n`,
    );
    await expect(mismatched.lookup.resolveMemberByHead(FIRST_HEAD))
      .resolves.toEqual({ status: "unavailable" });
  });

  it("reports an unreadable state directory as unavailable", async () => {
    const { cwd, lookup } = await repository();
    await publish(cwd, state());
    await chmod(stateDirectory(cwd), 0o000);
    try {
      await expect(lookup.resolveMemberByHead(FIRST_HEAD)).resolves.toEqual({ status: "unavailable" });
    } finally {
      await chmod(stateDirectory(cwd), 0o700);
    }
  });

  it("resolves each port against the repository root it was constructed with", async () => {
    const first = await repository();
    const second = await repository();
    await publish(first.cwd, state());
    await publish(second.cwd, state({
      heads: [SECOND_HEAD],
      planId: OTHER_PLAN_ID,
    }));

    await expect(first.lookup.resolveMemberByHead(FIRST_HEAD)).resolves.toMatchObject({
      status: "resolved",
      member: { planId: PLAN_ID, workUnitId: "delivery-plan-record" },
    });
    await expect(first.lookup.resolveMemberByHead(SECOND_HEAD)).resolves.toEqual({ status: "unbound" });
    await expect(second.lookup.resolveMemberByHead(SECOND_HEAD)).resolves.toMatchObject({
      status: "resolved",
      member: { planId: OTHER_PLAN_ID, workUnitId: "delivery-plan-record" },
    });
    await expect(second.lookup.resolveMemberByHead(FIRST_HEAD)).resolves.toEqual({ status: "unbound" });
  });

  it("reports a root that is not a repository as unavailable rather than throwing", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "arc-review-delivery-lookup-bare-"));
    roots.push(cwd);
    const lookup = new RepositoryDeliveryMemberLookup({ exec: makeGitExec(cwd), cwd });

    await expect(lookup.resolveMemberByHead(FIRST_HEAD)).resolves.toEqual({ status: "unavailable" });
  });
});
