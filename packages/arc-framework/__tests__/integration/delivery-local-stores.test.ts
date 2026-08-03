import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";
import { afterEach, describe, expect, it } from "vitest";

import {
  DeliveryAssignmentsV1Codec,
  type DeliveryAssignmentsV1,
} from "../../src/lib/delivery/assignment.js";
import { RepositoryDeliveryAssuranceStore } from "../../src/lib/delivery/assurance-store.js";
import { deriveMemberAssuranceSubjectId } from "../../src/lib/delivery/identity.js";
import {
  RepositoryDeliveryAssignmentStore,
  RepositoryDeliveryObservationStore,
  RepositoryDeliveryPlanStore,
} from "../../src/lib/delivery/local-stores.js";
import type {
  DeliveryPayloadCodec,
  DeliveryPlanPayloadCodec,
} from "../../src/lib/delivery/ports.js";
import { atomicWriteFile } from "../../src/lib/fs.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import {
  RepositoryGitCommonStatePublisher,
  type GitCommonStatePublisher,
  type GitCommonStatePublisherIO,
} from "../../src/lib/git-common-state.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";

const roots: string[] = [];
const ASSIGNMENT_PLAN_ID = "8ddfd842-4c92-4ccb-9958-ae47b43e2c44";
const OTHER_ASSIGNMENT_PLAN_ID = "f7f35d3f-8d46-4443-b36b-c4e7d463d5b8";

const PlanValueSchema = z.strictObject({
  planId: z.string(),
  planDigest: z.string(),
  body: z.string(),
});
type PlanValue = z.infer<typeof PlanValueSchema>;

const RevisionedValueSchema = z.strictObject({
  planId: z.string(),
  body: z.string(),
});
type RevisionedValue = z.infer<typeof RevisionedValueSchema>;

const KeyOrderedValueSchema = z.strictObject({
  planId: z.string(),
  body: z.record(z.string(), z.string()),
});
type KeyOrderedValue = z.infer<typeof KeyOrderedValueSchema>;

const planCodec: DeliveryPlanPayloadCodec<PlanValue> = {
  decode: (value) => {
    const parsed = PlanValueSchema.safeParse(value);
    return parsed.success
      ? { status: "decoded", value: parsed.data }
      : { status: "refused" };
  },
  planId: (value) => value.planId,
  digest: (value) => canonicalDigest({ planDigest: value.planDigest }),
};

const revisionedCodec: DeliveryPayloadCodec<RevisionedValue> = {
  decode: (value) => {
    const parsed = RevisionedValueSchema.safeParse(value);
    return parsed.success
      ? { status: "decoded", value: parsed.data }
      : { status: "refused" };
  },
  planId: (value) => value.planId,
};

