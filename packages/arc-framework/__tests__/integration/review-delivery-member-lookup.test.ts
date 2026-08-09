import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DeliveryStateV1Schema,
  type DeliveryStateV1,
} from "../../src/lib/delivery/schema.js";
import { RepositoryDeliveryStateStore } from "../../src/lib/delivery/local-stores.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { RepositoryDeliveryMemberLookup } from "../../src/scripts/review-gate/hosts/local/delivery-member-lookup.js";
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

async function publish(cwd: string, value: DeliveryStateV1): Promise<void> {
  const store = new RepositoryDeliveryStateStore(
    new RepositoryGitCommonStatePublisher(makeGitExec(cwd), cwd),
  );
  const published = await store.publish(value.planId, value, 0);
  expect(published.status).toBe("ok");
}

function state(options: {
  readonly heads?: readonly string[];
  readonly planId?: string;
  readonly workUnitId?: string;
} = {}): DeliveryStateV1 {
  const planId = options.planId ?? PLAN_ID;
  const heads = options.heads ?? [FIRST_HEAD];
  return DeliveryStateV1Schema.parse({
    schemaVersion: 1,
    semanticsVersion: "delivery-state/v1",
    planId,
    workUnitId: options.workUnitId ?? "delivery-plan-record",
    boundPlan: { planRevision: 1, planDigest: canonicalDigest({ planId, revision: 1 }) },
    target: null,
    members: heads.map((head, index) => ({
      deliverableId: canonicalDigest({ member: index, planId }),
      ref: `opaque-member-${index}`,
      changeRequest: null,
      coordinates: { base: BASE, head, tree: TREE },
    })),
    activeOperation: null,
  });
}

describe("repository delivery member lookup", () => {
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
        head: FIRST_HEAD,
        isFinalMember: false,
      },
    });
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
      member: { isFinalMember: true },
    });
    await expect(lookup.resolveMemberByHead(FIRST_HEAD)).resolves.toMatchObject({
      status: "resolved",
      member: { isFinalMember: false },
    });
  });

  it("reports an ambiguous match as unavailable rather than picking a candidate", async () => {
    const { cwd, lookup } = await repository();
    await publish(cwd, state());
    await publish(cwd, state({ planId: OTHER_PLAN_ID, workUnitId: "another-work-unit" }));

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
      workUnitId: "another-work-unit",
    }));

    await expect(first.lookup.resolveMemberByHead(FIRST_HEAD)).resolves.toMatchObject({
      status: "resolved",
      member: { planId: PLAN_ID, workUnitId: "delivery-plan-record" },
    });
    await expect(first.lookup.resolveMemberByHead(SECOND_HEAD)).resolves.toEqual({ status: "unbound" });
    await expect(second.lookup.resolveMemberByHead(SECOND_HEAD)).resolves.toMatchObject({
      status: "resolved",
      member: { planId: OTHER_PLAN_ID, workUnitId: "another-work-unit" },
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