const keyOrderedCodec: DeliveryPayloadCodec<KeyOrderedValue> = {
  decode: (value) => {
    const parsed = KeyOrderedValueSchema.safeParse(value);
    return parsed.success
      ? { status: "decoded", value: parsed.data }
      : { status: "refused" };
  },
  planId: (value) => value.planId,
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

async function stores(io: Partial<GitCommonStatePublisherIO> = {}) {
  const root = await mkdtemp(join(tmpdir(), "arc-delivery-local-stores-"));
  roots.push(root);
  const commonDir = join(root, "common.git");
  const exec: GitExec = async () => ({ stdout: `${commonDir}\n` });
  const publisher = new RepositoryGitCommonStatePublisher(exec, root, io);
  return {
    root,
    commonDir,
    publisher,
    plans: new RepositoryDeliveryPlanStore(publisher, planCodec),
    assignments: new RepositoryDeliveryAssignmentStore(publisher),
    assurance: new RepositoryDeliveryAssuranceStore(publisher, revisionedCodec),
    observations: new RepositoryDeliveryObservationStore(publisher, revisionedCodec),
  };
}

function plan(planId: string, body: string): PlanValue {
  return {
    planId,
    planDigest: canonicalDigest({ planId, body }),
    body,
  };
}

function assignment(
  generation: number,
  options: {
    readonly changeRequestId?: string;
    readonly head?: string;
    readonly materialized?: boolean;
    readonly memberLabel?: string;
    readonly planId?: string;
    readonly ref?: string;
    readonly workUnitId?: string;
  } = {},
): DeliveryAssignmentsV1 {
  const planId = options.planId ?? ASSIGNMENT_PLAN_ID;
  const deliverableId = canonicalDigest({ member: options.memberLabel ?? "member-1" });
  const assuranceSubjectId = deriveMemberAssuranceSubjectId(planId, deliverableId);
  const decoded = DeliveryAssignmentsV1Codec.decode({
    schemaVersion: 1,
    semanticsVersion: "delivery-assignments/v1",
    planId,
    workUnitId: options.workUnitId ?? "delivery-plan-record",
    host: { adapterId: "github", providerBinding: { repository: "arc-framework" } },
    terminalTarget: {
      sourceRef: "refs/heads/feat/delivery-plan-record",
      destinationRef: "refs/heads/main",
    },
    members: options.materialized === false ? [] : [{
      deliverableId,
      assuranceSubjectId,
      ref: options.ref ?? "refs/heads/feat/delivery-plan-record-record-substrate",
      assignedHeadObjectId: options.head ?? "a".repeat(40),
      changeRequestHandles: options.changeRequestId === undefined
        ? []
        : [{ providerId: "github", changeRequestId: options.changeRequestId }],
      materializationGeneration: generation,
      reviewRouting: { routeId: "standard", binding: {} },
    }],
    generationHighWater: [{ assuranceSubjectId, generation }],
  });
  if (decoded.status === "refused") throw new Error("invalid assignment fixture");
  return decoded.value;
}

function okValue<T>(
  result: { readonly status: "ok"; readonly value: T } | { readonly status: "refused"; readonly reason: string },
): T {
  expect(result.status).toBe("ok");
  if (result.status !== "ok") throw new Error(`expected ok result, received ${result.reason}`);
  return result.value;
}

describe("repository delivery record stores", () => {
  it("publishes a first plan and only accepts a successor naming the current digest", async () => {
    const records = await stores();
    const first = plan("plan-1", "first");
    const second = plan("plan-1", "second");
    const stale = plan("plan-1", "stale");

    await expect(records.plans.readCurrent("plan-1")).resolves.toEqual({
      status: "ok",
      value: null,
    });
    await expect(records.plans.publishCurrent("plan-1", first, null)).resolves.toEqual({
      status: "ok",
      value: { currentDigest: planCodec.digest(first) },
    });
    await expect(records.plans.publishCurrent(
      "plan-1",
      second,
      planCodec.digest(first),
    )).resolves.toEqual({
      status: "ok",
      value: { currentDigest: planCodec.digest(second) },
    });
    await expect(records.plans.publishCurrent(
      "plan-1",
      stale,
      planCodec.digest(first),
    )).resolves.toEqual({ status: "refused", reason: "version-conflict" });
    await expect(records.plans.readCurrent("plan-1")).resolves.toEqual({
      status: "ok",
      value: second,
    });
  });

  it("increments assignments under an expected integer revision", async () => {
    const records = await stores();
    const first = assignment(1);
    const second = assignment(1, { changeRequestId: "pull/401" });

    await expect(records.assignments.read(ASSIGNMENT_PLAN_ID)).resolves.toEqual({ status: "ok", value: null });
    await expect(records.assignments.publish(ASSIGNMENT_PLAN_ID, first, 0)).resolves.toEqual({
      status: "ok",
      value: { revision: 1, value: first },
    });
    await expect(records.assignments.publish(ASSIGNMENT_PLAN_ID, second, 1)).resolves.toEqual({
      status: "ok",
      value: { revision: 2, value: second },
    });
    await expect(records.assignments.publish(ASSIGNMENT_PLAN_ID, first, 1))
      .resolves.toEqual({ status: "refused", reason: "version-conflict" });
  });

  it("increments observations under an expected integer revision", async () => {
    const records = await stores();
    const first = { planId: "plan-1", body: "first" };
    const second = { planId: "plan-1", body: "second" };

    await expect(records.observations.read("plan-1")).resolves.toEqual({ status: "ok", value: null });
    await expect(records.observations.publish("plan-1", first, 0)).resolves.toMatchObject({ status: "ok" });
    await expect(records.observations.publish("plan-1", second, 1)).resolves.toMatchObject({ status: "ok" });
    await expect(records.observations.publish("plan-1", { planId: "plan-1", body: "stale" }, 1))
      .resolves.toEqual({ status: "refused", reason: "version-conflict" });
  });

  it("treats byte-identical republishes as idempotent before version checks", async () => {
    const records = await stores();
    const firstPlan = plan("plan-1", "first");
    const assigned = assignment(1);
    const revisioned = { planId: "plan-1", body: "first" };
    await records.plans.publishCurrent("plan-1", firstPlan, null);
    await records.assignments.publish(ASSIGNMENT_PLAN_ID, assigned, 0);
    await records.observations.publish("plan-1", revisioned, 0);

    const paths = [
      join(records.commonDir, "arc", "delivery", "plans", "plan-1.json"),
      join(records.commonDir, "arc", "delivery", "assignments", `${ASSIGNMENT_PLAN_ID}.json`),
      join(records.commonDir, "arc", "delivery", "observations", "plan-1.json"),
    ];
    const before = await Promise.all(paths.map(async (path) => readFile(path, "utf8")));

    await expect(records.plans.publishCurrent(
      "plan-1",
      firstPlan,
      canonicalDigest({ stale: true }),
    )).resolves.toEqual({
      status: "ok",
      value: { currentDigest: planCodec.digest(firstPlan) },
    });
    await expect(records.assignments.publish(ASSIGNMENT_PLAN_ID, assigned, 99)).resolves.toEqual({
      status: "ok",
      value: { revision: 1, value: assigned },
    });
    await expect(records.observations.publish("plan-1", revisioned, 99)).resolves.toEqual({
      status: "ok",
      value: { revision: 1, value: revisioned },
    });
    await expect(Promise.all(paths.map(async (path) => readFile(path, "utf8")))).resolves.toEqual(before);
  });

  it("allows only one of two concurrent plan successors to become current", async () => {
    const records = await stores({
      writeFile: async (path, content) => {
        if (typeof content === "string" && /"body":"(?:second|third)"/u.test(content)) {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        await atomicWriteFile(path, content);
      },
    });
    const first = plan("plan-1", "first");
    const second = plan("plan-1", "second");
    const third = plan("plan-1", "third");
    await records.plans.publishCurrent("plan-1", first, null);

    const results = await Promise.all([
      records.plans.publishCurrent("plan-1", second, planCodec.digest(first)),
      records.plans.publishCurrent("plan-1", third, planCodec.digest(first)),
    ]);

    expect(results.filter((result) => result.status === "ok")).toHaveLength(1);
    expect(results.filter((result) => result.status === "refused")).toEqual([
      { status: "refused", reason: "version-conflict" },
    ]);
    const current = await records.plans.readCurrent("plan-1");
    expect(current).toMatchObject({ status: "ok" });
    if (current.status !== "ok" || current.value === null) return;
    expect([second, third]).toContainEqual(current.value);
  });

  it("allows only one concurrent assignment successor under the namespace lock", async () => {
    const records = await stores({
      writeFile: async (path, content) => {
        if (typeof content === "string" && /"changeRequestId":"pull\/(?:second|third)"/u.test(content)) {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        await atomicWriteFile(path, content);
      },
    });
    await records.assignments.publish(ASSIGNMENT_PLAN_ID, assignment(1), 0);

    const results = await Promise.all([
      records.assignments.publish(ASSIGNMENT_PLAN_ID, assignment(1, { changeRequestId: "pull/second" }), 1),
      records.assignments.publish(ASSIGNMENT_PLAN_ID, assignment(1, { changeRequestId: "pull/third" }), 1),
    ]);

    expect(results.filter((result) => result.status === "ok")).toHaveLength(1);
    expect(results.filter((result) => result.status === "refused")).toEqual([
      { status: "refused", reason: "version-conflict" },
    ]);
  });

  it("allows only one concurrent observation successor under the namespace lock", async () => {
    const records = await stores();
    await records.observations.publish("plan-1", { planId: "plan-1", body: "first" }, 0);
    const results = await Promise.all([
      records.observations.publish("plan-1", { planId: "plan-1", body: "second" }, 1),
      records.observations.publish("plan-1", { planId: "plan-1", body: "third" }, 1),
    ]);
    expect(results.filter((result) => result.status === "ok")).toHaveLength(1);
    expect(results.filter((result) => result.status === "refused")).toHaveLength(1);
  });

  it("leaves no partial record when publication fails after locking", async () => {
    const crash = new Error("simulated publication crash");
    const records = await stores({
      writeFile: async () => {
        throw crash;
      },
    });

    await expect(records.plans.publishCurrent("plan-1", plan("plan-1", "first"), null))
      .rejects.toBe(crash);
    await expect(records.assignments.publish(
      ASSIGNMENT_PLAN_ID,
      assignment(1),
      0,
    )).rejects.toBe(crash);
    await expect(records.observations.publish(
      "plan-3",
      { planId: "plan-3", body: "first" },
      0,
    )).rejects.toBe(crash);

    await expect(records.plans.readCurrent("plan-1")).resolves.toEqual({ status: "ok", value: null });
    await expect(records.assignments.read(ASSIGNMENT_PLAN_ID)).resolves.toEqual({ status: "ok", value: null });
    await expect(records.observations.read("plan-3")).resolves.toEqual({ status: "ok", value: null });
  });

  it("enumerates validated current plans in canonical plan-id order", async () => {
    const records = await stores();
    const second = plan("plan-b", "second");
    const first = plan("plan-a", "first");
    await records.plans.publishCurrent("plan-b", second, null);
    await records.plans.publishCurrent("plan-a", first, null);

    await expect(records.plans.enumerateCurrent()).resolves.toEqual({
      status: "ok",
      value: [first, second],
    });
  });

  it("distinguishes malformed payloads from addressed-plan identity mismatches", async () => {
    const records = await stores();
    await records.publisher.update(
      { root: "delivery", namespace: "plans" },
      "plan-1.json",
      () => ({ kind: "write", content: "{", result: undefined }),
    );
    await records.publisher.update(
      { root: "delivery", namespace: "assignments" },
      `${OTHER_ASSIGNMENT_PLAN_ID}.json`,
      () => ({
        kind: "write",
        content: `${JSON.stringify({
          schemaVersion: 1,
          semanticsVersion: "delivery-assignment-store/v1",
          planId: OTHER_ASSIGNMENT_PLAN_ID,
          revision: 1,
          value: assignment(1),
        })}\n`,
        result: undefined,
      }),
    );
    await records.publisher.update(
      { root: "delivery", namespace: "observations" },
      "plan-3.json",
      () => ({
        kind: "write",
        content: `${JSON.stringify({
          schemaVersion: 1,
          semanticsVersion: "delivery-observation-store/v1",
          planId: "plan-3",
          revision: 1,
          value: { planId: "plan-3", body: 3 },
        })}\n`,
        result: undefined,
      }),
    );

    await expect(records.plans.readCurrent("plan-1")).resolves.toEqual({
      status: "refused",
      reason: "record-malformed",
    });
    await expect(records.assignments.read(OTHER_ASSIGNMENT_PLAN_ID)).resolves.toEqual({
      status: "refused",
      reason: "identity-mismatch",
    });
    await expect(records.observations.read("plan-3")).resolves.toEqual({
      status: "refused",
      reason: "record-malformed",
    });
  });

  it("refuses a plan namespace containing an invalid record entry", async () => {
    const records = await stores();
    const directory = join(records.commonDir, "arc", "delivery", "plans");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "INVALID.json"), "{}\n", "utf8");

    await expect(records.plans.enumerateCurrent()).resolves.toEqual({
      status: "refused",
      reason: "namespace-corrupt",
    });
  });

  it("appends assurance entries against the current predecessor digest", async () => {
    const records = await stores();
    const first = { planId: "plan-1", body: "first" };
    const second = { planId: "plan-1", body: "second" };

    const firstResult = await records.assurance.append("plan-1", first, null);
    expect(firstResult).toMatchObject({
      status: "ok",
      value: { predecessorDigest: null, value: first },
    });
    const firstEntry = okValue(firstResult);
    const secondResult = await records.assurance.append(
      "plan-1",
      second,
      firstEntry.entryDigest,
    );
    expect(secondResult).toMatchObject({
      status: "ok",
      value: { predecessorDigest: firstEntry.entryDigest, value: second },
    });
    await expect(records.assurance.append(
      "plan-1",
      { planId: "plan-1", body: "stale" },
      firstEntry.entryDigest,
    )).resolves.toEqual({ status: "refused", reason: "predecessor-conflict" });
  });

  it("binds assurance entry digests to both payload and predecessor", async () => {
    const firstRecords = await stores();
    const secondRecords = await stores();
    const thirdRecords = await stores();
    const target = { planId: "plan-1", body: "target" };

    const withoutPredecessor = await firstRecords.assurance.append("plan-1", target, null);
    const differentPayload = await secondRecords.assurance.append(
      "plan-1",
      { planId: "plan-1", body: "different" },
      null,
    );
    const prefix = await thirdRecords.assurance.append(
      "plan-1",
      { planId: "plan-1", body: "prefix" },
      null,
    );
    const withoutPredecessorEntry = okValue(withoutPredecessor);
    const differentPayloadEntry = okValue(differentPayload);
    const prefixEntry = okValue(prefix);
    const withPredecessor = await thirdRecords.assurance.append(
      "plan-1",
      target,
      prefixEntry.entryDigest,
    );
    const withPredecessorEntry = okValue(withPredecessor);

    expect(withoutPredecessorEntry.entryDigest).not.toBe(differentPayloadEntry.entryDigest);
    expect(withoutPredecessorEntry.entryDigest).not.toBe(withPredecessorEntry.entryDigest);
  });

  it("treats an identical assurance append replay as idempotent", async () => {
    const records = await stores();
    const value = { planId: "plan-1", body: "first" };
    const first = await records.assurance.append("plan-1", value, null);
    const replay = await records.assurance.append("plan-1", value, null);

    expect(replay).toEqual(first);
    await expect(records.assurance.read("plan-1")).resolves.toMatchObject({
      status: "ok",
      value: { entries: [expect.objectContaining({ value })] },
    });
  });

  it("treats a canonical-equivalent assurance append replay as idempotent", async () => {
    const records = await stores();
    const assurance = new RepositoryDeliveryAssuranceStore(records.publisher, keyOrderedCodec);
    const first = await assurance.append(
      "plan-1",
      { planId: "plan-1", body: { first: "one", second: "two" } },
      null,
    );
    const replay = await assurance.append(
      "plan-1",
      { planId: "plan-1", body: { second: "two", first: "one" } },
      null,
    );

    expect(replay).toEqual(first);
    await expect(assurance.read("plan-1")).resolves.toMatchObject({
      status: "ok",
      value: { entries: [expect.any(Object)] },
    });
  });

  it("exports and imports an assurance chain without changing its entries", async () => {
    const source = await stores();
    const destination = await stores();
    const first = await source.assurance.append(
      "plan-1",
      { planId: "plan-1", body: "first" },
      null,
    );
    const firstEntry = okValue(first);
    await source.assurance.append(
      "plan-1",
      { planId: "plan-1", body: "second" },
      firstEntry.entryDigest,
    );
    const exported = await source.assurance.exportChain("plan-1");
    const exportedChain = okValue(exported);
    expect(exportedChain).not.toBeNull();
    if (exportedChain === null) throw new Error("expected exported assurance chain");

    await expect(destination.assurance.importChain("plan-1", exportedChain)).resolves.toEqual(exported);
    await expect(destination.assurance.exportChain("plan-1")).resolves.toEqual(exported);
  });

  it("refuses an invalid assurance import without partially applying it", async () => {
    const source = await stores();
    const destination = await stores();
    const first = await source.assurance.append(
      "plan-1",
      { planId: "plan-1", body: "first" },
      null,
    );
    okValue(first);
    const exported = await source.assurance.exportChain("plan-1");
    const exportedChain = okValue(exported);
    expect(exportedChain).not.toBeNull();
    if (exportedChain === null) throw new Error("expected exported assurance chain");
    const invalid = {
      ...exportedChain,
      entries: [{ ...exportedChain.entries[0]!, predecessorDigest: canonicalDigest("wrong") }],
    };

    await expect(destination.assurance.importChain("plan-1", invalid)).resolves.toEqual({
      status: "refused",
      reason: "chain-invalid",
    });
    await expect(destination.assurance.read("plan-1")).resolves.toEqual({ status: "ok", value: null });
  });

  it("refuses assurance import when the destination already has a chain", async () => {
    const source = await stores();
    const destination = await stores();
    const sourceEntry = await source.assurance.append(
      "plan-1",
      { planId: "plan-1", body: "source" },
      null,
    );
    const destinationEntry = await destination.assurance.append(
      "plan-1",
      { planId: "plan-1", body: "destination" },
      null,
    );
    okValue(sourceEntry);
    okValue(destinationEntry);
    const exported = await source.assurance.exportChain("plan-1");
    const exportedChain = okValue(exported);
    expect(exportedChain).not.toBeNull();
    if (exportedChain === null) throw new Error("expected exported assurance chain");

    await expect(destination.assurance.importChain("plan-1", exportedChain)).resolves.toEqual({
      status: "refused",
      reason: "import-nonempty",
    });
    await expect(destination.assurance.read("plan-1")).resolves.toMatchObject({
      status: "ok",
      value: { entries: [{ value: { planId: "plan-1", body: "destination" } }] },
    });
  });

  it("distinguishes malformed, mismatched, and invalid persisted assurance chains", async () => {
    const records = await stores();
    const assuranceLocation = { root: "delivery", namespace: "assurance" } as const;
    await records.publisher.update(assuranceLocation, "plan-1.json", () => ({
      kind: "write",
      content: "{",
      result: undefined,
    }));
    await records.publisher.update(assuranceLocation, "plan-2.json", () => ({
      kind: "write",
      content: `${JSON.stringify({
        schemaVersion: 1,
        semanticsVersion: "delivery-assurance-store/v1",
        planId: "other-plan",
        entries: [],
        tailDigest: null,
      })}\n`,
      result: undefined,
    }));
    const validEntry = okValue(await records.assurance.append(
      "plan-3",
      { planId: "plan-3", body: "value" },
      null,
    ));
    await records.publisher.update(assuranceLocation, "plan-3.json", (raw) => {
      if (raw === null) throw new Error("expected persisted assurance chain");
      const envelope = JSON.parse(raw) as Record<string, unknown>;
      return {
        kind: "write",
        content: `${JSON.stringify({ ...envelope, tailDigest: canonicalDigest("wrong") })}\n`,
        result: undefined,
      };
    });

    await expect(records.assurance.read("plan-1")).resolves.toEqual({
      status: "refused",
      reason: "record-malformed",
    });
    await expect(records.assurance.read("plan-2")).resolves.toEqual({
      status: "refused",
      reason: "identity-mismatch",
    });
    await expect(records.assurance.read("plan-3")).resolves.toEqual({
      status: "refused",
      reason: "chain-invalid",
    });
    expect(validEntry.entryDigest).not.toBe(canonicalDigest("wrong"));
  });

  it("retains generation high-water marks across rematerialization and teardown", async () => {
    const records = await stores();
    const store = new RepositoryDeliveryAssignmentStore(records.publisher);
    const first = assignment(1);
    const rematerialized = assignment(2, { head: "b".repeat(40) });
    const tornDown = assignment(2, { materialized: false });
    const reauthored = assignment(3, { head: "c".repeat(40) });

    await expect(store.publish(ASSIGNMENT_PLAN_ID, first, 0)).resolves.toMatchObject({ status: "ok" });
    await expect(store.publish(
      ASSIGNMENT_PLAN_ID,
      assignment(1, { head: "b".repeat(40) }),
      1,
    )).resolves.toEqual({ status: "refused", reason: "version-conflict" });
    await expect(store.publish(ASSIGNMENT_PLAN_ID, rematerialized, 1)).resolves.toMatchObject({ status: "ok" });
    await expect(store.publish(
      ASSIGNMENT_PLAN_ID,
      assignment(1, { materialized: false }),
      2,
    )).resolves.toEqual({ status: "refused", reason: "version-conflict" });
    await expect(store.publish(ASSIGNMENT_PLAN_ID, tornDown, 2)).resolves.toMatchObject({ status: "ok" });
    await expect(store.publish(ASSIGNMENT_PLAN_ID, reauthored, 3)).resolves.toMatchObject({ status: "ok" });
    await expect(store.publish(
      ASSIGNMENT_PLAN_ID,
      assignment(2, { head: "d".repeat(40) }),
      4,
    )).resolves.toEqual({ status: "refused", reason: "version-conflict" });
  });

  it("resolves the same authoritative member by exact head or stored ref binding", async () => {
    const records = await stores();
    const value = assignment(1, { ref: "opaque-member-binding" });
    await records.assignments.publish(ASSIGNMENT_PLAN_ID, value, 0);
    const member = value.members[0]!;
    const expected = {
      status: "ok",
      value: {
        planId: ASSIGNMENT_PLAN_ID,
        deliverableId: member.deliverableId,
        workUnitId: value.workUnitId,
        assignment: value,
      },
    };

    await expect(records.assignments.resolveMember({
      selector: { kind: "head", objectId: member.assignedHeadObjectId },
    })).resolves.toEqual(expected);
    await expect(records.assignments.resolveMember({
      selector: {
        kind: "ref",
        ref: "opaque-member-binding",
        observedHeadObjectId: member.assignedHeadObjectId,
      },
    })).resolves.toEqual(expected);
    await expect(records.assignments.resolveMember({
      selector: { kind: "head", objectId: "f".repeat(40) },
    })).resolves.toEqual({ status: "ok", value: null });
  });

  it("refuses more than one authoritative member match", async () => {
    const records = await stores();
    const head = "a".repeat(40);
    await records.assignments.publish(ASSIGNMENT_PLAN_ID, assignment(1, { head }), 0);
    await records.assignments.publish(OTHER_ASSIGNMENT_PLAN_ID, assignment(1, {
      head,
      memberLabel: "member-2",
      planId: OTHER_ASSIGNMENT_PLAN_ID,
      workUnitId: "other-work-unit",
    }), 0);

    await expect(records.assignments.resolveMember({
      selector: { kind: "head", objectId: head },
    })).resolves.toEqual({ status: "refused", reason: "ambiguous-match" });
  });

  it("uses an owning-unit pointer as a candidate selector but still validates it", async () => {
    const records = await stores();
    const value = assignment(1);
    await records.assignments.publish(ASSIGNMENT_PLAN_ID, value, 0);
    const noScanPublisher: GitCommonStatePublisher = {
      read: records.publisher.read.bind(records.publisher),
      update: records.publisher.update.bind(records.publisher),
      list: async () => { throw new Error("assignment namespace scan should be bypassed"); },
    };
    const store = new RepositoryDeliveryAssignmentStore(noScanPublisher);

    await expect(store.resolveMember({
      selector: { kind: "head", objectId: value.members[0]!.assignedHeadObjectId },
      owningUnit: { planId: ASSIGNMENT_PLAN_ID, workUnitId: value.workUnitId },
    })).resolves.toMatchObject({ status: "ok", value: { planId: ASSIGNMENT_PLAN_ID } });
    await expect(store.resolveMember({
      selector: { kind: "head", objectId: value.members[0]!.assignedHeadObjectId },
      owningUnit: { planId: ASSIGNMENT_PLAN_ID, workUnitId: "wrong-work-unit" },
    })).resolves.toEqual({ status: "refused", reason: "identity-mismatch" });
  });
});
